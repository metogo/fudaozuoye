import React, { memo, useMemo, useRef, useState, useEffect } from 'react';
import { inkBounds, inkPath } from '../core/ink.js';

import { arrangedPath } from '../core/arrange-ink.js';
import InkTypeset from './InkTypeset.jsx';

const Stroke = memo(function Stroke({ points, smooth }) {
  return <path d={smooth ? arrangedPath(points) : inkPath(points)} />;
});

export default function InkSheet({ strokes, arranged = [], typeset, onBegin, onStroke }) {
  const active = useRef(null), frame = useRef(0);
  const { width, height } = useMemo(() => inkBounds(strokes), [strokes]);
  const [live, setLive] = useState('');
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  function collect(e, samples) {
    const inverse = e.currentTarget.getScreenCTM().inverse();
    const points = active.current.points;
    for (const sample of samples) {
      const rect = active.current.rect;
      const sx = Math.max(rect.left, Math.min(rect.right, sample.clientX));
      const sy = Math.max(rect.top, Math.min(rect.bottom, sample.clientY));
      const { x, y } = new DOMPoint(sx, sy).matrixTransform(inverse);
      const last = points.at(-1);
      if (!last || last[0] !== x || last[1] !== y) points.push([x, y]);
    }
    if (!frame.current) frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (active.current) setLive(inkPath(active.current.points));
    });
  }
  function start(e) {
    if (!onStroke || active.current || e.button !== 0) return;
    active.current = { pointer: e.pointerId, points: [], rect: e.currentTarget.getBoundingClientRect() };
    onBegin?.();
    e.currentTarget.setPointerCapture(e.pointerId);
    collect(e, [e]);
  }
  function move(e) {
    if (active.current?.pointer !== e.pointerId) return;
    const samples = e.nativeEvent.getCoalescedEvents?.();
    collect(e, samples?.length ? samples : [e]);
  }
  function finish(e) {
    if (active.current?.pointer !== e.pointerId) return;
    if (e.type === 'pointerup') collect(e, [e]);
    const { points } = active.current;
    active.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setLive('');
    onStroke(points);
  }
  return <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMin meet" className={'ink-sheet' + (onStroke ? ' writable' : '')}
    aria-label={onStroke ? '手写作答白板' : '手写作答原稿'} role="img"
    onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
    {typeset && strokes.length > 0 ? <InkTypeset text={typeset} strokes={strokes} width={width} height={height} /> : <g fill="none" stroke="#172e28" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {strokes.map((stroke, index) => <Stroke key={index} points={stroke} smooth={arranged[index] === stroke} />)}
      {live && <path d={live} />}
    </g>}
  </svg>;
}
