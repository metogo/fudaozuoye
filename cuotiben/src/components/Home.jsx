import React, { useEffect, useRef, useState } from 'react';
import { Icon, MistakeCount } from './UI.jsx';
import { tutorHome } from '../core/host.js';
import BookHeading from './BookHeading.jsx';
import NotebookEmpty from './NotebookEmpty.jsx';
import StorageInfo from './StorageInfo.jsx';
import LearningText from './LearningText.jsx';
import { corrected } from '../core/book.ts';
import { subjectKey, subjectName } from '../../shared/subjects.js';

const shortDate = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });

function NotebookHeader({ record, active }) {
  return (
    <header className="notebook-title">
      <BookHeading active={active} />
      <a className="tutor-return" href={tutorHome} aria-label="返回辅导作业首页">
        <Icon name="home" />
      </a>
      <button type="button" className="record-trigger" onClick={record}>
        <Icon name="pencil" />录题
      </button>
    </header>
  );
}

function ListEndFade() {
  const end = useRef(null);
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setMoreBelow(entry.boundingClientRect.bottom > entry.rootBounds.bottom);
    }, { threshold: 1 });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, []);
  return <>
    <span ref={end} className="list-end-marker" aria-hidden="true" />
    {moreBelow && <span className="list-end-fade" aria-hidden="true" />}
  </>;
}

function QuestionList({ visible, open }) {
  return <div className="list">{visible.map(row => {
    const done = corrected(row);
    return <article className="notebook-row" key={row.id}>
      <button type="button" className="sheet-row" onClick={() => open(row)}>
        <LearningText text={row.q} preview />
      </button>
      <div className="question-footer">
        <span className="question-meta">
          <small>{subjectName(row.subject)} · {shortDate.format(row.date)}</small>
          <span className={'state ' + (done ? 'finished' : '')}>{done ? '已订正' : '待订正'}</span>
          <MistakeCount count={row.mistakeCount} />
        </span>
        {!done && <button type="button" className="quick-correct" onClick={() => open(row, 'correct')}>
          去订正<Icon name="right" />
        </button>}
      </div>
    </article>;
  })}<ListEndFade /></div>;
}

export default function Home({ active = true, rows, loading, open, record, error, filter, selectFilter, subject, selectSubject }) {
  const present = new Set(rows.map(row => subjectKey(row.subject)));
  if (subject !== 'all') present.add(subject);
  const grouped = subject === 'all' ? rows : rows.filter(row => subjectKey(row.subject) === subject);
  const finished = grouped.filter(corrected).length;
  const counts = { 全部: grouped.length, 待订正: grouped.length - finished, 已订正: finished };
  const visible = grouped.filter(row => filter === '全部' || corrected(row) === (filter === '已订正'));
  return (
    <>
      <section className="notebook-home" aria-labelledby="book-title">
        <NotebookHeader record={record} active={active} />
        <div className="notebook-library">
          <div className="notebook-toolbar">
            <div className="filters" role="group" aria-label="订正状态">
              {Object.entries(counts).map(([name, count]) => <button key={name} aria-pressed={filter === name}
                onClick={() => selectFilter(name)}>{name} <b>{loading || error ? '—' : count}</b></button>)}
            </div>
            {rows.length > 0 && <div className="library-order">
            <select className="subject-filter" aria-label="按学科筛选" value={subject} onChange={e => selectSubject(e.target.value)}>
              <option value="all">全部学科</option>
              {[...present].map(id =>
                <option key={id} value={id}>{subjectName(id)}</option>)}
            </select>
            {visible.length > 0 && <small>最近收录在前</small>}
            </div>}
          </div>
          {error ? <p className="alert" role="alert">{error}</p> : loading ?
            <p role="status">正在读取错题本…</p> :
            visible.length ? <QuestionList visible={visible} open={open} /> :
            <NotebookEmpty filter={filter} subject={subject} grouped={grouped} hasOtherSubjects={rows.length > grouped.length}
              record={record} selectFilter={selectFilter} open={open}
              reset={() => { selectSubject('all'); selectFilter('全部'); }} />}
        </div>
      </section>
      <StorageInfo />
    </>
  );
}
