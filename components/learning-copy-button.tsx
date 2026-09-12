"use client";

import { useId, useRef, useState, type RefObject } from "react";
import { buildLearningClipboardContent, writeLearningClipboard } from "@/lib/learning/copy-rich-text";
import { CopyIcon } from "./icons";
import { useUiText } from "./ui-language";

/** Loaded with the completed lesson, before the trusted clipboard click. */
export function LearningCopyButton({ proseRef, text }: { proseRef: RefObject<HTMLDivElement | null>; text: string }) {
  const t = useUiText();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const feedbackId = useId();
  const [feedback, setFeedback] = useState<{ text: string; message: string; pending: boolean } | null>(null);
  const current = feedback?.text === text ? feedback : null;
  async function copy() {
    if (!proseRef.current || pendingRef.current) return;
    pendingRef.current = true;
    triggerRef.current?.focus();
    setFeedback({ text, message: "正在复制…", pending: true });
    try {
      const result = await writeLearningClipboard(buildLearningClipboardContent(proseRef.current));
      setFeedback({ text, message: result === "rich" ? "已复制文本" : "已复制纯文本", pending: false });
    } catch (error) {
      setFeedback({ text, message: `复制失败：${error instanceof Error ? error.message : "请重试"}`, pending: false });
    } finally { pendingRef.current = false; }
  }
  return <>
    <span id={feedbackId} role="status" aria-live="polite" className={`copyable-learning-text__feedback text-xs leading-5 ${current ? "text-stone-500" : "sr-only"}`}>{current && t(current.message)}</span>
    <button ref={triggerRef} type="button" onClick={() => void copy()} disabled={current?.pending}
      aria-label={t("复制讲解")} aria-describedby={current ? feedbackId : undefined} title={t("复制文本")}
      className="copyable-learning-text__copy flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-600 disabled:opacity-50">
      <CopyIcon className="copyable-learning-text__icon h-4 w-4"/>
    </button>
  </>;
}
