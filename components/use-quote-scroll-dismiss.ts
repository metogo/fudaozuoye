"use client";
import { useEffect, type RefObject } from "react";

/** Dismiss only page scrolling, never scrolling the quote preview or typing area. */
export function useQuoteScrollDismiss(active: boolean, form: RefObject<HTMLFormElement | null>, dismiss: () => void) {
  useEffect(() => {
    if (!active) return;
    let resizingUntil = 0;
    const resize = () => { resizingUntil = performance.now() + 500; };
    const insideForm = (event: Event) => event.target instanceof Node && form.current?.contains(event.target);
    const scroll = (event: Event) => {
      if (!insideForm(event) && performance.now() >= resizingUntil) dismiss();
    };
    // Intent also dismisses at a page boundary, where no scroll event is emitted.
    const wheel = (event: WheelEvent) => { if (event.deltaY && !insideForm(event)) dismiss(); };
    let startY: number | null = null;
    const touchStart = (event: TouchEvent) => { startY = insideForm(event) ? null : event.touches[0]?.clientY ?? null; };
    const touchMove = (event: TouchEvent) => {
      if (startY !== null && event.touches[0] && Math.abs(event.touches[0].clientY - startY) > 8) dismiss();
    };
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("scroll", scroll, true); window.removeEventListener("wheel", wheel);
      window.removeEventListener("touchstart", touchStart); window.removeEventListener("touchmove", touchMove);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [active, form, dismiss]);
}
