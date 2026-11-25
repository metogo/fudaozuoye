import React from 'react';
import { Companion, Icon } from './UI.jsx';
import { subjectName } from '../../shared/subjects.js';

const scenes = { 全部: 'first-page', 待订正: 'to-correct', 已订正: 'archive-page' };

export default function NotebookEmpty({ filter, subject, grouped, hasOtherSubjects, record, selectFilter, reset, open }) {
  const scoped = subject !== 'all';
  const name = scoped ? subjectName(subject) : '';
  const pending = filter === '待订正';
  const scene = scenes[filter];
  let title, description, label, action;
  if (!grouped.length && hasOtherSubjects) {
    title = name + '还没有收录错题';
    description = '可以先看看其他学科已经收录的题。';
    label = '查看全部错题';
    action = reset;
  } else if (grouped.length && pending) {
    title = name + '错题都订正好了';
    description = '之前做过的题，还可以回头再练。';
    label = '回看已订正的题';
    action = () => selectFilter('已订正');
  } else if (grouped.length) {
    title = name + '还没有已订正的题';
    description = '从最近的一道开始，独立再做一遍。';
    label = '开始订正';
    action = () => open(grouped[0], 'correct');
  } else {
    title = { 全部: '从第一道错题开始', 待订正: '还没有待订正的题', 已订正: '还没有已订正的题' }[filter];
    description = {
      全部: '拍下作业，或粘贴老师发来的题目。',
      待订正: '录入错题后，就能在这里重新做一遍。',
      已订正: '录入的错题订正做对后，会收在这里。',
    }[filter];
    label = '录入第一题';
    action = record;
  }
  return <section className={'empty-book ' + scene} aria-labelledby="empty-title">
    <div className="notebook-vignette" aria-hidden="true">
      <span className="vignette-page"><i /><b /></span>
      <span className="vignette-mark"><Icon name={pending ? (grouped.length ? 'ok' : 'pending') : filter === '全部' ? 'pencil' : 'archive'} /></span>
      <Companion pose={pending && grouped.length ? 'ready' : 'idle'} />
    </div>
    <h2 id="empty-title">{title}</h2>
    <p>{description}</p>
    <button type="button" className="empty-action" onClick={action}>{label}<Icon name="right" /></button>
  </section>;
}
