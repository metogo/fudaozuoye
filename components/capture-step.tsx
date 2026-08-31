"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { learningQuotes } from "@/lib/learning/quotes";
import type { ProviderAvailability, ProviderId } from "@/lib/learning/types";
import { CameraIcon, ImageIcon, InfoIcon, RefreshIcon } from "./icons";

const quoteBagKey = "learning-quote-shuffle-bag-v1";

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
  const [quoteIndex, setQuoteIndex] = useState(() => takeNextQuoteIndex());
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const screenRef = useRef<HTMLElement | null>(null);
  const modelNoticeTimerRef = useRef<number | null>(null);
  const pullStartRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const pullingRef = useRef(false);

  useEffect(() => () => { if (modelNoticeTimerRef.current !== null) window.clearTimeout(modelNoticeTimerRef.current); }, []);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1 || window.scrollY > 0) return;
      pullStartRef.current = event.touches[0].clientY;
      pullingRef.current = true;
      setPulling(true);
    };
    const move = (event: TouchEvent) => {
      if (!pullingRef.current || event.touches.length !== 1) return;
      const delta = event.touches[0].clientY - pullStartRef.current;
      if (delta <= 0) return;
      event.preventDefault();
      const distance = Math.min(84, delta * 0.62);
      pullDistanceRef.current = distance;
      setPullDistance(distance);
    };
    const finish = (refresh: boolean) => {
      if (!pullingRef.current) return;
      const shouldChange = refresh && pullDistanceRef.current >= 60;
      pullingRef.current = false;
      pullDistanceRef.current = 0;
      setPulling(false);
      setPullDistance(0);
      if (shouldChange) setQuoteIndex((current) => takeNextQuoteIndex(current));
    };
    const end = () => finish(true);
    const cancel = () => finish(false);
    screen.addEventListener("touchstart", start, { passive: true });
    screen.addEventListener("touchmove", move, { passive: false });
    screen.addEventListener("touchend", end, { passive: true });
    screen.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      screen.removeEventListener("touchstart", start);
      screen.removeEventListener("touchmove", move);
      screen.removeEventListener("touchend", end);
      screen.removeEventListener("touchcancel", cancel);
    };
  }, []);

  const selectProvider = (item: ProviderAvailability) => {
    props.onProvider(item.id);
    setModelNotice(`已切换到 ${item.label}`);
    if (modelNoticeTimerRef.current !== null) window.clearTimeout(modelNoticeTimerRef.current);
    modelNoticeTimerRef.current = window.setTimeout(() => { setModelNotice(""); modelNoticeTimerRef.current = null; }, 2600);
  };

  const fileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setFileError("图片不能超过 20MB"); return; }
    if (!file.type.startsWith("image/")) { setFileError("请选择图片文件"); return; }
    setFileError("");
    props.onFile(file);
  };

  const quote = learningQuotes[quoteIndex];
  const longestQuoteLine = Math.max(...quote.text.split("\n").map((line) => line.length));
  const quoteSize = longestQuoteLine > 9 ? "text-[1.72rem] sm:text-[2.35rem]" : longestQuoteLine > 7 ? "text-[2.05rem] sm:text-[2.65rem]" : "text-[2.6rem] sm:text-[3.25rem]";
  const pullReady = pullDistance >= 60;

  return <main ref={screenRef} className="capture-screen relative mx-auto min-h-dvh w-full max-w-3xl overscroll-y-contain">
    <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-stone-300/60"/>
    <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border border-stone-300/45"/>
    <div aria-hidden="true" className="pointer-events-none absolute right-16 top-24 h-2.5 w-2.5 rounded-full bg-stone-950 shadow-[0_0_0_8px_rgba(28,25,23,.04)]"/>
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 top-2 z-10 flex items-center justify-center gap-2 text-xs font-medium text-stone-500" style={{ opacity: Math.min(1, pullDistance / 35), transform: `translateY(${Math.max(-22, pullDistance - 52)}px)` }}><RefreshIcon className={`h-4 w-4 transition-transform ${pullReady ? "rotate-180" : ""}`}/>{pullReady ? "松开，换一句" : "继续下拉"}</div>
    <div className={`grid min-h-dvh grid-rows-[1fr_auto] px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8 ${pulling ? "" : "transition-transform duration-300 ease-out"}`} style={{ transform: `translateY(${pullDistance}px)` }}>
    <div className="relative z-[1] flex flex-col justify-start pb-8 pt-14 sm:pb-10 sm:pt-20">
      <blockquote key={quoteIndex} className="quote-enter relative mb-7 pt-5">
        <span aria-hidden="true" className="absolute -left-1 -top-8 font-serif text-7xl leading-none text-stone-200">“</span>
        <p className={`relative whitespace-pre-line font-semibold leading-[1.08] tracking-[-.055em] text-stone-950 ${quoteSize}`}>{quote.text}</p>
        <div className="mt-3 flex items-center justify-between gap-4"><cite className="text-xs not-italic tracking-[.08em] text-stone-400">—{quote.source}</cite><span className="flex items-center gap-1.5 text-[10px] text-stone-400"><RefreshIcon className="h-3 w-3"/>下拉换一句</span></div>
      </blockquote>

      <div className="home-learning-path mb-3 flex items-center gap-3 px-1" aria-label="学习路径">
        <p className="shrink-0 text-[9px] font-semibold tracking-[.16em] text-stone-400">学习路径</p>
        <ol className="flex min-w-0 flex-1 items-center">
          {["拍下题目", "AI 讲懂", "独立做会"].map((label, index) => <li key={label} className="home-learning-path-step flex min-w-0 flex-1 items-center last:flex-none"><span className="flex shrink-0 items-baseline gap-1.5 text-stone-500"><span className="text-[8px] font-bold tracking-[.08em] text-stone-300">0{index + 1}</span><span className="text-[10px] font-medium">{label}</span></span>{index < 2 && <span aria-hidden="true" className="mx-2 h-px min-w-2 flex-1 bg-stone-300/70"/>}</li>)}
        </ol>
      </div>

      <section className="capture-panel overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-[0_18px_48px_rgba(41,37,36,.12)]" aria-label="开始学习">
        <div className="photo-entry relative bg-stone-900 p-5 text-white sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full border border-white/10"/>
          <div className="relative z-10">
            <div className="mb-7 flex items-center justify-between gap-4">
              <div><p className="text-[10px] font-semibold tracking-[.15em] text-stone-500">START HERE</p><h1 className="mt-1.5 text-xl font-semibold tracking-[-.03em]">从这道题开始</h1></div>
              <span className="capture-camera-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10"><CameraIcon className="h-5 w-5"/></span>
            </div>
            <div className="grid grid-cols-[1.08fr_.92fr] gap-3">
              <label className={`flex min-h-[124px] flex-col justify-between rounded-[26px] bg-white p-4 text-stone-950 shadow-[0_12px_28px_rgba(0,0,0,.2)] transition active:translate-y-px active:scale-[.985] ${props.ready ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-950 text-white"><CameraIcon className="h-5 w-5"/></span><span><strong className="block text-[17px] font-bold tracking-[-.025em]">拍照解题</strong><small className="mt-0.5 block text-[10px] font-semibold text-stone-500">打开相机</small></span><input disabled={!props.ready} type="file" accept="image/*" capture="environment" className="sr-only" onClick={(event) => { event.currentTarget.value = ""; }} onChange={fileChange}/></label>
              <label className={`flex min-h-[124px] flex-col justify-between rounded-[26px] border border-white/20 bg-white/[.035] p-4 text-white transition hover:bg-white/[.07] active:translate-y-px active:scale-[.985] ${props.ready ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/[.06]"><ImageIcon className="h-5 w-5"/></span><span><strong className="block text-[17px] font-bold tracking-[-.025em]">相册选题</strong><small className="mt-0.5 block text-[10px] font-semibold text-stone-500">选择已有照片</small></span><input disabled={!props.ready} type="file" accept="image/*" className="sr-only" onClick={(event) => { event.currentTarget.value = ""; }} onChange={fileChange}/></label>
            </div>
          </div>
        </div>
        <div className="border-t border-stone-100 p-4 sm:px-5">
          <div className="mb-2 flex min-h-6 items-center justify-between gap-3"><p className="text-xs font-semibold text-stone-600">选择解题模型</p>{modelNotice ? <span role="status" aria-live="polite" className="quote-enter rounded-full bg-stone-950 px-2.5 py-1 text-[10px] font-medium text-white">{modelNotice}</span> : <p className="text-[10px] text-stone-400">拍题后锁定</p>}</div>
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1.5">
            {props.providers.map((item) => <button key={item.id} type="button" onClick={() => selectProvider(item)} aria-pressed={props.provider === item.id} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition ${props.provider === item.id ? "bg-white text-stone-950 shadow-sm" : "text-stone-500"}`}><span className={`h-2 w-2 rounded-full ${props.provider === item.id ? "bg-emerald-500" : "bg-stone-300"}`}/>{item.label}</button>)}
          </div>
        </div>
      </section>
    </div>

    <p className={`flex gap-2 border-t border-stone-200 pt-4 text-xs leading-5 ${fileError || !props.ready ? "text-red-700" : "text-stone-400"}`}><InfoIcon className="mt-0.5 h-4 w-4 shrink-0"/>{fileError || (!props.ready ? "AI 服务正在准备，请稍候" : "照片只用于本题识别，不会保存在应用中")}</p>
    </div>
  </main>;
}

function takeNextQuoteIndex(current = -1): number {
  const saved = readQuoteBag();
  const previous = current >= 0 ? current : saved?.last ?? -1;
  const remaining = [...new Set(saved?.remaining.filter((index) => Number.isInteger(index) && index >= 0 && index < learningQuotes.length && index !== previous) ?? [])];
  const bag = remaining.length ? remaining : shuffleQuoteIndices(previous);
  const next = bag.pop() ?? 0;
  try { sessionStorage.setItem(quoteBagKey, JSON.stringify({ remaining: bag, last: next })); } catch { /* 当前页面仍可继续随机切换 */ }
  return next;
}

function readQuoteBag(): { remaining: number[]; last: number } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(quoteBagKey) ?? "null") as unknown;
    if (!value || typeof value !== "object") return null;
    const item = value as { remaining?: unknown; last?: unknown };
    if (!Array.isArray(item.remaining) || typeof item.last !== "number") return null;
    return { remaining: item.remaining.filter((index): index is number => typeof index === "number"), last: item.last };
  } catch { return null; }
}

function shuffleQuoteIndices(exclude: number): number[] {
  const indices = learningQuotes.map((_, index) => index).filter((index) => index !== exclude);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [indices[index], indices[swap]] = [indices[swap], indices[index]];
  }
  return indices;
}

function randomIndex(limit: number): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % limit;
}
