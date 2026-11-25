import React, { useLayoutEffect, useRef } from 'react';
import LearningText from './LearningText.jsx';
import { strokeBox } from '../core/arrange-ink.js';

// Layout uses the same SVG coordinates as the handwriting on both notebook and fullscreen boards.
export default function InkTypeset({ strokes, text, width, height }) {
  const content = useRef(null);
  const box = strokeBox(strokes);
  const fontSize = Math.min(44, Math.max(21, box.height / Math.max(1, text.split('\n').length) * 0.8));
  const x = Math.max(0, Math.min(box.left, width - 120)), y = Math.max(0, Math.min(box.top, height - fontSize * 1.65));
  const available = { width: width - x, height: height - y };
  useLayoutEffect(() => {
    const node = content.current;
    const fit = () => {
      node.style.transform = `scale(${Math.min(1, available.height / Math.max(1, node.scrollHeight), available.width / Math.max(1, node.scrollWidth))})`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [available.width, available.height, text]);
  return <foreignObject x={x} y={y} width={available.width} height={available.height} pointerEvents="none">
    <div className="ink-typeset" ref={content} style={{ fontSize }}>
      <LearningText text={text} />
    </div>
  </foreignObject>;
}
