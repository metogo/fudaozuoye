import React, { useLayoutEffect, useRef } from 'react';
import StepRuler from './StepRuler.jsx';
import LearningText from './LearningText.jsx';
import { Companion, Icon } from './UI.jsx';

export default function Guidance({ d, level = d.lesson.steps.length + 2, show, source }) {
  const lesson = d.lesson,
    full = level > lesson.steps.length + 1;
  const region = useRef(null),
    pending = useRef(null);
  function reveal(next) {
    pending.current = next > lesson.steps.length + 1 ? 'check' : level === 0 ? 'hint' : 'step-' + level;
    show(next);
  }
  useLayoutEffect(() => {
    if (!pending.current) return;
    const target = region.current?.querySelector('[data-part="' + pending.current + '"]');
    pending.current = null;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [level]);
  return (
    <section ref={region} className="guidance" aria-label={source ? "逐步讲解" : "完整解析"}>
      {source && <header className="lesson-heading">
        <h2 id="detail-lesson-title">题目解析</h2>
        {!full && <button className="lesson-full" onClick={() => reveal(lesson.steps.length + 2)}>
          看完整解析<Icon name="right" />
        </button>}
      </header>}
      {level > 0 && (
        <>
          <div className="paper hint" tabIndex="-1" data-part="hint">
            <span className="hint-byline">
              <Companion pose="thinking" />
              <span className="eyebrow">{source ? '小逗号 · 试着接一步' : '小逗号 · 解题思路'}</span>
            </span>
            <p>
              <LearningText text={lesson.hint} />
            </p>
          </div>
          <div className="solution-steps">
            {lesson.steps.slice(0, Math.max(0, level - 1)).map((st, i) => (
              <section className="step" key={i} tabIndex="-1" data-part={'step-' + (i + 1)}>
                <small>第 {i + 1} 步</small>
                <p>
                  <LearningText text={st} />
                </p>
              </section>
            ))}
          </div>
        </>
      )}
      {full && (
        <div className="paper self-check" tabIndex="-1" data-part="check">
          {lesson.answer && !lesson.steps.at(-1)?.includes(lesson.answer) && (
            <><span className="eyebrow">模型解答</span>
              <p className="preserve"><LearningText text={lesson.answer} /></p>
            </>
          )}
          <span className="eyebrow">自己检查</span>
          <p className="preserve">
            <LearningText text={lesson.check} />
          </p>
          {d.teacher && (
            <>
              <hr className="rule" />
              <span className="eyebrow">老师的参考答案／解析</span>
              <p className="preserve">
                <LearningText text={d.teacher} />
              </p>
            </>
          )}
        </div>
      )}
      {full && <StepRuler region={region} lesson={lesson} />}
      {!full && (
        <div className="actions">
          <button className={source ? 'lesson-hint' : 'secondary'} onClick={() => reveal(level + 1)}>
            {source && <span className="lesson-hint-symbol"><Icon name="bulb" /></span>}
            {level === 0 ? '看提示' : level > lesson.steps.length ? '查看自检' : '看下一步'}
            {source && <Icon name="right" />}
          </button>
        </div>
      )}
      {source && level > 0 && <small className="lesson-source">讲解来源 · {source}</small>}
    </section>
  );
}
