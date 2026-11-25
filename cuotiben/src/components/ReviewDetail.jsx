import React from 'react';
import { reviewChoices } from '../core/review-choices.js';
import { subjectName } from '../../shared/subjects.js';
import { modelName } from '../../shared/models.js';
import { corrected, countMistakes } from '../core/book.ts';
import { Icon, MistakeCount } from './UI.jsx';
import { ReadingMaterial, DetailChoices } from './QuestionParts.jsx';
import Guidance from './Guidance.jsx';
import QuestionSheet from './QuestionSheet.jsx';
import AttemptAnswer from './AttemptAnswer.jsx';
import LearningText from './LearningText.jsx';
import './review-detail.css';

const addedDate = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });

function QuestionMeta({ question }) {
  return <div className="detail-meta">
    <span className="detail-subject">{subjectName(question.subject)}</span>
    <small>{addedDate.format(question.date)} 收录</small>
    <MistakeCount count={countMistakes(question.attempts)} />
  </div>;
}

function AnswerRecord({ question }) {
  const attempts = question.attempts ?? [];
  const latest = attempts.at(-1);
  return <section className="detail-answer" aria-labelledby="detail-answer-title">
    <div className="detail-section-title">
      <h2 id="detail-answer-title">我的作答</h2>
      {latest && <small>订正 {attempts.length} 次 · 自评做对 {attempts.filter(a => a.correct).length} 次</small>}
    </div>
    {question.child && <details>
      <summary>查看原作答</summary>
      <p className="preserve"><LearningText text={question.child} /></p>
    </details>}
    {latest && <details>
      <summary>最近一次订正</summary>
      <AttemptAnswer attempt={latest} />
    </details>}
    {!question.child && !latest && <p className="detail-empty">暂未记录作答</p>}
  </section>;
}

export default function ReviewDetail({ d, level, setLevel, correct, error }) {
  const done = corrected(d);
  const parts = reviewChoices(d.q);
  const full = level > d.lesson.steps.length + 1;
  return <div className="detail-body">
    <div className="detail-spread study-spread">
      <div className="detail-source study-source" role="region" aria-label="原题" tabIndex="0">
        <QuestionSheet question={d} metadata={<QuestionMeta question={d} />}>
          {parts && <>
            <p className="stem"><LearningText text={parts.stem} /></p>
            {parts.material && <ReadingMaterial key={d.id} text={parts.material} />}
          </>}
        </QuestionSheet>
      </div>
      <div className="detail-task study-task">
        {parts && <DetailChoices choices={parts.choices} answer={full ? d.lesson.answer?.trim() : undefined} />}
        <AnswerRecord question={d} />
        <section className="detail-lesson" aria-labelledby="detail-lesson-title">
          <Guidance d={d} level={level} show={setLevel}
            source={d.lesson.provider === 'doubao' ? '豆包' : modelName(d.lesson.modelId)} />
        </section>
        {error && <p className="alert" role="alert">{error}</p>}
      </div>
    </div>
    <footer className="detail-dock">
      <span className={'detail-status' + (done ? ' is-done' : '')}>
        <Icon name={done ? 'ok' : 'pending'} />{done ? '已订正' : '待订正'}
      </span>
      <button className="detail-correct" onClick={correct}>{done ? '再次订正' : '去订正'}<Icon name="right" /></button>
    </footer>
  </div>;
}
