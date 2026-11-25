import React, { useEffect, useState } from 'react';
import LearningText from './LearningText.jsx';

export function OriginalPhoto({ image, children }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="original-photo" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>查看原图</summary>
      {open && <PhotoContent image={image} />}
      {children}
    </details>
  );
}

function PhotoContent({ image }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (typeof image === 'string') return;
    const objectUrl = URL.createObjectURL(image);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);
  if (failed) return <p role="status">这张原图暂时无法显示，仍可查看题干和解析、继续订正。</p>;
  const src = typeof image === 'string' ? image : url;
  return src ? <img className="proof" src={src} alt="保存的本题选区" onError={() => setFailed(true)} /> : null;
}

export default function QuestionSheet({ question, label = '原题', metadata, children }) {
  return (
    <article className="paper question-sheet">
      {metadata ?? <div className="sheet-heading">
        <span>
          {label}
        </span>
      </div>}
      {children ?? <p className="stem">
        <LearningText text={question.q} />
      </p>}
      {question.img && <OriginalPhoto image={question.img} />}
    </article>
  );
}
