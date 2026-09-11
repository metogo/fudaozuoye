/** A short, stationary primary-pointer gesture selects prose; scrolling and long press remain native. */
export function bindParagraphSelection(area: HTMLElement, update: () => void) {
  let gesture: { id: number; x: number; y: number; time: number; target: EventTarget | null } | null = null;
  const cancel = () => { gesture = null; };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) { cancel(); return; }
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), target: event.target };
  };
  const move = (event: PointerEvent) => {
    if (gesture && (event.pointerId !== gesture.id || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8)) cancel();
  };
  const click = (event: MouseEvent) => {
    const tap = gesture; cancel();
    if (!tap || event.detail > 1 || performance.now() - tap.time > 400 || event.target !== tap.target || event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('a,button,input,textarea,select,[role="button"],[data-selection-exclude]')) return;
    const paragraph = target.closest("p,li");
    if (!paragraph?.closest(".copyable-learning-text__prose") || !area.contains(paragraph)) {
      window.getSelection()?.removeAllRanges(); update(); return;
    }
    if (paragraph.querySelector('a,button,input,textarea,select,[data-selection-exclude]')) return;
    const range = document.createRange(); range.selectNodeContents(paragraph);
    if (!range.toString().trim()) return;
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    update();
  };
  area.addEventListener("pointerdown", down);
  area.addEventListener("click", click);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointercancel", cancel);
  window.addEventListener("scroll", cancel, true);
  return () => {
    area.removeEventListener("pointerdown", down); area.removeEventListener("click", click);
    document.removeEventListener("pointermove", move); document.removeEventListener("pointercancel", cancel);
    window.removeEventListener("scroll", cancel, true);
  };
}
