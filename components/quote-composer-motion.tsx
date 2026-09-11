"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { quoteComposerPosition } from "@/lib/learning/quote-composer-position";

/** Move the existing input, keeping its focus, IME composition and draft intact. */
export function QuoteComposerMotion({ range, formRef, dockRef, scrollRef }: {
  range: Range | null; formRef: RefObject<HTMLFormElement | null>; dockRef: RefObject<HTMLDivElement | null>; scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const previous = useRef<DOMRect | null>(null);
  const dockHeight = useRef(0);
  useLayoutEffect(() => {
    const form = formRef.current, dock = dockRef.current, scroll = scrollRef.current;
    if (!form || !dock || !scroll) return;
    let animation: Animation | undefined;
    const animateFrom = (from: DOMRect | null) => {
      const to = form.getBoundingClientRect();
      if (!from || !to.width || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !form.animate) return;
      animation = form.animate([{ transformOrigin: "left top", transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, 1)`, opacity: 0.8 }, { transformOrigin: "left top", transform: "none", opacity: 1 }], { duration: 280, easing: "cubic-bezier(.22,.8,.25,1)" });
    };
    if (!range) {
      animateFrom(previous.current);
      const remember = () => { previous.current = form.getBoundingClientRect(); dockHeight.current = dock.getBoundingClientRect().height; };
      remember();
      const observer = new ResizeObserver(remember); observer.observe(dock);
      return () => { observer.disconnect(); animation?.cancel(); };
    }
    dock.style.height = `${dockHeight.current || dock.getBoundingClientRect().height}px`;
    form.classList.add("chat-composer--quoted");
    const backdrop = document.createElement("div");
    backdrop.className = "quote-focus-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    (dock.parentElement ?? document.body).append(backdrop);
    const overlay = document.createElement("div");
    overlay.className = "quote-selection-overlay";
    overlay.setAttribute("aria-hidden", "true");
    (dock.parentElement ?? document.body).append(overlay);
    let frame = 0;
    const update = () => {
      overlay.replaceChildren();
      if (!range.startContainer.isConnected || !scroll.contains(range.startContainer)) return;
      const viewport = window.visualViewport;
      const vx = viewport?.offsetLeft ?? 0, vy = viewport?.offsetTop ?? 0;
      const vw = viewport?.width ?? window.innerWidth, vh = viewport?.height ?? window.innerHeight;
      const area = scroll.getBoundingClientRect(), dockBox = dock.getBoundingClientRect();
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0 && r.bottom > Math.max(area.top, vy) && r.top < Math.min(area.bottom, vy + vh));
      const anchor = rects.at(-1);
      const position = quoteComposerPosition({ viewportLeft: vx, viewportTop: vy, viewportWidth: vw, viewportHeight: vh, dockLeft: dockBox.left, dockWidth: dockBox.width, anchorBottom: anchor?.bottom ?? vy + vh, height: form.offsetHeight });
      Object.assign(form.style, { left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px`, maxHeight: `${Math.max(100, vh - 24)}px` });
      for (const rect of rects) {
        const top = Math.max(rect.top, area.top, vy), bottom = Math.min(rect.bottom, area.bottom, vy + vh);
        const mark = document.createElement("span");
        Object.assign(mark.style, { position: "fixed", left: `${rect.left}px`, top: `${top}px`, width: `${rect.width}px`, height: `${bottom - top}px` });
        overlay.append(mark);
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const viewportResize = () => {
      const viewport = window.visualViewport;
      const end = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0).at(-1);
      const top = Math.max(scroll.getBoundingClientRect().top, viewport?.offsetTop ?? 0);
      const availableBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      const target = Math.max(top + 32, availableBottom - form.offsetHeight - 30);
      if (end && (end.bottom > target || end.top < top)) scroll.scrollTop += end.bottom - target;
      schedule();
    };
    update(); // Width can change wrapped quote height; measure once more before painting.
    update();
    animateFrom(previous.current);
    const observer = new ResizeObserver(schedule); observer.observe(form);
    scroll.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", viewportResize);
    window.visualViewport?.addEventListener("resize", viewportResize);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      previous.current = form.getBoundingClientRect();
      animation?.cancel(); cancelAnimationFrame(frame); observer.disconnect();
      scroll.removeEventListener("scroll", schedule); window.removeEventListener("resize", viewportResize);
      window.visualViewport?.removeEventListener("resize", viewportResize); window.visualViewport?.removeEventListener("scroll", schedule);
      // Teardown must be synchronous: no viewport-sized layer survives cancellation.
      overlay.remove();
      backdrop.remove();
      form.classList.remove("chat-composer--quoted");
      for (const property of ["left", "top", "width", "max-height"]) form.style.removeProperty(property);
      dock.style.removeProperty("height");
    };
  }, [range, formRef, dockRef, scrollRef]);
  return null;
}
