/** A decorative scroll affordance. Never owns scrolling, focus or pointer events. */
export function observeChatEdgeFade(area: HTMLElement, dock: HTMLElement): () => void {
  let frame: number | undefined;
  let active = true;
  const update = () => {
    frame = undefined;
    if (!active) return;
    const remaining = Math.max(0, area.scrollHeight - area.scrollTop - area.clientHeight);
    const height = Math.min(48, Math.max(24, area.clientHeight * .12));
    dock.style.setProperty("--chat-edge-height", `${height}px`);
    dock.style.setProperty("--chat-edge-opacity", remaining > 2 ? String(Math.min(1, remaining / height)) : "0");
    dock.dataset.edgeOverflow = remaining > 2 ? "true" : "false";
  };
  const schedule = () => {
    if (active && frame === undefined) frame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(area);
  if (area.firstElementChild) observer.observe(area.firstElementChild);
  area.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  schedule();
  return () => {
    active = false;
    if (frame !== undefined) cancelAnimationFrame(frame);
    observer.disconnect();
    area.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    delete dock.dataset.edgeOverflow;
    dock.style.removeProperty("--chat-edge-height");
    dock.style.removeProperty("--chat-edge-opacity");
  };
}
