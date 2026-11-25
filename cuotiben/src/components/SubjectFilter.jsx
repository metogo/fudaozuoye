import React, { useEffect, useId, useRef, useState } from 'react';
import { subjectName } from '../../shared/subjects.js';
import { Icon } from './UI.jsx';

export default function SubjectFilter({ subjects, value, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();
  const label = key => key === 'all' ? '全部学科' : subjectName(key);

  useEffect(() => {
    if (!open) return;
    menu.current.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    function dismiss(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current.focus({ preventScroll: true });
  }
  function navigate(event) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!open) { setOpen(true); return; }
    const items = Array.from(menu.current.children);
    const index = items.indexOf(document.activeElement);
    const previous = (index - 1 + items.length) % items.length;
    const following = (index + 1) % items.length;
    const next = { Home: 0, End: items.length - 1, ArrowLeft: previous, ArrowRight: following,
      ArrowDown: following, ArrowUp: previous };
    items[next[event.key]].focus();
  }
  return <div className="subject-picker" ref={root} onKeyDown={navigate}
    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="subject-filter" value={value}
      aria-label={'按学科筛选，当前' + label(value)} aria-haspopup="menu" aria-expanded={open}
      aria-controls={id} onClick={() => setOpen(!open)}>
      <Icon name="book" /><span>{label(value)}</span><Icon name="right" />
    </button>
    <div ref={menu} className="subject-menu" id={id} role="menu" aria-label="按学科筛选" hidden={!open}>
      {['all', ...subjects].map(key => <button key={key} type="button" value={key} role="menuitemradio"
        aria-checked={value === key} tabIndex={-1} onClick={() => { close(); onChange(key); }}>
        <span>{label(key)}</span>{value === key && <Icon name="ok" />}
      </button>)}
    </div>
  </div>;
}
