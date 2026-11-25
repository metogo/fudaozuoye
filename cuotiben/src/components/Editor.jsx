import React, { useEffect, useRef, useState } from 'react';
import LearningText from './LearningText.jsx';
import { formulaParts } from '../core/formulas.js';
import { modelName } from '../../shared/models.js';
import { Icon } from './UI.jsx';
import { splitMessage, missingInput, questionChoices } from '../core/message.js';
export default function Editor({ d, update, generate, notice, error, selectPhoto, reframe, focusField }) {
  const [assignedText, rememberAssignment] = useState('');
  const tail = assignedText === d.q ? '' : unassignedTail(d.q)?.[1];
  const [editing, setEditing] = useState(() => focusField.current === 'question' || !d.img || !d.q || splitMessage(d.q).multi);
  const choices = questionChoices(d.q);
  const stemField = useRef(null);
  useEffect(() => {
    if (focusField.current === 'question') {
      focusField.current = null;
      stemField.current?.focus();
    }
  }, [focusField]);
  function editStem() {
    setEditing(true);
    requestAnimationFrame(() => stemField.current?.focus());
  }
  const replaceQ = (raw) => {
    const parts = splitMessage(raw);
    update(
      parts.multi ? { q: raw } : { q: parts.q, ...(parts.teacher !== undefined ? { teacher: parts.teacher } : {}) },
    );
    notice('');
  };
  function submit() {
    const reason = missingInput(d.q);
    if (reason) {
      notice(reason);
      if (!editing) editStem();
      return;
    }
    generate();
  }
  function assign(target) {
    if (target === '题目') rememberAssignment(d.q);
    else
      update({
        q: d.q.slice(0, d.q.lastIndexOf('\n')).trim(),
        ...(target === '孩子作答'
          ? { child: [d.child, tail].filter(Boolean).join('\n') }
          : target === '老师答案'
            ? { teacher: [d.teacher, tail].filter(Boolean).join('\n') }
            : {}),
      });
    notice('');
  }
  return (
    <>
      <div className="review-sheet">
        <div className="manuscript">
          <QuestionInput
            value={d.q} editing={editing} field={stemField}
            change={q => update({ q })}
            commit={(text) => { if (!tail) replaceQ(text); }}
            pasteMessage={(text, formatted) => {
              const parts = splitMessage(text);
              if (!d.q && !d.img && !parts.multi && !missingInput(parts.q) && !unassignedTail(parts.q)) {
                generate({ ...d, q: parts.q, teacher: parts.teacher ?? d.teacher });
                return;
              }
              replaceQ(text);
              setEditing(!formatted);
            }}
          />
          <div className="question-tools">
            {!editing && <button className="link" onClick={editStem}><Icon name="pencil" />修改题目</button>}
            {d.img ? (
              <details className="original-photo" open={!d.recognizedText || undefined}>
                <summary>对照原图</summary>
                <img className="proof" src={d.img} alt="本题选区" />
                <button className="link" onClick={reframe}>重新圈题</button>
              </details>
            ) : <button className="link" onClick={selectPhoto}><Icon name="album" />改用截图圈题</button>}
          </div>
          {choices.length > 0 && (
            <div className="question-choices">
              <p>这次收哪一道？</p>
              {choices.map((text, i) => (
                <button
                  key={i}
                  className="secondary"
                  onClick={() => {
                    const parts = splitMessage(text);
                    update({ q: parts.q, teacher: parts.teacher || '', child: '', detectedWork: '' });
                  }}
                >
                  {text.split('\n')[0].slice(0, 55)}
                </button>
              ))}
            </div>
          )}
        </div>
        <AnswerFields d={d} update={update} focusField={focusField} />

        {tail && (
          <div className="alert">
            “{tail}”属于哪一部分？
            <div className="actions">
              {['题目', '老师答案', '孩子作答', '移除'].map((t) => (
                <button className="link" key={t} onClick={() => assign(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="review-submit">
        <button className="primary" disabled={!d.q.trim()} onClick={submit}>
          生成解析
        </button>
      </div>
      <p className="send-notice">{!d.q && !d.img ? '粘贴整题即发送' : '点击解析即发送'}{d.child.trim() ? '题目和孩子作答' : '题目'}给{d.model === 'doubao' ? '豆包' : 'Requesty 的 ' + modelName(d.model)}。</p>
    </>
  );
}

function unassignedTail(text) {
  return text.match(/\n\s*(\d+(?:\.\d+)?\s*(?:厘米|米|毫升|支)?)\s*$/);
}

function QuestionInput({ value, editing, field, change, commit, pasteMessage }) {
  if (!editing) return (
    <section className="reviewed-question" aria-label="题目内容">
      <p className="stem"><LearningText text={value} /></p>
    </section>
  );
  function paste(event) {
    const input = event.currentTarget;
    const raw = event.clipboardData.getData('text');
    const replacesQuestion = input.selectionStart === 0 && input.selectionEnd === value.length;
    if (!replacesQuestion) return;
    const parts = splitMessage(raw);
    const formatted = !parts.multi && formulaParts(parts.q).some(part => part.formula);
    if (value && !formatted && !parts.multi && parts.teacher === undefined) return;
    event.preventDefault();
    pasteMessage(raw, formatted);
  }
  return (
    <label className="field">
      <textarea aria-label="题目内容"
        ref={field} value={value} rows="3" placeholder="粘贴或输入题目"
        onPaste={paste} onChange={(event) => change(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
      />
    </label>
  );
}

function AnswerFields({ d, update, focusField }) {
  const child = useRef(null);
  const hasAnswer = Boolean(d.child || d.teacher || d.detectedWork);
  const [open, setOpen] = useState(() => hasAnswer || focusField.current === 'child');
  useEffect(() => {
    if (hasAnswer) setOpen(true);
  }, [hasAnswer]);
  useEffect(() => {
    if (!open || focusField.current !== 'child') return;
    const frame = requestAnimationFrame(() => {
      focusField.current = null;
      child.current.focus();
      child.current.setSelectionRange(child.current.value.length, child.current.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusField, open]);
  return (
    <section className="review-answers">
      <button className="answers-toggle" aria-expanded={open} aria-controls="answer-fields" onClick={() => setOpen(!open)}>
        <Icon name="pencil" />{hasAnswer ? '作答与参考答案' : '补充作答或参考答案'}<Icon name="right" />
      </button>
      <div className="attribution" id="answer-fields" hidden={!open}>
        <label className="field">孩子的原作答
          <textarea rows="2" ref={child} value={d.child} placeholder="答案，或卡住的那一步" onChange={e => update({ child: e.target.value })} />
        </label>
        {d.detectedWork && !d.child && (
          <div className="detected-work">
            <small>图中这段是孩子的作答吗？</small>
            <p className="preserve">{d.detectedWork}</p>
            <button className="link" onClick={() => update({ child: d.detectedWork, detectedWork: '' })}>这是孩子的作答</button>
            <button className="link" onClick={() => update({ detectedWork: '' })}>忽略</button>
          </div>
        )}
        <label className="field">老师的参考答案
          <textarea rows="2" value={d.teacher} onChange={e => update({ teacher: e.target.value })} />
        </label>
      </div>
    </section>
  );
}
