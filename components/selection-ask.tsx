"use client";

import { useUiText } from "./ui-language";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { selectionSnapshot } from "@/lib/learning/selection-snapshot";
import { bindParagraphSelection } from "@/lib/learning/paragraph-selection";

/** Use the browser's native selection so touch handles and keyboard selection remain available. */
export function SelectionAsk({ root, disabled, onAsk }: {
  root: RefObject<HTMLDivElement | null>; disabled: boolean; onAsk: (text: string, range: Range) => void;
}) {
  const t = useUiText();
  const [selection, setSelection] = useState<{ left: number; top: number | null; start: { x: number; y: number; height: number }; end: { x: number; y: number; height: number } } | null>(null);
  const rangeRef = useRef<Range | null>(null);
  const dragRef = useRef<{ edge: "start" | "end"; offsetX: number; offsetY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const area = root.current;
      const snapshot = selectionSnapshot(area);
      if (disabled || !area || !snapshot) { rangeRef.current = null; dragRef.current = null; setDragging(false); setSelection(null); return; }
      const { range } = snapshot;
      const bounds = area.getBoundingClientRect();
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0 && rect.width > 0);
      const rect = rects.find((rect) => rect.bottom > bounds.top && rect.top < bounds.bottom);
      if (!rect) { setSelection(null); return; }
      rangeRef.current = range.cloneRange();
      const first = rects[0], last = rects[rects.length - 1];
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const visibleTop = Math.max(topEdge, bounds.top), visibleBottom = Math.min(topEdge + (viewport?.height ?? window.innerHeight), bounds.bottom);
      // Keep the action outside the selected text, even near the screen edges.
      const top = rect.top - 52 >= visibleTop ? rect.top - 52 : last.bottom + 52 <= visibleBottom ? last.bottom + 8 : Math.max(topEdge + 8, bounds.top - 52);
      setSelection({ left: Math.max(leftEdge + 76, Math.min(leftEdge + (viewport?.width ?? window.innerWidth) - 76, rect.left + rect.width / 2)), top, start: { x: first.left, y: first.top, height: first.height }, end: { x: last.right, y: last.top, height: last.height } });
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(update, dragRef.current ? 0 : 120); };
    const unbindTap = !disabled && root.current ? bindParagraphSelection(root.current, update) : undefined;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { clearTimeout(timer); window.getSelection()?.removeAllRanges(); rangeRef.current = null; dragRef.current = null; setDragging(false); setSelection(null); } };
    const dismissOnScroll = () => {
      clearTimeout(timer);
      // Do not erase unrelated selection, or a quote already handed to the composer.
      if (rangeRef.current) window.getSelection()?.removeAllRanges();
      rangeRef.current = null; dragRef.current = null; setDragging(false); setSelection(null);
    };
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", dismissOnScroll, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", dismissOnScroll);
    schedule();
    return () => { unbindTap?.(); clearTimeout(timer); document.removeEventListener("selectionchange", schedule); document.removeEventListener("keydown", escape); window.removeEventListener("scroll", dismissOnScroll, true); window.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", dismissOnScroll); };
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
    const origin = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
    const prose = origin?.closest(".copyable-learning-text__prose");
    if (prose && node.parentElement?.closest(".copyable-learning-text__prose") !== prose) return;
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
    {(["start", "end"] as const).map((edge) => {
      const point = selection[edge];
      const bounds = root.current?.getBoundingClientRect();
      if (bounds && (point.y < bounds.top || point.y + point.height > bounds.bottom)) return null;
      return <button key={edge} type="button" aria-label={edge === "start" ? t("拖动调整选区起点") : t("拖动调整选区终点")} className="selection-ear" style={{ left: point.x, top: edge === "start" ? point.y - 22 : point.y + point.height - 22 }} onPointerDown={(event) => {
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { edge, offsetX: point.x - event.clientX, offsetY: point.y + point.height / 2 - event.clientY };
        setDragging(true);
      }} onPointerMove={moveHandle} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
        <span aria-hidden="true" className={`selection-ear__dot selection-ear__dot--${edge}`}/>
      </button>;
    })}
    {!dragging && selection.top !== null && <button type="button" aria-label={t("针对选中文字问一问")} className="selection-ask-trigger" style={{ left: selection.left, top: selection.top }} onPointerDown={(event) => event.preventDefault()} onClick={() => {
      const current = selectionSnapshot(root.current);
      if (current) { onAsk(current.text, current.range.cloneRange()); window.dispatchEvent(new Event("learning-selection-used")); }
      window.getSelection()?.removeAllRanges(); rangeRef.current = null; setSelection(null);
    }}><span>{t("问一问")}</span><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 17 17 7M7 7h10v10"/></svg></button>}
  </>, document.body);
}
