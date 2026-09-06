"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { LearningGate } from "@/lib/learning/types";
import { prepareStepAnswerMarkdown } from "@/lib/learning/step-answer-format";
import { RichLearningText } from "./lazy-rich-learning-text";
const WhiteboardInput = dynamic(() => import("./whiteboard-input").then((module) => module.WhiteboardInput), { ssr: false });

export function StepBlank({ gate, busy, onHint, onReveal, onContinue, onTranscribe }: {
  gate: LearningGate; busy: boolean; onHint: () => void;
  onReveal?: () => void;
  onContinue?: () => void;
  onTranscribe?: (gateId: string, blob: Blob, signal: AbortSignal) => Promise<{ text: string; confidence: number }>;
}) {
  const [draft, setValue] = useState<string | null>(null);
  const value = draft ?? gate.stepAnswer?.answer ?? "";
  const showingAnswer = Boolean(gate.stepAnswer && draft === null);
  const [open, setOpen] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const fill = async (blob: Blob, url: string) => {
    URL.revokeObjectURL(url);
    if (!onTranscribe || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRecognizing(true); setNotice("");
    try {
      const result = await onTranscribe(gate.id, blob, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.text.trim()) throw new Error("没有识别清楚，请重写或用键盘填写");
      if (result.text.length > 300) throw new Error("这一步只需要简短填写，请只写空格里的内容。");
      setValue(result.text); setOpen(false);
      setNotice(result.confidence < 0.72 ? "识别可能有误，请核对或修改。" : "已回填，可以修改或显示答案对照。");
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "识别失败，手写内容已保留，请重试。");
    } finally {
      if (!controller.signal.aborted) setRecognizing(false);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };
  const blank = gate.stepBlank!;
  return <section aria-label="当前步骤填空" className="step-blank" data-answer-revealed={showingAnswer || undefined}>
    {gate.prompt && <p className="mb-3 text-sm font-medium leading-6 text-stone-600">{gate.prompt}</p>}
    <div className="step-blank__sentence"><RichLearningText text={blank.before} compact/><button type="button" className="step-blank__slot" aria-label={value ? "修改这个空的答案" : "点击填写这个空"} disabled={busy || recognizing} onClick={() => setOpen(true)}>{value ? <RichLearningText text={prepareStepAnswerMarkdown(value)} compact/> : "点击填写"}</button>{blank.after && <RichLearningText text={blank.after} compact/>}</div>
    <p className="mt-3 text-xs leading-5 text-stone-500">只填这一个空，不用重做整题。点击空格可以手写。</p>
    <button type="button" disabled={busy || recognizing} className="min-h-11 text-xs text-stone-500 underline underline-offset-4" onClick={() => setEditing(!editing)}>{editing ? "收起键盘修改" : "也可以用键盘填写 / 修改"}</button>
    {editing && <input aria-label="修改填空答案" maxLength={300} value={value} disabled={busy || recognizing} onChange={(event) => setValue(event.target.value)} className="mb-3 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3"/>}
    {!open && notice && <p role="status" className="mb-3 text-xs text-stone-600">{notice}</p>}
    <div className="step-blank__actions grid grid-cols-2 gap-2"><button type="button" disabled={busy || recognizing || (showingAnswer ? !onContinue : !gate.stepAnswer && !onReveal)} onClick={() => { if (showingAnswer) { onContinue?.(); return; } setValue(null); setNotice(""); setEditing(false); if (!gate.stepAnswer) onReveal?.(); }} className="min-h-12 rounded-xl bg-stone-950 px-3 text-sm font-semibold text-white disabled:opacity-40">{showingAnswer ? "看懂了，继续" : "显示答案"}</button><button type="button" disabled={busy || recognizing} onClick={onHint} className="min-h-12 rounded-xl border border-stone-200 text-sm text-stone-600">给我一点提示</button></div>
    {open && createPortal(<WhiteboardInput title="填写这一个空" taskLabel={`${gate.prompt ?? ""} ${blank.before} 【待填写】 ${blank.after}`} submitLabel="识别并填入" pending={recognizing} statusMessage={notice} showTask hint="只写空格里的内容；回填后还可以修改，不会自动提交。" onConfirm={(blob, url) => { void fill(blob, url); }} onCancel={() => { controllerRef.current?.abort(); controllerRef.current = null; setRecognizing(false); setOpen(false); }}/>, document.body)}
  </section>;
}
