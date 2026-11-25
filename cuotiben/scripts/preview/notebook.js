import records from './public-lessons.json';
import { list, saveQuestion, saveAttempt } from '../../src/core/book.ts';

async function openPreview() {
  const status = document.querySelector('#status');
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) {
    status.textContent = '请从本机开发地址打开。';
    return;
  }
  const existing = new Set((await list()).map(row => row.id));
  for (const { correction, ...record } of records) {
    if (!existing.has(record.id))
      await saveQuestion({ ...record, date: Date.now(), img: '', attempts: [], source: '公开真题预览' });
    if (correction)
      await saveAttempt(record.id, {
        id: record.id + '-review', date: Date.now(), answer: '预览订正：' + correction, paper: false, correct: true,
      });
  }
  const imported = (await list()).filter(row => records.some(record => record.id === row.id));
  if (imported.length !== records.length) throw Error('本机写入尚未完成，请刷新重试。');
  location.replace('/');
}
openPreview().catch(error => { document.querySelector('#status').textContent = error.message; });
