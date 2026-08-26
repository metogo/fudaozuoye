"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ProviderAvailability, ProviderId } from "@/lib/learning/types";
import { CameraIcon, ImageIcon, InfoIcon, LockIcon, NetworkIcon } from "./icons";

interface CaptureStepProps {
  providers: ProviderAvailability[];
  provider: ProviderId;
  ready: boolean;
  onProvider: (provider: ProviderId) => void;
  onFile: (file: File) => void;
  onResetConsent: () => void;
}

export function CaptureStep(props: CaptureStepProps) {
  const [fileError, setFileError] = useState("");
  const [modelNotice, setModelNotice] = useState("");
  const modelNoticeTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (modelNoticeTimerRef.current !== null) window.clearTimeout(modelNoticeTimerRef.current); }, []);
  const selectProvider = (item: ProviderAvailability) => {
    if (item.id === "doubao") { props.onProvider(item.id); return; }
    setModelNotice(`${item.label} 正在接入中，后续会上架使用；本题请继续使用豆包。`);
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
  return <main className="capture-screen mx-auto min-h-dvh w-full max-w-3xl px-5 pb-12 pt-7 sm:px-8">
    <header className="mb-10 flex items-start justify-between">
      <div><div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[.18em] text-stone-500"><NetworkIcon className="h-4 w-4"/> KNOWLEDGE BACKTRACKING</div><h1 className="text-[2rem] font-semibold leading-tight tracking-[-.045em] text-stone-950">把不会，<br/>一步步拆到会。</h1></div>
      <button onClick={props.onResetConsent} className="flex min-h-11 items-center gap-1 rounded-full border border-stone-300 px-3 text-xs font-medium text-stone-600"><LockIcon className="h-4 w-4"/>隐私</button>
    </header>

    <section className="model-selector mb-8" aria-labelledby="model-title">
      <div className="mb-3 flex items-center justify-between"><h2 id="model-title" className="text-sm font-semibold text-stone-800">本题使用的模型</h2><span className="text-xs text-stone-500">分析开始后不可更换</span></div>
      <div className="grid grid-cols-3 gap-2">
        {props.providers.map((item, index) => <button
          key={item.id}
          disabled={item.id === "doubao" && !item.available}
          onClick={() => selectProvider(item)}
          className={`model-option min-h-[82px] rounded-2xl border p-3 text-left transition ${props.provider === item.id ? "border-stone-950 bg-stone-950 text-white shadow-lg" : "border-stone-200 bg-white text-stone-800"} ${item.id !== "doubao" ? "hover:border-stone-500" : ""} disabled:cursor-not-allowed disabled:opacity-35`}
          aria-pressed={props.provider === item.id}
        >
          <span className="mb-2 flex items-center justify-between text-[11px] opacity-65">0{index + 1}<span className={`h-1.5 w-1.5 rounded-full ${item.id !== "doubao" ? "bg-stone-400" : item.mode === "live" ? "bg-emerald-400" : item.mode === "demo" ? "bg-amber-400" : "bg-stone-400"}`}/></span>
          <strong className="block text-sm">{item.label}</strong>
          <span className="mt-1 block text-[10px] opacity-60">{item.id !== "doubao" ? "即将上线" : item.mode === "demo" ? "演示模式" : item.mode === "live" ? "已连接" : "未配置"}</span>
        </button>)}
      </div>
    </section>

    <section className="photo-entry relative overflow-hidden rounded-[28px] bg-stone-900 p-6 text-white shadow-2xl shadow-stone-300">
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border border-white/10"/><div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full border border-white/10"/>
      <div className="relative"><span className="mb-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10"><CameraIcon className="h-5 w-5"/></span><h2 className="mb-2 text-xl font-semibold tracking-tight">拍下一道不会的题</h2><p className="mb-6 max-w-sm text-sm leading-6 text-stone-400">系统会自动识别题目、学科和学段。下一步只需核对；识别错了再修正，不会直接给答案。</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-stone-950 ${props.ready ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}><CameraIcon className="h-5 w-5"/>拍照<input disabled={!props.ready} type="file" accept="image/*" capture="environment" className="sr-only" onClick={(event) => { event.currentTarget.value = ""; }} onChange={fileChange}/></label>
          <label className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 font-semibold ${props.ready ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}><ImageIcon className="h-5 w-5"/>相册<input disabled={!props.ready} type="file" accept="image/*" className="sr-only" onClick={(event) => { event.currentTarget.value = ""; }} onChange={fileChange}/></label>
        </div>
      </div>
    </section>

    <div className="mt-6 flex gap-3 px-1 text-xs leading-5 text-stone-500"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0"/><p>{fileError || (!props.ready ? "所选模型尚未连接，请先在本地环境变量中配置模型。" : "照片只用于本题识别，不写入应用存储。请尽量避开姓名、学校、头像等身份信息。")}</p></div>
    {modelNotice && <div role="status" aria-live="polite" className="fixed inset-x-5 bottom-[max(20px,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-stone-300 bg-stone-950 px-4 py-3 text-sm leading-5 text-white shadow-2xl"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-stone-300"/><p>{modelNotice}</p></div>}
  </main>;
}
