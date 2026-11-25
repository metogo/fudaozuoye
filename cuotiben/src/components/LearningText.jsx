import React, { lazy, Suspense } from 'react';
import { formulaParts } from '../core/formulas.js';

const Formula = lazy(() =>
  import('./Formula.jsx').catch(() => ({
    default: ({ source }) => <span title="公式排版未加载，显示原式">{source}</span>,
  })),
);

function prose(value) {
  return value.split(/(\*\*[^*]+\*\*|^#{1,6} [^\n]+)/gm).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^#{1,6} /.test(part)) return <strong key={i}>{part.replace(/^#{1,6} /, '')}</strong>;
    return part;
  });
}
// Shorten the excerpt before layout so WebKit can size every math line naturally.
function previewParts(text) {
  let available = 64;
  const excerpt = [];
  for (const part of formulaParts(text)) {
    if (available <= 0) {
      excerpt.push({ text: '…' });
      break;
    }
    if (part.formula) {
      excerpt.push({ ...part, display: false });
      available -= part.formula.length;
      continue;
    }
    const words = part.text.replace(/^#{1,6} /gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ');
    const chars = Array.from(words);
    if (chars.length > available) {
      excerpt.push({ text: chars.slice(0, available).join('').trimEnd() + '…' });
      break;
    }
    excerpt.push({ text: words });
    available -= chars.length;
  }
  return excerpt;
}

export default function LearningText({ text, preview = false }) {
  const parts = preview ? previewParts(text) : formulaParts(text);
  return parts.map((part, i) =>
    part.formula ? (
      <Suspense key={i} fallback={<span className="formula-loading" role="img" aria-label="正在排版公式" />}>
        <Formula source={part.formula} display={part.display} />
      </Suspense>
    ) : (
      <React.Fragment key={i}>{prose(part.text)}</React.Fragment>
    ),
  );
}
