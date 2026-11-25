// Expose only lesson fields already received. Leave a partial escape sequence
// for the next delta so neither JSON punctuation nor broken Unicode is shown.
const stringBody = /^"((?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*)(")?/u;
function readString(source) {
  const match = stringBody.exec(source);
  if (!match) return;
  const value = JSON.parse('"' + match[1] + '"').replace(/[\uD800-\uDBFF]$/u, '');
  return { value, length: match[0].length, closed: Boolean(match[2]) };
}

export function lessonPreview(raw) {
  let source = raw.trimStart().replace(/^```(?:json)?\s*/i, '').trimStart();
  const preview = { hint: '', detail: '' };
  if (!source.startsWith('{')) return preview;
  source = source.slice(1).trimStart();
  const detail = [];
  while (source) {
    const key = /^"(hint|steps|answer|check|missing)"\s*:\s*/.exec(source);
    if (!key || key[1] === 'missing') break;
    source = source.slice(key[0].length);
    if (key[1] === 'steps') {
      if (!source.startsWith('[')) break;
      source = source.slice(1).trimStart();
      while (source.startsWith('"')) {
        const step = readString(source);
        detail.push(step.value);
        if (!step.closed) break;
        source = source.slice(step.length).trimStart();
        if (!source.startsWith(',')) break;
        source = source.slice(1).trimStart();
      }
      if (!source.startsWith(']')) break;
      source = source.slice(1).trimStart();
    } else {
      const field = readString(source);
      if (!field) break;
      if (key[1] === 'hint') preview.hint = field.value;
      if (key[1] === 'answer' && field.value) detail.push('答案 · ' + field.value);
      if (key[1] === 'check' && field.value) detail.push('自检 · ' + field.value);
      if (!field.closed) break;
      source = source.slice(field.length).trimStart();
    }
    if (!source.startsWith(',')) break;
    source = source.slice(1).trimStart();
  }
  preview.detail = detail.join('\n\n');
  return preview;
}
