"use client";

/* eslint-disable @next/next/no-img-element */

import type { GradeBand, ProblemSnapshot, Subject } from "@/lib/learning/types";
import { ArrowIcon, CheckIcon, RefreshIcon } from "./icons";

export function ReviewStep({ problem, previewUrl, demo, onChange, onConfirm, onRetake, busy }: { problem: ProblemSnapshot; previewUrl: string; demo: boolean; onChange: (problem: ProblemSnapshot) => void; onConfirm: () => void; onRetake: () => void; busy: boolean }) {
  const set = <K extends keyof ProblemSnapshot>(key: K, value: ProblemSnapshot[K]) => onChange({ ...problem, [key]: value, userRevised: true });
  return <main className="review-screen mx-auto min-h-dvh w-full max-w-3xl px-5 pb-36 pt-7 sm:px-8">
    <div className="mb-7 flex items-center justify-between"><button onClick={onRetake} className="flex min-h-11 items-center gap-2 text-sm text-stone-600"><RefreshIcon className="h-4 w-4"/>返回首页</button><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800"><CheckIcon className="mr-1 inline h-3.5 w-3.5"/>识别完成</span></div>
    <h1 className="mb-2 text-3xl font-semibold tracking-[-.04em]">先确认，再分析</h1><p className="mb-7 text-sm leading-6 text-stone-500">{demo ? "演示模式使用固定样例，题干不可修改；连接真实模型后可修订识别内容。" : "请重点检查题干、公式、单位和孩子已写的步骤。识别有误时，再展开下方的课程范围设置。"}</p>
    <div className="mb-6 overflow-hidden rounded-2xl border border-stone-200 bg-stone-200"><img src={previewUrl} alt="裁剪后的题目" className="max-h-56 w-full object-contain"/></div>
    <div className="space-y-4">
      <label className="block"><span className="mb-2 block text-xs font-semibold text-stone-600">识别到的题目</span><textarea readOnly={demo} value={problem.text} onChange={(event) => set("text", event.target.value)} rows={4} className="w-full resize-none rounded-2xl border border-stone-200 bg-white p-4 text-[15px] leading-6 outline-none read-only:bg-stone-100 focus:border-stone-600"/></label>
      <label className="block"><span className="mb-2 block text-xs font-semibold text-stone-600">孩子已有作答 <span className="font-normal text-stone-400">没有可留空</span></span><textarea readOnly={demo} value={problem.childWork} onChange={(event) => set("childWork", event.target.value)} rows={3} className="w-full resize-none rounded-2xl border border-stone-200 bg-white p-4 text-[15px] leading-6 outline-none read-only:bg-stone-100 focus:border-stone-600"/></label>
      {!demo && <details className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3"><summary className="min-h-8 cursor-pointer text-sm font-medium text-stone-600">识别有误？调整课程范围</summary><div className="mt-4 grid grid-cols-2 gap-3"><label><span className="mb-2 block text-xs font-semibold text-stone-600">学科</span><select value={problem.subject} onChange={(event) => { const subject = event.target.value as Subject; onChange({ ...problem, subject, gradeBand: subject !== "math" && problem.gradeBand === "primary" ? "junior" : problem.gradeBand, userRevised: true }); }} className="min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm"><option value="math">数学</option><option value="physics">物理</option><option value="chemistry">化学</option></select></label><label><span className="mb-2 block text-xs font-semibold text-stone-600">学段</span><select value={problem.gradeBand} onChange={(event) => set("gradeBand", event.target.value as GradeBand)} className="min-h-12 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm"><option value="primary" disabled={problem.subject !== "math"}>小学</option><option value="junior">初中</option><option value="senior">高中</option></select></label></div></details>}
    </div>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-[#f4f3ef]/95 px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 backdrop-blur"><button onClick={onConfirm} disabled={busy || problem.text.trim().length < 3} className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-center gap-2 rounded-2xl bg-stone-950 font-semibold text-white disabled:opacity-40">{busy ? "正在生成知识路径…" : "确认，开始倒推"}<ArrowIcon className="h-5 w-5"/></button></div>
  </main>;
}
