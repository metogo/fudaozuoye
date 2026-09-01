"use client";

import { useState, type ReactNode } from "react";
import type { BoardAnnotation, BoardConversationMessage, BoardSceneIntent } from "@/lib/learning/types";
import { learningTextToPlainText } from "@/lib/learning/presentation";
import { RichLearningText } from "./rich-learning-text";

export function BoardSourceTrail({ label, messages }: { label: string; messages: BoardConversationMessage[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return <div className="board-source-trail" aria-label="板书内容来源"><span>{label}</span>{messages.map((message) => <div className={`board-source-item${expandedId === message.id ? " board-source-item--expanded" : ""}`} key={message.id}><button type="button" aria-expanded={expandedId === message.id} onClick={() => setExpandedId((current) => current === message.id ? null : message.id)}>{message.scopeLabel ?? (message.role === "user" ? "你的提问" : "刚才的讲解")}</button>{expandedId === message.id && <div className="board-source-excerpt"><RichLearningText text={message.text.slice(0, 180)} compact/>{message.text.length > 180 && "…"}</div>}</div>)}</div>;
}

export function MarkedBoardText({ content, annotations }: { content: string; annotations: BoardAnnotation[] }) {
  const marks = annotations.map((annotation) => {
    const index = content.indexOf(annotation.target);
    const range = index >= 0 ? expandProtectedRange(content, index, index + annotation.target.length) : null;
    return range ? { annotation, start: range.start, end: range.end } : null;
  }).filter((item): item is { annotation: BoardAnnotation; start: number; end: number } => Boolean(item)).sort((a, b) => a.start - b.start);
  if (marks.length === 0) return <RichLearningText text={content}/>;
  const output: ReactNode[] = [];
  let cursor = 0;
  marks.forEach(({ annotation, start, end }) => {
    if (start < cursor) return;
    const before = content.slice(cursor, start);
    if (before) output.push(<RichLearningText key={`text-${cursor}`} text={before} compact/>);
    output.push(<mark key={`${annotation.blockId}-${annotation.target}`} title={learningTextToPlainText(annotation.reason)} className={`board-mark board-mark--${annotation.kind}`}><RichLearningText text={content.slice(start, end)} compact/></mark>);
    cursor = end;
  });
  const remainder = content.slice(cursor);
  if (remainder) output.push(<RichLearningText key={`text-${cursor}`} text={remainder} compact/>);
  return <>{output}</>;
}

export function AnnotationNotes({ annotations }: { annotations: BoardAnnotation[] }) {
  if (annotations.length === 0) return null;
  return <div className="mt-4 space-y-2" aria-label="重点标记说明">{annotations.map((annotation) => <div key={`${annotation.blockId}-${annotation.target}`} className="board-annotation-note"><span>{annotation.kind === "circle" ? "圈出" : annotation.kind === "underline" ? "划线" : "框住"}</span><RichLearningText text={annotation.reason} compact/></div>)}</div>;
}

export function sceneIntentLabel(intent: BoardSceneIntent): string {
  if (intent === "extract") return "提取条件";
  if (intent === "connect") return "连接关系";
  if (intent === "derive") return "展开推理";
  if (intent === "compare") return "对照辨析";
  return "回看验证";
}

function expandProtectedRange(content: string, start: number, end: number): { start: number; end: number } {
  const protectedRanges = Array.from(content.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]*`/g)).map((match) => ({ start: match.index!, end: match.index! + match[0].length }));
  return protectedRanges.find((range) => start >= range.start && end <= range.end) ?? { start, end };
}
