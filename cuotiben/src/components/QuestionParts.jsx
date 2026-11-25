import React, { useId, useState } from 'react';
import { readingParagraphs } from '../core/review-choices.js';
import LearningText from './LearningText.jsx';
import { Icon } from './UI.jsx';

export function ReadingMaterial({ text }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="detail-material" aria-label="阅读材料">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <Icon name="book" />{open ? '收起材料' : '展开阅读材料'}<Icon name="right" />
    </button>
    <div id={id} className={open ? 'expanded' : undefined}>
      {readingParagraphs(text).map((p, i) => <p key={i} className="preserve"><LearningText text={p} /></p>)}
    </div>
  </section>;
}

export function DetailChoices({ choices, answer }) {
  return <section className="detail-choices" aria-label="题目选项">
    {choices.map(({ label, text }) => (
      <div className={'detail-choice' + (label === answer ? ' is-answer' : '')} key={label}>
        <b>{label}</b><div><LearningText text={text} />
          {label === answer && <small><Icon name="ok" />模型解答</small>}
        </div>
      </div>
    ))}
  </section>;
}
