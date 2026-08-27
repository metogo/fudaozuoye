"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ProviderAvailability, ProviderId } from "@/lib/learning/types";
import { CameraIcon, ImageIcon, InfoIcon, NetworkIcon } from "./icons";

interface CaptureStepProps {
  providers: ProviderAvailability[];
  provider: ProviderId;
  ready: boolean;
  onProvider: (provider: ProviderId) => void;
  onFile: (file: File) => void;
}

export function CaptureStep(props: CaptureStepProps) {
  const [fileError, setFileError] = useState("");
  const [modelNotice, setModelNotice] = useState("");
  const modelNoticeTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (modelNoticeTimerRef.current !== null) window.clearTimeout(modelNoticeTimerRef.current); }, []);
  const selectProvider = (item: ProviderAvailability) => {
    props.onProvider(item.id);
    setModelNotice(`已成功切换到 ${item.label}。`);
    if (modelNoticeTimerRef.current !== null) window.clearTimeout(modelNoticeTimerRef.current);
    modelNoticeTimerRef.current = window.setTimeout(() => { setModelNotice(""); modelNoticeTimerRef.current = null; }, 3200);
  };
  const fileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setFileError("原始照片不能超过 20MB，请先压缩或重新拍摄。 "); return; }
    if (!file.type.startsWith("image/")) { setFileError("请选择有效的图片文件。 "); return; }
    setFileError(""); props.onFile(file);
  };
  return <main className="capture-screen capture-home relative mx-auto min-h-dvh w-full max-w-3xl overflow-hidden px-5 pb-12 pt-6 sm:px-8 sm:pt-8">
    <div className="capture-topology pointer-events-none absolute right-[-82px] top-[-72px] h-64 w-64" aria-hidden="true"><i/><i/><i/><i/></div>
    <header className="capture-hero relative mb-7">
      <div className="mb-7 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><span className="capture-brand-mark flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-950 text-white shadow-lg shadow-stone-300"><NetworkIcon className="h-5 w-5"/></span><div><p className="text-[10px] font-semibold tracking-[.2em] text-stone-500">KNOWLEDGE BACKTRACKING</p><p className="mt-0.5 text-[10px] text-stone-400">知识倒推 · 家长辅导</p></div></div>
        <span className="hidden rounded-full border border-stone-200 bg-white/75 px-3 py-1.5 text-[10px] font-semibold text-stone-500 shadow-sm backdrop-blur sm:inline-flex">单题模式</span>
      </div>
      <div><p className="mb-2 text-[11px] font-semibold tracking-[.16em] text-stone-400">不急着看答案，先找到真正卡点</p><h1 className="text-[2.35rem] font-semibold leading-[1.08] tracking-[-.055em] text-stone-950 sm:text-[2.75rem]">把不会，<br/>一步步拆到会。</h1><p className="mt-4 max-w-md text-sm leading-6 text-stone-500">从原题向下找到孩子已经会的基础，再一层层学回原题。</p></div>
    </header>

    <section className="capture-flow mb-8 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center rounded-2xl border border-stone-200/80 bg-white/75 px-3 py-3 shadow-[0_12px_35px_rgba(41,37,36,.06)] backdrop-blur" aria-label="辅导流程">
      <FlowStep number="01" label="拍下题目"/><span aria-hidden="true" className="text-stone-300">→</span><FlowStep number="02" label="找到卡点"/><span aria-hidden="true" className="text-stone-300">→</span><FlowStep number="03" label="学回原题"/>
    </section>

    <section className="model-selector mb-7" aria-labelledby="model-title">
      <div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-[10px] font-semibold tracking-[.14em] text-stone-400">ANALYSIS MODEL</p><h2 id="model-title" className="mt-1 text-sm font-semibold text-stone-800">选择本题使用的模型</h2></div><span className="text-[10px] leading-4 text-stone-400">开始后锁定</span></div>
      <div className="grid grid-cols-3 gap-2">
        {props.providers.map((item, index) => <button
          key={item.id}
          onClick={() => selectProvider(item)}
          className={`model-option relative min-h-[92px] overflow-hidden rounded-2xl border p-3 text-left transition ${props.provider === item.id ? "model-option-active border-stone-950 bg-stone-950 text-white shadow-xl shadow-stone-300" : "border-stone-200 bg-white/85 text-stone-800 shadow-sm hover:-translate-y-0.5 hover:border-stone-500 hover:shadow-md"}`}
          aria-pressed={props.provider === item.id}
        >
          <span className="relative z-10 mb-3 flex items-center justify-between text-[10px] tracking-[.12em] opacity-60">0{index + 1}<span className={`h-2 w-2 rounded-full ${props.provider === item.id ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.12)]" : "bg-stone-300"}`}/></span>
          <strong className="relative z-10 block text-[15px]">{item.label}</strong>
          <span className="relative z-10 mt-1 block text-[10px] opacity-60">{props.provider === item.id ? "本题已选" : item.id === "doubao" && item.mode === "live" ? "已连接" : "点击切换"}</span>
        </button>)}
      </div>
    </section>

    <section className="photo-entry capture-panel relative overflow-hidden rounded-[30px] bg-stone-900 p-6 text-white shadow-[0_24px_60px_rgba(41,37,36,.22)] sm:p-7">
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border border-white/10"/><div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full border border-white/10"/>
      <div className="relative z-10"><div className="mb-10 flex items-center justify-between"><span className="capture-camera-mark inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur"><CameraIcon className="h-5 w-5"/></span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold tracking-[.12em] text-stone-400">STEP 01 · 拍题</span></div><h2 className="mb-2 text-xl font-semibold tracking-tight">从一道不会的题开始</h2><p className="mb-6 max-w-sm text-sm leading-6 text-stone-400">拍照后自动识别题目。你只需核对内容，系统会沿真实前置知识向下拆解。</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={`capture-primary-action flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-stone-950 shadow-lg ${props.ready ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}><CameraIcon className="h-5 w-5"/>拍照<input disabled={!props.ready} type="file" accept="image/*" capture="environment" className="sr-only" onClick={(event) => { event.currentTarget.value = ""; }} onChange={fileChange}/></label>
          <label className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[.03] font-semibold transition hover:bg-white/[.07] ${props.ready ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}><ImageIcon className="h-5 w-5"/>相册<input disabled={!props.ready} type="file" accept="image/*" className="sr-only" onClick={(event) => { event.currentTarget.value = ""; }} onChange={fileChange}/></label>
        </div>
      </div>
    </section>

    <div className="mt-5 flex gap-3 rounded-2xl border border-stone-200/80 bg-white/65 px-4 py-3 text-xs leading-5 text-stone-500"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0"/><p>{fileError || (!props.ready ? "分析服务正在准备，请稍候。" : "照片只用于本题识别，不写入应用存储。请尽量避开姓名、学校、头像等身份信息。")}</p></div>
    {modelNotice && <div role="status" aria-live="polite" className="fixed inset-x-5 bottom-[max(20px,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-stone-300 bg-stone-950 px-4 py-3 text-sm leading-5 text-white shadow-2xl"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-stone-300"/><p>{modelNotice}</p></div>}
  </main>;
}

function FlowStep({ number, label }: { number: string; label: string }) {
  return <div className="min-w-0 text-center"><span className="block text-[9px] font-semibold tracking-[.12em] text-stone-400">{number}</span><strong className="mt-0.5 block truncate text-[11px] font-semibold text-stone-700">{label}</strong></div>;
}
