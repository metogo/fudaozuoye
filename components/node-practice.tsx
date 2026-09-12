"use client";

import { useEffect, useRef, useState } from "react";
import { parseNodePractice, type NodePractice as Practice } from "@/lib/learning/node-practice";
import type { MapConcept, ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
import { RichLearningText } from "./lazy-rich-learning-text";
import { useUiText } from "./ui-language";

export interface NodePracticeProps { focus: MapConcept; map: ProblemKnowledgeMap; stateToken: string; partial: boolean }
export function NodePractice({ focus, map, stateToken, partial }: NodePracticeProps) {
  const t = useUiText();
  const [open, setOpen] = useState(false);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [number, setNumber] = useState(0);
  const history = useRef<string[]>([]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  async function generate() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setOpen(true); setPending(true); setError(false);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
      const response = await fetch(`${base}/learning/node-practice`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateToken, map, nodeId: focus.id, partial, previous: history.current }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
      const body = await response.json();
      if (!response.ok) throw new Error("练习生成失败");
      const next = parseNodePractice(body.practice);
      if (controller.signal.aborted) return;
      history.current = [...history.current, next.question].slice(-5);
      setPractice(next); setSelected(null); setChecked(false); setNumber(value => value + 1);
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (request.current === controller) { request.current = null; setPending(false); } }
  }
  const close = () => { request.current?.abort(); request.current = null; setPending(false); setOpen(false); };
  return <section className="node-practice mt-4 rounded-2xl border border-emerald-900/10 bg-white p-4" aria-label={t("知识点小练习")}>
    <div className="node-practice-heading flex items-center justify-between gap-3">
      <div><span className="text-[10px] tracking-wide text-emerald-800/60">{t("从理解到运用")}</span><h3 className="mt-1 text-sm font-semibold text-emerald-950">{t("用一道题，试试这个知识点")}</h3></div>
      {open && <button type="button" className="node-practice-collapse min-h-11 px-2 text-xs text-stone-500" onClick={close}>{t("收起练习")}</button>}
    </div>
    <p className="mt-2 text-xs leading-5 text-stone-500">{t("本题 → {concept} → 小练习", { concept: focus.title })}</p>
    {!open ? <button type="button" className="node-practice-open mt-3 min-h-11 w-full rounded-xl bg-emerald-50 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2" onClick={() => practice ? setOpen(true) : void generate()}>{t(practice ? "继续这道练习" : "练一道")} <span aria-hidden="true">→</span></button>
      : <div className="node-practice-body mt-3 border-t border-emerald-900/10 pt-3" aria-busy={pending}>
        <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-stone-500">{t("AI 原创练习 · 非真题")}{practice && ` · ${number}`}</span>
          <button type="button" disabled={pending} onClick={() => void generate()} aria-label={t("换一道练习")} title={t("换一道练习")} className="node-practice-refresh flex min-h-11 min-w-11 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">
            <svg className={pending ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg>
          </button></div>
        {pending && <div className="node-practice-loading my-3" role="status"><p className="text-xs text-emerald-800">{t(practice ? "正在换题，当前练习会保留" : "正在出题并核对答案…")}</p>{!practice && <div className="mt-3 min-h-24 space-y-3 animate-pulse motion-reduce:animate-none" aria-hidden="true"><div className="h-3 w-4/5 rounded bg-emerald-50"/><div className="h-3 w-3/5 rounded bg-emerald-50"/><div className="h-10 rounded-xl bg-stone-50"/></div>}</div>}
        {error && <div className="node-practice-error my-3 rounded-xl bg-amber-50 p-3 text-xs leading-5" role="alert"><p>{t("暂未获得合适的练习，不影响原题学习。")}</p><button type="button" className="min-h-11 font-semibold text-emerald-800" onClick={() => void generate()} disabled={pending}>{t("重试练习")}</button></div>}
        {practice && <div className="node-practice-question space-y-3">
          <RichLearningText text={practice.question}/>
          <fieldset disabled={pending || checked} className="space-y-2"><legend className="sr-only">{t("选择一个答案")}</legend>{practice.options.map((option, index) => <label key={`${number}:${index}`} className={`node-practice-option flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${selected === index ? "border-emerald-700 bg-emerald-50" : "border-stone-200"}`}>
            <input className="mt-1 accent-emerald-800" type="radio" name={`practice-${focus.id}`} checked={selected === index} onChange={() => setSelected(index)}/><span className="min-w-0"><span className="mr-2 text-stone-500">{String.fromCharCode(65 + index)}.</span><RichLearningText text={option} compact/></span>
          </label>)}</fieldset>
          {!checked ? <button type="button" disabled={selected === null || pending} onClick={() => setChecked(true)} className="node-practice-check min-h-11 w-full rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-35">{t("核对思路")}</button>
            : <div className="node-practice-feedback rounded-xl bg-emerald-50/60 p-3" role="status"><p className="mb-2 text-sm font-semibold text-emerald-900">{t(selected === practice.correctIndex ? "这次选对了，看看依据" : "再看这一步")}</p><p className="mb-2 text-xs">{t("参考答案：{answer}", { answer: String.fromCharCode(65 + practice.correctIndex) })}</p><RichLearningText text={practice.explanation}/></div>}
          {checked && <div className="node-practice-connection border-l-2 border-amber-300 pl-3"><h4 className="mb-1 text-xs font-semibold text-emerald-800">{t("带回原题")}</h4><RichLearningText text={practice.connection}/></div>}
        </div>}
        <p className="mt-3 text-[10px] leading-5 text-stone-400">{t("只检验当前知识点，不改变原题学习进度。")}</p>
      </div>}
  </section>;
}
