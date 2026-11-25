import React, { useRef } from 'react';
import { subjects, subjectKey, subjectName } from '../../shared/subjects.js';
import { Icon } from './UI.jsx';

export default function ReviewSettings({ subject, busy, setSubject, remove }) {
  const sheet = useRef(null);
  const selected = subjectKey(subject);
  function choose(key) {
    sheet.current.close();
    if (key !== selected) setSubject(key);
  }
  return <>
    <button className="settings-trigger" aria-label="题目设置" title="题目设置" aria-haspopup="dialog"
      disabled={busy} onClick={() => sheet.current.showModal()}><Icon name="more" /></button>
    <dialog className="subject-sheet" ref={sheet} aria-labelledby="subject-settings-title">
      <header>
        <h2 id="subject-settings-title">题目设置</h2>
        <button aria-label="关闭" className="sheet-close" onClick={() => sheet.current.close()}><Icon name="close" /></button>
      </header>
      <fieldset>
        <legend>本题学科</legend>
        <div className="subject-options">
          {Object.entries({ ...subjects, [selected]: subjectName(selected), unknown: '未分类' }).map(([key, name]) => (
            <button key={key} value={key} aria-pressed={key === selected} onClick={() => choose(key)}>
              {name}{key === selected && <Icon name="ok" />}
            </button>
          ))}
        </div>
      </fieldset>
      <button className="settings-remove" onClick={() => { sheet.current.close(); remove(); }}>
        <Icon name="archive" />移除这道题
      </button>
    </dialog>
  </>;
}
