"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent, type TextareaHTMLAttributes } from "react";
import type { ProblemSnapshot } from "@/lib/learning/types";
import { ArrowIcon, CheckIcon, RefreshIcon } from "./icons";

export type PreparationPhase = "recognizing" | "review" | "analyzing";

interface PreparationStepProps {
  phase: PreparationPhase;
  problem: ProblemSnapshot | null;
  previewUrl: string;
  demo: boolean;
  label: string;
  events: string[];
  busy: boolean;
  onChange: (problem: ProblemSnapshot) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRetake: () => void;
}

export function PreparationStep(props: PreparationStepProps) {
  const { phase, problem } = props;
  const [childWorkExpanded, setChildWorkExpanded] = useState(Boolean(problem?.childWork.trim()));
  const [originalVisible, setOriginalVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const working = phase !== "review";

  useEffect(() => {
    if (!working) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase, working]);

  const set = <K extends keyof ProblemSnapshot>(key: K, value: ProblemSnapshot[K]) => {
    if (problem) props.onChange({ ...problem, [key]: value, userRevised: true });
  };
  const progress = preparationProgress(phase, props.label, props.events);

  return <main className="preparation-screen mx-auto min-h-dvh w-full max-w-3xl px-5 pb-8 pt-5 sm:px-8 sm:pt-7" aria-busy={working}>
    <header className="mb-5 flex items-center justify-between gap-4">
      <button onClick={props.onRetake} className="flex min-h-11 items-center gap-2 text-sm font-medium text-stone-600"><RefreshIcon className="h-4 w-4"/>返回拍题</button>
      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${phase === "review" ? "bg-emerald-100 text-emerald-800" : "bg-stone-900 text-white"}`}>
        {phase === "review" ? <><CheckIcon className="mr-1 inline h-3.5 w-3.5"/>识别完成</> : phase === "recognizing" ? "正在识别" : "正在准备讲解"}
      </span>
    </header>

    <section className="overflow-hidden rounded-[26px] border border-stone-200 bg-white shadow-sm">
      {working && <div className="analysis-workbench border-b border-stone-800 px-5 py-5 text-white sm:px-7 sm:py-6" aria-live="polite">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-[10px] font-semibold tracking-[.16em] text-stone-400"><i className="analysis-live-dot"/>AI 工作中</span>
          <span className="rounded-full border border-white/10 bg-white/[.06] px-2.5 py-1 text-[10px] font-medium text-stone-300">{elapsed} 秒</span>
        </div>
        <div className="relative z-10 mt-5 flex items-center gap-4">
          <span className="analysis-core-loader" aria-hidden="true"><i/></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold tracking-[.12em] text-stone-500">当前：{progress.steps[progress.current]}</p><p className="mt-1 text-xl font-semibold leading-7 tracking-[-.035em] text-white">{props.label}</p></div>
        </div>
        <ol className="relative z-10 mt-6 grid grid-cols-3 gap-2" aria-label="AI 准备进度">
          {progress.steps.map((step, index) => {
            const state = index < progress.current ? "done" : index === progress.current ? "current" : "waiting";
            return <li key={step} className={`analysis-stage analysis-stage--${state}`}><span className="analysis-stage-mark">{state === "done" ? <CheckIcon className="h-3 w-3"/> : index + 1}</span><span>{step}</span></li>;
          })}
        </ol>
      </div>}

      {phase === "recognizing" && !problem && <div className="p-5 sm:p-7" aria-hidden="true">
        <div className="mb-5 flex items-center justify-between gap-4"><div><p className="text-[10px] font-semibold tracking-[.14em] text-stone-400">识别结果</p><p className="mt-1 text-lg font-semibold text-stone-800">题目会在这里展开</p></div><span className="h-8 w-16 rounded-full bg-stone-100"/></div>
        <div className="recognition-skeleton space-y-3 rounded-2xl border border-stone-100 bg-stone-50 p-4"><i className="w-full"/><i className="w-[92%]"/><i className="w-[76%]"/><i className="mt-5 w-[45%]"/></div>
      </div>}

      {phase === "review" && <div className="recognition-complete-strip flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/70 px-5 py-3 text-emerald-900 sm:px-7"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100"><CheckIcon className="h-4 w-4"/></span><div><p className="text-xs font-semibold">题目已在本页识别完成</p><p className="mt-0.5 text-[10px] text-emerald-700">核对内容后，直接开始学习</p></div></div>}

      {problem && <div className="recognition-result-enter space-y-5 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-[-.04em]">{phase === "review" ? "检查一下题目" : "题目已识别"}</h1>{phase === "review" && <p className="mt-2 text-sm text-stone-500">没问题就直接开始；识别错了可直接修改题目。</p>}</div>{phase === "review" && <button type="button" onClick={() => setOriginalVisible((visible) => !visible)} className="shrink-0 rounded-full border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600">{originalVisible ? "收起原图" : "查看原图"}</button>}</div>
        {phase === "review" && originalVisible && <div className="rounded-2xl bg-stone-100 p-3"><img src={props.previewUrl} alt="裁剪后的题目" className="mx-auto max-h-48 w-full rounded-xl object-contain"/></div>}
        <label className="block"><span className="mb-2 block text-xs font-semibold text-stone-600">题目</span><AutoGrowTextarea readOnly={props.demo || phase === "analyzing"} value={problem.text} onChange={(event) => set("text", event.target.value)} className="w-full resize-none overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 text-[15px] leading-7 outline-none read-only:bg-stone-50 focus:border-stone-600"/></label>
        {childWorkExpanded || problem.childWork.trim() ? <label className="block"><span className="mb-2 block text-xs font-semibold text-stone-600">我的作答 <span className="font-normal text-stone-400">没有可留空</span></span><AutoGrowTextarea autoFocus={!problem.childWork.trim() && childWorkExpanded} readOnly={props.demo || phase === "analyzing"} value={problem.childWork} onChange={(event) => set("childWork", event.target.value)} placeholder="补充已经写下的步骤（可选）" className="w-full resize-none overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 text-[15px] leading-7 outline-none read-only:bg-stone-50 focus:border-stone-600"/></label> : phase === "review" && <button type="button" disabled={props.demo} onClick={() => setChildWorkExpanded(true)} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 text-left disabled:cursor-default"><span className="text-sm text-stone-500">没有识别到我的作答</span>{!props.demo && <span className="text-xs font-semibold text-stone-800">需要时补充</span>}</button>}
      </div>}
    </section>

    <div className="sticky bottom-0 z-20 -mx-5 mt-6 border-t border-stone-200 bg-[#f4f3ef]/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-8 sm:px-8">
      {phase === "review" ? <button onClick={props.onConfirm} disabled={props.busy || !problem || problem.text.trim().length < 3} className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-center gap-2 rounded-2xl bg-stone-950 font-semibold text-white disabled:opacity-40">确认题目，开始学习<ArrowIcon className="h-5 w-5"/></button> : <button onClick={props.onCancel} className="mx-auto min-h-12 w-full max-w-3xl rounded-2xl border border-stone-300 bg-white text-sm font-semibold text-stone-700">{phase === "recognizing" ? "停止识别" : "停止准备"}</button>}
    </div>
  </main>;
}

function preparationProgress(phase: PreparationPhase, label: string, events: string[]) {
  const text = [...events, label].join(" ");
  if (phase === "recognizing") {
    return { steps: ["读取图片", "识别题目", "等待确认"], current: text.includes("识别题干") ? 1 : 0 };
  }
  const steps = ["读懂题意", "找到学习起点", "生成专属讲解"];
  if (/讲法|练习|准备针对/.test(text)) return { steps, current: 2 };
  if (/起点|前置|知识/.test(text)) return { steps, current: 1 };
  return { steps, current: 0 };
}

function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = (element: HTMLTextAreaElement) => { element.style.height = "0px"; element.style.height = `${element.scrollHeight}px`; };
  useEffect(() => { if (ref.current) resize(ref.current); }, [props.value]);
  const change = (event: ChangeEvent<HTMLTextAreaElement>) => { resize(event.currentTarget); props.onChange?.(event); };
  return <textarea {...props} ref={ref} rows={1} onChange={change}/>;
}
