"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";

interface CommaCompanionProps {
  thinking?: boolean;
  canCelebrate?: boolean;
  className?: string;
}

/** A local, fixed-size brand asset. It never owns input, scrolling or requests. */
export function CommaCompanion({ thinking = false, canCelebrate = true, className = "" }: CommaCompanionProps) {
  const [previousThinking, setPreviousThinking] = useState(thinking);
  const [arrived, setArrived] = useState(false);
  // Adjust only on a prop transition, not every render or initial mount.
  if (previousThinking !== thinking) {
    setPreviousThinking(thinking);
    setArrived(!thinking && canCelebrate);
  }
  useEffect(() => {
    if (!arrived) return;
    const timer = window.setTimeout(() => setArrived(false), 1600);
    return () => window.clearTimeout(timer);
  }, [arrived]);
  const state = thinking ? "thinking" : arrived && canCelebrate ? "ready" : "idle";
  return <span className={`comma-companion ${className}`} data-state={state} role="img" aria-label="专注作业">
    {(["idle", "thinking", "ready"] as const).map(pose => <img key={pose} className={`comma-companion__pose comma-companion__pose--${pose}`} src={`/brand/comma-${pose}.webp`} alt="" aria-hidden="true" width={192} height={192} decoding="async" draggable={false}/>)}
  </span>;
}
