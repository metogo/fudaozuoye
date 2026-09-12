"use client";

import { useRef, type ComponentProps } from "react";
import { RichLearningText } from "./lazy-rich-learning-text";
import { StreamingIndicator } from "./streaming-indicator";
import { createOptionalLearningFeature } from "./optional-learning-feature";
import type { LearningEmphasis } from "@/lib/learning/learning-emphasis";

const CopyButton = createOptionalLearningFeature<ComponentProps<typeof import("./learning-copy-button").LearningCopyButton>>(
  () => import("./learning-copy-button").then(module => ({ default: module.LearningCopyButton })), "复制文本",
  <span className="copy-button-loading h-11 w-11" aria-hidden="true"/>,
);

interface CopyableLearningTextProps {
  emphasis?: LearningEmphasis[];
  text: string;
  status?: "streaming" | "finishing" | "complete" | "error";
}

export function CopyableLearningText({ text, status, emphasis }: CopyableLearningTextProps) {
  const proseRef = useRef<HTMLDivElement>(null);
  const canCopy = (status === "complete" || status === undefined) && text.trim().length > 0;
  const streaming = status === "streaming" || status === "finishing";
  return <div className="copyable-learning-text min-w-0">
    <div ref={proseRef} className="copyable-learning-text__prose min-w-0">
      <RichLearningText text={text} collapsePitfalls emphasis={status === "error" ? undefined : emphasis} streaming={status === "streaming"} trailing={streaming
        ? <StreamingIndicator key={`${status}-${text.length}`} status={status}/>
        : undefined}/>
    </div>
    <div className={`copyable-learning-text__footer relative flex items-center justify-end gap-2 ${canCopy ? "mt-1" : ""}`}>
      {canCopy && <CopyButton proseRef={proseRef} text={text}/>}
    </div>
  </div>;
}
