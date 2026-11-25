import React, { useLayoutEffect, useRef } from 'react';
import { Icon } from './UI.jsx';
import InkSheet from './InkSheet.jsx';

export function WritingSurface({ strokes, arranged, typeset, onBegin, onStroke }) {
  return <div className="ink-surface">
    <InkSheet strokes={strokes} arranged={arranged} typeset={typeset} onBegin={onBegin} onStroke={onStroke} />
    {!strokes.length && <span className="ink-placeholder">在这里写字、列式或画图</span>}
  </div>;
}

export function PenTools({ autoTypeset, toggleTypeset, undo, redo, canUndo, canRedo }) {
  return <div className="ink-tools pen-tools" role="group" aria-label="书写工具">
    <button type="button" aria-label="停笔美化" title="停笔美化 · 豆包识别本页笔迹，保留原稿" aria-pressed={autoTypeset} onClick={toggleTypeset}><Icon name="magic" />{!autoTypeset && <span>豆包美化</span>}</button>
    <button type="button" aria-label="撤销" title="撤销" disabled={!canUndo} onClick={undo}><Icon name="undo" /></button>
    <button type="button" aria-label="重做" title="重做" disabled={!canRedo} onClick={redo}><Icon name="redo" /></button>
  </div>;
}

export function InkWorkspace({ surface, tools, status, close }) {
  const dialog = useRef(null);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node.open) node.showModal();
  }, []);
  return <dialog ref={dialog} className="ink-workspace" aria-labelledby="ink-workspace-title" onClose={close}>
    <header><h2 id="ink-workspace-title">全屏书写</h2>
      <button type="button" className="ink-done" onClick={() => dialog.current.close()}>完成</button>
    </header>
    <WritingSurface {...surface} />
    <footer className="ink-format-footer"><PenTools {...tools} />{status}</footer>
  </dialog>;
}
