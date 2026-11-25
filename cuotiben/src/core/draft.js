export const newDraft = () => ({
  id: crypto.randomUUID(),
  model: 'doubao',
  q: '',
  child: '',
  teacher: '',
  img: '',
  box: null,
  source: '粘贴题目',
});
export function questionEntry(ref, signature) {
  if (ref.current?.signature !== signature) ref.current = { signature, id: crypto.randomUUID() };
  return ref.current;
}

// A parent can expand a crop to recover a missing line. A disjoint selection
// must never inherit the previous question's answer or the teacher's notes.
export function overlapsQuestion(a, b) {
  if (!a || !b) return false;
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return width > 0 && height > 0 && width * height > Math.min(a.w * a.h, b.w * b.h) / 2;
}
