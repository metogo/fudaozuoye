"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Scroll direction belongs to the reading surface, not nested cards or model autoscroll. */
export function useReadingHeader(areaRef: RefObject<HTMLDivElement | null>, headerRef: RefObject<HTMLElement | null>, enabled: boolean, identity: string) {
  useLayoutEffect(() => {
    const area = areaRef.current, header = headerRef.current;
    const shell = area?.parentElement;
    if (!enabled || !area || !header || !shell) return;
    let last = area.scrollTop, distance = 0, direction = 0, userUntil = 0;
    const show = (hidden: boolean) => {
      header.setAttribute("data-reading-hidden", String(hidden));
      header.inert = hidden;
      if (hidden) header.setAttribute("aria-hidden", "true"); else header.removeAttribute("aria-hidden");
    };
    const measure = () => {
      const css = getComputedStyle(header);
      shell.style.setProperty("--reading-header-space", `${header.offsetHeight + parseFloat(css.marginTop || "0") + parseFloat(css.marginBottom || "0")}px`);
    };
    shell.setAttribute("data-reading-header", "true");
    show(false); measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure); observer?.observe(header);
    const intent = () => { userUntil = performance.now() + 1500; };
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,[contenteditable=true]")) return;
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) intent();
    };
    const scroll = () => {
      const top = Math.max(0, Math.min(area.scrollTop, Math.max(0, area.scrollHeight - area.clientHeight)));
      const delta = top - last; last = top;
      if (top <= 24) { distance = 0; show(false); return; }
      if (performance.now() > userUntil || Math.abs(delta) < 1) { distance = 0; return; }
      const next = Math.sign(delta);
      distance = next === direction ? distance + Math.abs(delta) : Math.abs(delta);
      direction = next;
      if (next < 0 && distance >= 16) show(false);
      if (next > 0 && top > 96 && distance >= 32 && !header.contains(document.activeElement)) show(true);
    };
    area.addEventListener("wheel", intent, { passive: true });
    area.addEventListener("touchmove", intent, { passive: true });
    area.addEventListener("pointerdown", intent, { passive: true });
    area.addEventListener("keydown", key);
    area.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect(); show(false);
      shell.removeAttribute("data-reading-header"); shell.style.removeProperty("--reading-header-space");
      area.removeEventListener("wheel", intent); area.removeEventListener("touchmove", intent);
      area.removeEventListener("pointerdown", intent); area.removeEventListener("keydown", key);
      area.removeEventListener("scroll", scroll); window.removeEventListener("resize", measure);
    };
  }, [areaRef, headerRef, enabled, identity]);
}
