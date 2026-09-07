"use client";

import { useUiText } from "./ui-language";
import { useEffect, useState } from "react";

export type StreamingIndicatorStatus = "starting" | "streaming" | "finishing";

export const STREAMING_FINISH_MS = 1160;
export const STREAMING_SILENCE_MS = 900;

interface StreamingIndicatorProps {
  status: StreamingIndicatorStatus;
  compact?: boolean;
}

export function StreamingIndicator({ status, compact = false }: StreamingIndicatorProps) {
  const t = useUiText();
  const [waiting, setWaiting] = useState(false);
  const stateLabel = status === "starting" ? "正在准备" : status === "streaming" ? "正在输出" : "输出完成";

  useEffect(() => {
    if (status !== "streaming") return;
    const timer = window.setTimeout(() => setWaiting(true), STREAMING_SILENCE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  return <span
    className={`streaming-indicator ${compact ? "streaming-indicator--compact" : ""}`}
    data-phase={status}
    data-waiting={status === "streaming" && waiting ? "true" : "false"}
    role="img"
    aria-label={t(stateLabel)}
  >
    {status === "finishing" ? <svg viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <circle className="streaming-indicator__ring" cx="14" cy="14" r="9"/>
      <path className="streaming-indicator__check" d="m9.7 14.2 2.8 2.8 5.9-6.3"/>
      <g className="streaming-indicator__sparks">
        <path d="M14 2.5v2.2"/>
        <path d="m23 5-1.6 1.7"/>
        <path d="M25.5 14h-2.2"/>
      </g>
    </svg> : <><span className="streaming-indicator__ink-dot"/><span className="streaming-indicator__continuing">{t("还在继续")}</span></>}
  </span>;
}
