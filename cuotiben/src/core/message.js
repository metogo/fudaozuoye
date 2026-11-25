const questionStart = /^\s*(?:第\s*[一二三四五六七八九十百\d]+\s*[题題][、.．：:]?|\d+\s*[、．]|\d+\.(?!\d))\s*/gmu;
const referenceLabel = /(?:老师的|老師的)?(?:参考答案|參考答案|解析)\s*[：:]/gu;

export function questionChoices(raw) {
  const starts = [...raw.matchAll(questionStart)];
  if (starts.length < 2) return [];
  // A passage or a combined answer key may apply to more than one question.
  // Keep it in the original editor for the parent to allocate explicitly.
  if (raw.slice(0, starts[0].index).trim()) return [];
  const chunks = starts.map((start, i) => raw.slice(start.index, starts[i + 1]?.index).trim());
  const hasReferences = chunks.some((chunk) => Array.from(chunk.matchAll(referenceLabel)).length);
  if (hasReferences && !chunks.every((chunk) => Array.from(chunk.matchAll(referenceLabel)).length === 1)) return [];
  return chunks;
}
export function splitMessage(raw) {
  const stems = [...raw.matchAll(questionStart)];
  const references = [...raw.matchAll(referenceLabel)];
  if (stems.length > 1 || references.filter((label) => /参考答案|參考答案/.test(label[0])).length > 1)
    return { multi: true };
  const label = references[0];
  if (!label) return { q: raw };
  return { q: raw.slice(0, label.index).trim(), teacher: raw.slice(label.index + label[0].length).trim() };
}
export function missingInput(raw) {
  if (!raw.trim()) return '请先粘贴或输入一道题。';
  if (raw.length > 8000) return '一道题最多可提交 8000 个字符，请保留该题和必要材料。';
  return '';
}
