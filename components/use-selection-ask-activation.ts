"use client";

import { useCallback, useEffect, useRef, type RefObject, type TouchEvent, type PointerEvent, type MouseEvent } from "react";
import { selectionSnapshot } from "@/lib/learning/selection-snapshot";

type Snapshot = NonNullable<ReturnType<typeof selectionSnapshot>>;
type TouchActivation = { id: number; x: number; y: number; snapshot: Snapshot };

/** A quote belongs to this touch gesture only, never to a later click or question. */
export function useSelectionAskActivation(root: RefObject<HTMLDivElement | null>, disabled: boolean, ask: (snapshot: Snapshot) => void) {
  const pendingTouch = useRef<TouchActivation | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreTouchClickUntil = useRef(0);
  const cancelTouch = useCallback(() => {
    pendingTouch.current = null;
    if (expiry.current !== null) clearTimeout(expiry.current);
    expiry.current = null;
  }, []);
  const resync = useCallback(() => {
    cancelTouch();
    document.dispatchEvent(new Event("selectionchange"));
  }, [cancelTouch]);
  useEffect(() => {
    const multiTouch = (event: globalThis.TouchEvent) => { if (event.touches.length > 1) resync(); };
    document.addEventListener("touchstart", multiTouch, { passive: true });
    if (disabled) cancelTouch();
    return () => { cancelTouch(); document.removeEventListener("touchstart", multiTouch); };
  }, [disabled, cancelTouch, resync]);

  const buttonProps = {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => event.preventDefault(),
    onTouchStart: (event: TouchEvent<HTMLButtonElement>) => {
      cancelTouch();
      ignoreTouchClickUntil.current = performance.now() + 1000;
      if (disabled || event.touches.length !== 1) return;
      // iOS can collapse the native selection before its synthesized click.
      // Capture the current quote before that default action, without blocking scrolling.
      const snapshot = selectionSnapshot(root.current);
      if (!snapshot) return;
      const touch = event.touches[0];
      pendingTouch.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY, snapshot: { text: snapshot.text, range: snapshot.range.cloneRange() } };
      expiry.current = setTimeout(resync, 400);
    },
    onTouchMove: (event: TouchEvent<HTMLButtonElement>) => {
      const pending = pendingTouch.current, touch = event.touches[0];
      if (pending && (!touch || event.touches.length !== 1 || touch.identifier !== pending.id || Math.hypot(touch.clientX - pending.x, touch.clientY - pending.y) > 8)) resync();
    },
    onTouchCancel: resync,
    onTouchEnd: (event: TouchEvent<HTMLButtonElement>) => {
      ignoreTouchClickUntil.current = performance.now() + 1000;
      const pending = pendingTouch.current;
      cancelTouch();
      const touch = Array.from(event.changedTouches).find(point => point.identifier === pending?.id);
      const area = root.current;
      if (!disabled && pending && touch && event.touches.length === 0 && Math.hypot(touch.clientX - pending.x, touch.clientY - pending.y) <= 8
        && area?.contains(pending.snapshot.range.startContainer) && area.contains(pending.snapshot.range.endContainer)) {
        // Keep activation and focus inside the original user gesture on both iOS and Android.
        ask(pending.snapshot);
      } else resync();
    },
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      // The touch-end path owns activation; a delayed compatibility click must not retry it.
      if (disabled || (event.detail !== 0 && performance.now() < ignoreTouchClickUntil.current)) return;
      const current = selectionSnapshot(root.current);
      if (current) ask(current);
    },
  };
  return { pendingTouch, cancelTouch, buttonProps };
}
