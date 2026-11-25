import React, { useState } from 'react';
import { Icon } from './UI.jsx';
import LearningText from './LearningText.jsx';
import { InkWorkspace, PenTools, WritingSurface } from './InkWorkspace.jsx';
import { useInkArrangement } from './useInkArrangement.js';

export default function InkEditor({ ink, change }) {
  const { strokes, transcript, proposedText, autoTypeset } = ink;
  const [expanded, setExpanded] = useState(false), [redo, setRedo] = useState([]);
  const [proof, setProof] = useState(null);
  const arrangement = useInkArrangement(ink, change, Boolean(proof));
  function replace(next, undone) {
    arrangement.end();
    setRedo(undone);
    change({ ...ink, strokes: next, proposedText: arrangement.previousText(next), transcriptNeedsReview: Boolean(transcript) });
  }
  function switchMode(update) {
    arrangement.interrupt();
    change({ ...ink, ...update });
  }
  const surface = {
    strokes, arranged: arrangement.arranged, typeset: arrangement.typeset,
    onBegin: arrangement.begin, onStroke: stroke => replace([...strokes, stroke], []),
  };
  const tools = {
    autoTypeset: Boolean(autoTypeset),
    toggleTypeset: () => switchMode({ autoTypeset: !autoTypeset }),
    canUndo: strokes.length > 0, undo: () => replace(strokes.slice(0, -1), [...redo, strokes.at(-1)]),
    canRedo: redo.length > 0, redo: () => replace([...strokes, redo.at(-1)], redo.slice(0, -1)),
  };
  const proofText = proposedText || transcript;
  function inspect() {
    arrangement.interrupt();
    setProof({ text: proofText, strokes });
  }
  const status = <div className="ink-format-status">
    {proof ? <div className="ink-proof">
      <label>对照原稿，核对排版文字
        <textarea rows="2" value={proof.text} onChange={e => setProof({ ...proof, text: e.target.value })} />
      </label>
      <div className="ink-tools">
        <button type="button" disabled={!proof.text.trim() || proof.strokes !== strokes} onClick={() => {
          change({ ...ink, transcript: proof.text.trim(), proposedText: '', transcriptNeedsReview: false });
          setProof(null);
        }}>确认排版稿</button>
        <button type="button" onClick={() => setProof(null)}>取消校对</button>
      </div>
      {proof.strokes !== strokes && <small>笔迹已更新，请退出校对后重新查看。</small>}
    </div> : <>
      {arrangement.localDraft ? <small role="status">算式预览 · 正在核对</small> :
        arrangement.busy && <small role="status">正在整理手写内容…</small>}
      {proofText && <div className="ink-format-review">
        <button type="button" aria-label="校对文字" onClick={inspect}>
          <Icon name={proposedText || ink.transcriptNeedsReview ? 'text' : 'ok'} />
          {proposedText ? '核对排版' : ink.transcriptNeedsReview ? '核对旧稿' : '已核对'}<Icon name="right" />
        </button>
      </div>}
      {transcript && (ink.transcriptNeedsReview || !arrangement.typeset) &&
        <details className="ink-previous"><summary>查看已保存的排版稿</summary>
          <p className="preserve"><LearningText text={transcript} /></p></details>}
    </>}
    {arrangement.error && <div className="ink-format-error" role="alert">{arrangement.error}
      <button type="button" onClick={arrangement.retry}>重新排版</button>
    </div>}
  </div>;
  return <div className="ink-editor">
    <WritingSurface {...surface} />
    <div className="ink-inline-controls">
      <PenTools {...tools} />
      <button type="button" className="ink-expand" title="全屏书写" aria-label="全屏书写" aria-haspopup="dialog" onClick={() => setExpanded(true)}><Icon name="frame" /></button>
    </div>
    {!expanded && status}
    {expanded && <InkWorkspace surface={surface} tools={tools} status={status} close={() => { arrangement.release(); setExpanded(false); }} />}
  </div>;
}
