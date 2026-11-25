import React, { useState } from 'react';
import { ReadingMaterial, DetailChoices } from './QuestionParts.jsx';
import { reviewChoices } from '../core/review-choices.js';
import InkEditor from './InkEditor.jsx';
import AttemptAnswer from './AttemptAnswer.jsx';
import './handwriting.css';
import QuestionSheet from './QuestionSheet.jsx';
import { Icon } from './UI.jsx';
import LearningText from './LearningText.jsx';
export default function Correction({ d, draft, setDraft, check, compare, finish, error }) {
  const [mode, setMode] = useState('text');
  const ink = draft.ink ?? { strokes: [], transcript: '' };
  const parts = reviewChoices(d.q);
  const hasAnswer = Boolean(draft.answer.trim() || ink.strokes.length || ink.transcript?.trim());
  return (
    <>
      <div className="study-spread">
        <div className="study-source" role="region" aria-label="原题与作答" tabIndex="0">
          <QuestionSheet question={d}>
            {parts && <>
              <p className="stem"><LearningText text={parts.stem} /></p>
              <DetailChoices choices={parts.choices} />
              {parts.material && <ReadingMaterial key={d.id} text={parts.material} />}
            </>}
          </QuestionSheet>
          {compare && (
            <section className="paper child-note">
              <span className="eyebrow">
                <Icon name="pencil" />
                这次的作答
              </span>
              <AttemptAnswer attempt={draft} />
            </section>
          )}
        </div>
        <div className="study-task">
          {compare ? (
            <>
              <section className="paper solution-note">
                <span className="eyebrow">
                  <Icon name="book" />
                  参考解法
                </span>
                <p className="stem"><LearningText text={d.lesson.answer || d.lesson.steps.at(-1)} /></p>
                <details className="comparison-steps">
                  <summary>查看解题步骤和自检</summary>
                  {(d.lesson.answer ? d.lesson.steps : d.lesson.steps.slice(0, -1)).map((step, i) => (
                    <p key={i}><LearningText text={step} /></p>
                  ))}
                  <p><LearningText text={d.lesson.check} /></p>
                </details>
                {d.teacher && (
                  <>
                    <hr className="rule" />
                    <small>老师的参考答案／解析</small>
                    <p>
                      <LearningText text={d.teacher} />
                    </p>
                  </>
                )}
              </section>
              <div className="self-assess">
                <h3>对照后，这次做对了吗？</h3>
                <p className="softline">按你的自评更新订正状态。</p>
                <div className="footer-act">
                  <button className="secondary" onClick={() => finish(false)}>
                    还要再练
                  </button>
                  <button className="primary" onClick={() => finish(true)}>
                    这次做对了
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="paper answer-pad">
              <div className="answer-heading">
                <h2>我的作答</h2>
                <div className="answer-modes" role="group" aria-label="作答方式">
                  <button aria-label="文字" title="文字输入" aria-pressed={mode === 'text'} onClick={() => setMode('text')}><Icon name="keyboard" /></button>
                  <button aria-label="白板" title="白板手写" aria-pressed={mode === 'ink'} onClick={() => setMode('ink')}><Icon name="pencil" /></button>
                </div>
              </div>
              {mode === 'text' ? <textarea className="answer-input" aria-label="这次的作答" rows="3"
                value={draft.answer} placeholder="写下答案或关键一步"
                onChange={e => setDraft({ ...draft, answer: e.target.value })} />
                : <InkEditor ink={ink} change={value => setDraft({ ...draft, ink: value })} />}
              <div className="footer-act">
                <button className="primary" onClick={() => check(!hasAnswer)}>
                  {hasAnswer ? '对照答案' : '已在纸上做完，对照答案'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
