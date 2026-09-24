"use client";

import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type MouseEvent } from "react";

type Gesture = { id: number; y: number; height: number; lastY: number; time: number; velocity: number; moved: boolean };

/** Only the handle owns dragging. Reading, text selection and practice controls stay native. */
export function useKnowledgeSheetDrag() {
  const slot = useRef<HTMLDivElement>(null);
  const bounds = useRef({ min: 0, max: 0 });
  const gesture = useRef<Gesture | null>(null);
  const open = useRef(false);
  const suppressClick = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState<number>();
  const [dragging, setDragging] = useState(false);
  const settle = useCallback((next: boolean) => {
    open.current = next;
    setExpanded(next);
    setDragging(false);
    setHeight(next ? bounds.current.max : bounds.current.min);
  }, []);
  useLayoutEffect(() => {
    const element = slot.current;
    const workspace = element?.parentElement;
    if (!element || !workspace) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.height) return;
      bounds.current = { min: rect.height, max: Math.max(rect.height, rect.bottom - workspace.getBoundingClientRect().top - 24) };
      // Rotation/keyboard/viewport changes cancel the gesture instead of retaining stale coordinates.
      if (gesture.current) suppressClick.current = true;
      gesture.current = null;
      settle(open.current);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    observer?.observe(workspace);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [settle]);
  const cancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.id !== event.pointerId) return;
    suppressClick.current = true;
    gesture.current = null;
    settle(open.current);
  };
  const handleProps = {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (!event.isPrimary || event.button !== 0 || !bounds.current.min) return;
      suppressClick.current = false;
      const currentHeight = slot.current?.firstElementChild?.getBoundingClientRect().height;
      gesture.current = { id: event.pointerId, y: event.clientY, height: currentHeight ?? bounds.current.min, lastY: event.clientY, time: event.timeStamp, velocity: 0, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      setHeight(gesture.current.height);
      setDragging(true);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const delta = current.y - event.clientY;
      current.moved ||= Math.abs(delta) > 6;
      const elapsed = event.timeStamp - current.time;
      if (elapsed > 0) current.velocity = (current.lastY - event.clientY) / elapsed;
      current.lastY = event.clientY;
      current.time = event.timeStamp;
      const value = current.height + delta;
      const { min, max } = bounds.current;
      // Bounded rubber-band resistance at both ends; never pull the close button offscreen.
      setHeight(value < min ? min - Math.min(20, (min - value) * .16) : value > max ? max + Math.min(12, (value - max) * .16) : value);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      gesture.current = null;
      const moved = current.moved || Math.abs(current.y - event.clientY) > 6;
      suppressClick.current = moved;
      const value = current.height + current.y - event.clientY;
      const velocity = event.timeStamp - current.time < 100 ? current.velocity : 0;
      const next = Math.abs(velocity) > .45 ? velocity > 0 : value > (bounds.current.min + bounds.current.max) / 2;
      settle(moved ? next : open.current);
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
      settle(!open.current);
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      settle(event.key === "ArrowUp");
    },
  };
  return { slot, height, expanded, dragging, handleProps };
}
