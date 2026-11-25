import React, { useEffect, useRef } from 'react';
import { Icon } from './UI.jsx';
import './record-sheet.css';

export default function RecordSheet({ close, photo, text }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog ref={dialog} className="record-sheet" aria-labelledby="record-heading"
      onClick={e => { if (e.target === dialog.current) close(); }}
      onCancel={e => { e.preventDefault(); close(); }}>
      <div className="record-surface">
        <header className="record-heading">
          <h2 id="record-heading">录题</h2>
          <button className="record-close" aria-label="取消" onClick={close}><Icon name="close" /></button>
        </header>
        <div className="record-methods">
          <button className="record-camera" aria-label="拍照圈题" aria-describedby="record-camera-tip" onClick={() => photo(true)}>
            <span className="record-camera-copy">
              <strong>拍照圈题</strong>
              <small id="record-camera-tip">拍一张，可连续圈多道题</small>
            </span>
            <span className="record-camera-art" aria-hidden="true">
              <span className="record-worksheet"><i /></span>
              <Icon name="frame" />
              <span className="record-camera-stamp"><Icon name="camera" /></span>
            </span>
          </button>
          <button className="record-source record-album" onClick={() => photo(false)}>
            <span className="record-source-icon" aria-hidden="true"><Icon name="album" /></span>
            从相册选
          </button>
          <button className="record-source record-paste" onClick={text}>
            <span className="record-source-icon" aria-hidden="true"><Icon name="text" /></span>
            粘贴题目
          </button>
        </div>
      </div>
    </dialog>
  );
}
