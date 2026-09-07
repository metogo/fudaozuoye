"use client";

import { useUiText } from "./ui-language";
import { useId, useRef, useState } from "react";
import { buildLearningClipboardContent, writeLearningClipboard } from "@/lib/learning/copy-rich-text";
// 图片复制暂时停用，实现保留在 lib/learning/copy-learning-image.ts，方便后续恢复。
import { RichLearningText } from "./lazy-rich-learning-text";
import { StreamingIndicator } from "./streaming-indicator";
import { CopyIcon } from "./icons";
import type { LearningEmphasis } from "@/lib/learning/learning-emphasis";

interface CopyableLearningTextProps {
  emphasis?: LearningEmphasis[];
  text: string;
  status?: "streaming" | "finishing" | "complete" | "error";
}

export function CopyableLearningText({ text, status, emphasis }: CopyableLearningTextProps) {
  const t = useUiText();
  const proseRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const feedbackId = useId();
  const [feedback, setFeedback] = useState<{ text: string; message: string; pending: boolean } | null>(null);
  const current = feedback?.text === text ? feedback : null;
  const canCopy = (status === "complete" || status === undefined) && text.trim().length > 0;
  const streaming = status === "streaming" || status === "finishing";

  async function copy() {
    if (!proseRef.current || !canCopy || pendingRef.current) return;
    pendingRef.current = true;
    triggerRef.current?.focus();
    setFeedback({ text, message: "正在复制…", pending: true });
    try {
      const result = await writeLearningClipboard(buildLearningClipboardContent(proseRef.current));
      const message = result === "rich" ? "已复制文本" : "已复制纯文本";
      setFeedback({ text, message, pending: false });
    } catch (error) {
      setFeedback({ text, message: `复制失败：${error instanceof Error ? error.message : "请重试"}`, pending: false });
    } finally {
      pendingRef.current = false;
    }
  }

  return <div className="copyable-learning-text min-w-0">
    <div ref={proseRef} className="copyable-learning-text__prose min-w-0">
      <RichLearningText text={text} emphasis={status === "error" ? undefined : emphasis} streaming={status === "streaming"} trailing={streaming
        ? <StreamingIndicator key={`${status}-${text.length}`} status={status}/>
        : undefined}/>
    </div>
    <div className={`copyable-learning-text__footer relative flex items-center justify-end gap-2 ${canCopy ? "mt-1" : ""}`}>
    <span id={feedbackId} role="status" aria-live="polite" className={`copyable-learning-text__feedback text-xs leading-5 ${current && canCopy ? "text-stone-500" : "sr-only"}`}>
      {current && canCopy ? t(current.message) : ""}
    </span>
    {canCopy && <button
      ref={triggerRef}
      type="button"
      onClick={() => void copy()}
      disabled={current?.pending}
      aria-label={t("复制讲解")}
      aria-describedby={current ? feedbackId : undefined}
      title={t("复制文本")}
      className="copyable-learning-text__copy flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-600 disabled:opacity-50"
    >
      <CopyIcon className="copyable-learning-text__icon h-4 w-4"/>
    </button>}
    </div>
  </div>;
}
