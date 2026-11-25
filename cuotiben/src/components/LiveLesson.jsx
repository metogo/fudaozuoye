import React, { useLayoutEffect, useRef } from 'react';
import useLessonFollow from './useLessonFollow.js';
import './lesson-navigation.css';
import LearningText from './LearningText.jsx';
import { Companion } from './UI.jsx';

export default function LiveLesson({ job, lesson }) {
  const active = Boolean(job.preview);
  const { region, paused, resume } = useLessonFollow(active, lesson);
  const status = useRef(null);
  useLayoutEffect(() => {
    if (!active) return;
    status.current.focus({ preventScroll: true });
  }, [active]);
  if (!active) return null;
  const { hint, detail } = job.preview;
  return (
    <section ref={region} className="live-lesson" aria-label="正在生成的讲解">
      <div className="paper live-hint">
        <div className="hint-byline"><Companion pose="thinking" /><span className="eyebrow">小逗号 · 解题思路</span></div>
        {hint && <p className="preserve"><LearningText text={hint} /></p>}
        <small className="live-status" ref={status} tabIndex="-1" role="status">{job.busy}</small>
      </div>
      {detail && <section className="paper live-solution" aria-label="解题过程">
        <span className="eyebrow">解题过程</span>
        <div className="preserve"><LearningText text={detail} /></div>
      </section>}
      {paused && <button className="follow-latest" onClick={resume}>跟随最新内容 ↓</button>}
    </section>
  );
}
