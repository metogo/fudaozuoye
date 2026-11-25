// Only split a contiguous, explicitly lettered A–D block. Keep ambiguous stems intact.
export function reviewChoices(text) {
  const start = /\n[ \t]*A[.．、][ \t]*/.exec(text);
  if (!start) return null;
  const stem = text.slice(0, start.index).trim();
  const tail = text.slice(start.index).trim();
  const end = /\n[ \t\r]*\n/.exec(tail);
  const block = end ? tail.slice(0, end.index) : tail;
  const marks = [...block.matchAll(/(?:^|\s)([A-Z])[.．、][ \t]*/g)];
  if (!stem || marks.map(m => m[1]).join('') !== 'ABCD') return null;
  const choices = marks.map((m, i) => ({
    label: m[1], text: block.slice(m.index + m[0].length, marks[i + 1]?.index).trim(),
  }));
  if (choices.some(choice => !choice.text)) return null;
  return { stem, choices, material: end ? tail.slice(end.index).trim() : '' };
}

// In numbered Chinese exam prose the PDF extractor places the gutter after every fifth line.
// An extracted PDF row can span two text lines. Verify the complete sequence before removing labels. Other material retains its line breaks.
export function readingParagraphs(text) {
  const paragraphs = text.trim().split(/\n[ \t\r]*\n+/);
  const notice = /\n\s*請勿在此書寫。[ \t]+請勿在此書寫。\s*\n/;
  if (!notice.test(text)) return paragraphs;
  const blocks = text.trim().replace(notice, '\n').split(/\n[ \t\r]*\n+/);
  const lines = blocks.flatMap(block => block.split('\n'));
  const gutter = /[ \t]+(\d+)[ \t]*$/;
  const labels = lines.flatMap(line => line.match(gutter)?.[1] ?? []);
  if (labels.length < 3 || !labels.every((label, i) => Number(label) === (i + 1) * 5)) return paragraphs;
  return blocks.map(block => block.split('\n').map(line => line.replace(gutter, '').trim()).join(''));
}
