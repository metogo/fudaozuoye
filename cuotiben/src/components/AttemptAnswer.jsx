import React from 'react';
import InkSheet from './InkSheet.jsx';
import LearningText from './LearningText.jsx';

export default function AttemptAnswer({ attempt }) {
  const hasInk = Boolean(attempt.ink?.strokes.length);
  return <>
    {attempt.answer?.trim() && <p className="preserve">{attempt.answer}</p>}
    {(hasInk || attempt.ink?.transcript) && <div className="saved-ink">
      {attempt.ink.transcript && <><small>{attempt.ink.transcriptNeedsReview ? '先前的排版稿 · 待核对' : '已核对的手写文字'}</small>
        <p className="preserve"><LearningText text={attempt.ink.transcript} /></p></>}
      {attempt.ink.proposedText && <><small>自动排版 · 待核对</small>
        <p className="preserve"><LearningText text={attempt.ink.proposedText} /></p></>}
      {hasInk && <InkSheet strokes={attempt.ink.strokes} />}
    </div>}
    {!attempt.answer?.trim() && !hasInk && !attempt.ink?.transcript && <p className="preserve">已在纸上完成</p>}
  </>;
}
