import { assetBase } from '../core/host.js';
import React, { useEffect, useRef } from 'react';
const iconPaths = {
  book: 'M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1z M12 6v14',
  keyboard: 'M2 6h20v12H2z M5 10h1m3 0h1m3 0h1m3 0h1M7 14h10',
  magic: 'm3 18 11-11 3 3L6 21z M11 10l3 3 M18 2v4m-2-2h4M20 14v4m-2-2h4',
  undo: 'M9 6 4 11l5 5M5 11h8a6 6 0 0 1 6 6',
  redo: 'm15 6 5 5-5 5m4-5h-8a6 6 0 0 0-6 6',
  camera: 'M3 8h4l2-3h6l2 3h4v12H3z M16 13a4 4 0 1 1-8 0 4 4 0 1 1 8 0',
  text: 'M5 4h14v16H5z M8 9h8 M8 13h6 M8 17h4',
  right: 'm9 6 6 6-6 6',
  back: 'M20 12H4.5m7-7-7 7 7 7',
  lock: 'M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3',
  ok: 'm4 12 5 5L20 6',
  album: 'M3 4h18v16H3z M3 17l6-7 4 4 3-3 5 6',
  pencil: 'm4 16-1 5 5-1L21 7l-4-4z M14 6l4 4',
  frame: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  fit: 'M4 9V4h5m6 0h5v5M4 15v5h5m11-5v5h-5M8 8h8v8H8z',
  more: 'M5 12h.1M12 12h.1M19 12h.1',
  bulb: 'M8.5 15c0-2-2.5-3-2.5-6a6 6 0 0 1 12 0c0 3-2.5 4-2.5 6M9 16h6m-5 3h4m-3 2h2',
  pending: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  close: 'M6 6l12 12M18 6 6 18',
  mistake: 'M7 7l10 10M17 7 7 17',
  reset: 'M4 9a8 8 0 1 1 1 9M4 4v5h5',
  archive: 'M3 5h18v4H3z M5 9v11h14V9m-10 4h6',
  leaf: 'M3 15Q4 4 21 3q1 16-13 16z M5 20l10-11',
};
function Icon({ name }) {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  );
}
function MistakeCount({ count }) {
  return (
    <span className="mistake-count" role="img" aria-label={`累计答错 ${count} 次`}>
      <Icon name="mistake" />{count}次
    </span>
  );
}
function Companion({ pose = 'idle', place = '' }) {
  return (
    <img
      className={'companion ' + place}
      src={assetBase + 'brand/comma-' + pose + '.webp'}
      width="48"
      height="48"
      alt=""
      draggable="false"
    />
  );
}
function Entry({ icon, title, sub, onClick, gold }) {
  return (
    <button className="entry" onClick={onClick}>
      <span className={'iconbox ' + (gold ? 'gold ' : '') + (['camera', 'text'].includes(icon) ? 'illustrated' : '')}>
        {icon === 'camera' || icon === 'text' ? (
          <img width="60" height="43" src={assetBase + 'brand/' + (icon === 'camera' ? 'capture' : 'write') + '.webp'} alt="" />
        ) : (
          <Icon name={icon} />
        )}
      </span>
      <span className="text">
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      <Icon name="right" />
    </button>
  );
}
function Modal({ info, close }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  function cancel() {
    close();
    info.resume?.();
  }
  return (
    <dialog
      className="dialog"
      ref={ref}
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <span className="dialog-symbol" aria-hidden="true">
        {info.symbolImage ? <img src={info.symbolImage} width="28" height="28" alt="" /> :
          <Icon name={/放弃|移除/.test(info.yes) ? 'archive' : 'lock'} />}
      </span>
      <h2 id="dialog-title">{info.title}</h2>
      <p id="dialog-description">{info.text}</p>
      {info.detailsUrl && <a className="link" href={info.detailsUrl} target="_blank" rel="noreferrer">查看火山方舟数据条款</a>}
      <div className="actions">
        <button className="secondary" autoFocus onClick={cancel}>
          {info.cancel}
        </button>
        <button
          className={/放弃|移除/.test(info.yes) ? 'danger' : 'primary'}
          onClick={() => {
            close();
            info.go();
          }}
        >
          {info.yes}
        </button>
      </div>
    </dialog>
  );
}

const recordStages = ['录题', '看解析', '收录'];
const reviewStages = ['独立重做', '对照', '记下结果'];
const stageIndex = { crop: 0, edit: 0, result: 1, correct: 0, compare: 1, score: 2 };
function StageTrack({ page }) {
  const current = stageIndex[page];
  if (current === undefined) return null;
  const labels = ['correct', 'compare', 'score'].includes(page) ? reviewStages : recordStages;
  return (
    <ol className="stage-track" aria-label="当前进度">
      {labels.map((label, i) => (
        <li key={label} aria-current={i === current ? 'step' : undefined} className={i < current ? 'passed' : ''}>
          <span aria-hidden="true" className="stage-dot" />
          {label}
        </li>
      ))}
    </ol>
  );
}
export { Icon, MistakeCount, Companion, Entry, Modal, StageTrack };
