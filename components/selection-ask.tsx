"use client";

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { learningPlainText } from "@/lib/learning/copy-rich-text";

/** Use the browser's native selection so touch handles and keyboard selection remain available. */
export function SelectionAsk({ root, disabled, onAsk }: {
  root: RefObject<HTMLDivElement | null>; disabled: boolean; onAsk: (text: string, range: Range) => void;
}) {
  const [selection, setSelection] = useState<{ text: string; left: number; top: number; anchorX: number; anchorY: number; start: { x: number; y: number; height: number }; end: { x: number; y: number; height: number } } | null>(null);
  const rangeRef = useRef<Range | null>(null);
  const dragRef = useRef<{ edge: "start" | "end"; offsetX: number; offsetY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const selected = window.getSelection();
      const area = root.current;
      if (disabled || !area || !selected?.rangeCount || selected.isCollapsed) { dragRef.current = null; setDragging(false); setSelection(null); return; }
      const range = selected.getRangeAt(0);
      const blocked = (node: Node) => (node.nodeType === 1 ? node as Element : node.parentElement)?.closest("button,input,textarea,select,[data-selection-exclude]");
      if (!area.contains(range.startContainer) || !area.contains(range.endContainer) || blocked(range.startContainer) || blocked(range.endContainer)) { setSelection(null); return; }
      const fragment = document.createElement("div");
      fragment.append(range.cloneContents());
      // A partial formula can omit its MathML tree; keep the user's exact visible fragment.
      let text: string;
      try { text = learningPlainText(fragment); }
      catch {
        fragment.querySelectorAll(".katex-mathml").forEach((element) => element.remove());
        fragment.querySelectorAll(".katex").forEach((element) => element.classList.remove("katex"));
        text = learningPlainText(fragment);
      }
      const bounds = area.getBoundingClientRect();
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0 && rect.width > 0);
      const rect = rects.find((rect) => rect.bottom > bounds.top && rect.top < bounds.bottom);
      if (!text || !rect) { setSelection(null); return; }
      rangeRef.current = range.cloneRange();
      const first = rects[0], last = rects[rects.length - 1];
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      setSelection({ text, left: Math.max(leftEdge + 52, Math.min(leftEdge + (viewport?.width ?? window.innerWidth) - 52, rect.left + rect.width / 2)), top: Math.max(topEdge + 8, rect.top - 56), anchorX: rect.left + rect.width / 2, anchorY: rect.top, start: { x: first.left, y: first.top, height: first.height }, end: { x: last.right, y: last.top, height: last.height } });
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(update, dragRef.current ? 0 : 120); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { clearTimeout(timer); setSelection(null); } };
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    schedule();
    return () => { clearTimeout(timer); document.removeEventListener("selectionchange", schedule); document.removeEventListener("keydown", escape); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", schedule); };
  }, [root, disabled]);
  const moveHandle = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const range = rangeRef.current;
    const area = root.current;
    if (!drag || !range || !area) return;
    event.preventDefault();
    const bounds = area.getBoundingClientRect();
    const y = Math.max(bounds.top + 2, Math.min(bounds.bottom - 2, event.clientY + drag.offsetY));
    const x = Math.max(bounds.left + 2, Math.min(bounds.right - 2, event.clientX + drag.offsetX));
    // Avoid hit-testing the overlaid handle itself.
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
    event.currentTarget.style.pointerEvents = "none";
    const caret = doc.caretPositionFromPoint?.(x, y);
    const fallback = !caret ? doc.caretRangeFromPoint?.(x, y) : null;
    event.currentTarget.style.pointerEvents = "";
    const node = caret?.offsetNode ?? fallback?.startContainer;
    const offset = caret?.offset ?? fallback?.startOffset;
    if (!node || offset === undefined || !area.contains(node) || node.nodeType !== Node.TEXT_NODE || node.parentElement?.closest("button,input,textarea,select,.katex-mathml,[data-selection-exclude]")) return;
    const next = range.cloneRange();
    if (drag.edge === "start") next.setStart(node, offset); else next.setEnd(node, offset);
    // Do not flip endpoints or lose the selection when handles cross.
    if (next.collapsed) return;
    rangeRef.current = next;
    const selected = window.getSelection();
    selected?.removeAllRanges(); selected?.addRange(next);
  };
  const stopDrag = () => { dragRef.current = null; setDragging(false); };
  if (!selection || disabled) return null;
  return createPortal(<>
    {!dragging && selection.anchorY >= selection.top + 44 && <svg aria-hidden="true" className="selection-ask-link" width="100%" height="100%"><path d={`M ${selection.left} ${selection.top + 42} L ${selection.anchorX} ${selection.anchorY - 2}`} fill="none" stroke="#26715d" strokeWidth="2"/><circle cx={selection.anchorX} cy={selection.anchorY - 2} r="3" fill="#26715d"/></svg>}
    {(["start", "end"] as const).map((edge) => {
      const point = selection[edge];
      const bounds = root.current?.getBoundingClientRect();
      if (bounds && (point.y < bounds.top || point.y + point.height > bounds.bottom)) return null;
      return <button key={edge} type="button" aria-label={edge === "start" ? "拖动调整选区起点" : "拖动调整选区终点"} className="selection-ear" style={{ left: point.x, top: edge === "start" ? point.y - 22 : point.y + point.height - 22 }} onPointerDown={(event) => {
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { edge, offsetX: point.x - event.clientX, offsetY: point.y + point.height / 2 - event.clientY };
        setDragging(true);
      }} onPointerMove={moveHandle} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
        <span aria-hidden="true" className={`selection-ear__dot selection-ear__dot--${edge}`}/>
      </button>;
    })}
    {!dragging && <button type="button" aria-label="针对选中文字问一问" className="selection-ask-trigger fixed z-[80] min-h-11 -translate-x-1/2 select-none rounded-full bg-emerald-800 px-5 text-sm font-semibold text-white shadow-lg" style={{ left: selection.left, top: selection.top }} onPointerDown={(event) => event.preventDefault()} onClick={() => { if (rangeRef.current) onAsk(selection.text, rangeRef.current.cloneRange()); window.getSelection()?.removeAllRanges(); setSelection(null); }}>问一问</button>}
  </>, document.body);
}
