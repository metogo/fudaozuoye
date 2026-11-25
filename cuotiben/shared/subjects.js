export const subjects = {
  chinese: '语文', math: '数学', english: '英语', physics: '物理', chemistry: '化学',
  biology: '生物', history: '历史', geography: '地理', politics: '道德与法治／政治', science: '科学',
};
const customSubject = /^label:([\p{L}][\p{L}\p{N} ·&/+.-]{0,23})$/u;
export function recognizedSubject(value) {
  if (typeof value !== 'string') return 'unknown';
  const label = value.normalize('NFKC').trim().replace(/^(?:小学|初中|高中|大学)\s*/u, '')
    .replace(/\s*\([^()]+\)$/u, '').trim();
  const named = Object.entries(subjects).find(([id, name]) => id === label.toLowerCase() || name.split('／').includes(label));
  if (named) return named[0];
  if (['几何', '立体几何', '平面几何', '解析几何', '代数'].includes(label)) return 'math';
  if (/^(?:unknown|other|unspecified|none|null|N\/A|未知|其他|其它|不详|无法确定|未分类|不确定|不明)$/iu.test(label)) return 'unknown';
  return subjectKey('label:' + label);
}
export function subjectKey(value) {
  if (typeof value === 'string' && customSubject.test(value)) return value;
  return typeof value === 'string' && Object.hasOwn(subjects, value) ? value : 'unknown';
}
export function subjectName(key) {
  return subjects[subjectKey(key)] || customSubject.exec(key)?.[1] || '未分类';
}
