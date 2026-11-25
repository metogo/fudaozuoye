import { useLayoutEffect, useRef, useState } from 'react';

// Follow the rendered tail (including late formula layout), at most once per paint.
export default function useLessonFollow(active, lesson) {
  const region = useRef(null);
  const session = useRef(null);
  const resume = useRef(null);
  const [paused, setPaused] = useState(false);

  useLayoutEffect(() => {
    if (!active) {
      const previous = session.current;
      session.current = null;
      if (previous && lesson && lesson !== previous.lesson) {
        if (previous.follow) {
          document.querySelector('.result-reader [data-part="check"]')
            ?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        } else {
          window.scrollTo({ top: previous.position, behavior: 'instant' });
        }
      }
      return;
    }
    if (!region.current) return;
    const node = region.current;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const reading = { follow: true, position: window.scrollY, lesson };
    session.current = reading;
    setPaused(false);
    let frame = 0;
    let touch;
    function distance() {
      return node.getBoundingClientRect().bottom - window.innerHeight + 20;
    }
    function follow() {
      frame = 0;
      const delta = distance();
      if (reading.follow && delta > 1) window.scrollBy({ top: delta, behavior: 'instant' });
    }
    function schedule() {
      if (!frame && reading.follow) frame = requestAnimationFrame(follow);
    }
    function pause() {
      if (!reading.follow || (window.scrollY < 1 && reading.position < 1)) return;
      reading.follow = false;
      setPaused(true);
    }
    resume.current = () => {
      reading.follow = true;
      setPaused(false);
      schedule();
    };
    function scrolled() {
      const y = window.scrollY;
      if (y < reading.position - 2) pause();
      if (!reading.follow && y > reading.position && distance() < 35) resume.current();
      reading.position = y;
    }
    function wheel(event) { if (event.deltaY < 0) pause(); }
    function key(event) {
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) pause();
    }
    function start(event) { touch = event.touches[0]; }
    function move(event) {
      const next = event.touches[0];
      if (!touch || event.touches.length !== 1) return;
      const dy = next.clientY - touch.clientY;
      if (dy > 4 && dy > Math.abs(next.clientX - touch.clientX)) pause();
    }
    const events = { scroll: scrolled, wheel, keydown: key, touchstart: start, touchmove: move, resize: schedule };
    for (const [name, fn] of Object.entries(events)) window.addEventListener(name, fn, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const [name, fn] of Object.entries(events)) window.removeEventListener(name, fn);
      resume.current = null;
    };
  }, [active]); // Each stream owns its starting lesson and reading position.

  return { region, paused, resume: () => resume.current?.() };
}
