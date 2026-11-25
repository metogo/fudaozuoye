import React, { useEffect, useRef, useState } from 'react';

const inset = 24;
function label(index, last) {
  if (index === 0) return '解题思路';
  return index === last ? '自己检查' : '第 ' + index + ' 步';
}

export default function StepRuler({ region, lesson }) {
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const idle = useRef(0);
  const dragging = useRef(null);
  const destination = useRef(null);
  const parts = useRef([]);
  const last = lesson.steps.length + 1;

  useEffect(() => {
    const node = region.current;
    parts.current = Array.from(node.querySelectorAll('[data-part]'));
    let offsets = [];
    let frame = 0;
    function sync() {
      frame = 0;
      const y = window.scrollY;
      if (dragging.current !== null || (destination.current !== null && Math.abs(y - destination.current) < 2)) return;
      destination.current = null;
      let i = 0;
      while (i + 1 < offsets.length && offsets[i + 1] <= y + inset + 2) i++;
      if (y > 0 && y + window.innerHeight >= document.documentElement.scrollHeight - 1) i = offsets.length - 1;
      setActive(i);
    }
    function measure() {
      offsets = parts.current.map(part => part.getBoundingClientRect().top + window.scrollY);
      sync();
    }
    function scroll() {
      if (!frame) frame = requestAnimationFrame(sync);
    }
    destination.current = null;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(idle.current);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', measure);
    };
  }, [lesson, region]);

  function jump(index) {
    const target = parts.current[index];
    if (!target) return;
    const y = Math.max(0, Math.min(document.documentElement.scrollHeight - window.innerHeight,
      target.getBoundingClientRect().top + window.scrollY - inset));
    destination.current = y;
    setActive(index);
    window.scrollTo({ top: y, behavior: 'instant' });
  }
  function fromPointer(event) {
    const track = event.currentTarget.querySelector('.ruler-stops').getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientY - track.top) / track.height));
    jump(Math.round(fraction * last));
  }
  function engage() {
    clearTimeout(idle.current);
    setEngaged(true);
  }
  function fade() {
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setEngaged(false), 900);
  }
  function start(event) {
    if (!event.isPrimary || event.button !== 0) return;
    dragging.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    engage();
    fromPointer(event);
  }
  function end(event) {
    if (event.pointerId !== dragging.current) return;
    dragging.current = null;
    fade();
  }
  function key(event) {
    const values = { ArrowUp: active - 1, ArrowDown: active + 1, Home: 0, End: last };
    if (!(event.key in values)) return;
    event.preventDefault();
    engage();
    jump(Math.max(0, Math.min(last, values[event.key])));
    fade();
  }
  return <div className="step-ruler" role="slider" tabIndex={0} aria-label="解析步骤定位"
    aria-orientation="vertical" aria-valuemin={0} aria-valuemax={last}
    aria-valuenow={active} aria-valuetext={label(active, last)} data-engaged={engaged}
    style={{ '--stops': last + 1, '--at': (active / last) * 100 + '%' }} onKeyDown={key} onPointerDown={start}
    onPointerMove={e => { if (e.pointerId === dragging.current) fromPointer(e); }}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
    <span className="ruler-stops" aria-hidden="true">
      {Array.from({ length: last + 1 }, (_, i) => {
        // Keep labels apart even on lessons with many steps. Every step remains reachable.
        if (i !== active && i !== last && i % Math.ceil((last + 1) / 8) !== 0) return null;
        return <span key={i} className="ruler-tick" data-current={i === active}
          style={{ top: (i / last) * 100 + '%' }}>{i === 0 ? '思' : i === last ? '检' : i}</span>;
      })}
      <span className="ruler-caption">{label(active, last)}</span>
    </span>
  </div>;
}
