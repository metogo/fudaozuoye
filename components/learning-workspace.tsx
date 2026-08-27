"use client";

import { useEffect, useRef, useState } from "react";
import { isMastered } from "@/lib/learning/graph";
import type { KnowledgeNode, LearningSession } from "@/lib/learning/types";
import { ArrowIcon, CheckIcon, CloseIcon, InfoIcon, NetworkIcon, ShareIcon, SparkIcon } from "./icons";
import { KnowledgeTree, statusText } from "./knowledge-tree";

interface WorkspaceProps {
  session: LearningSession;
  busy: boolean;
  notice: string;
  focusNodeId: string | null;
  expandingNodeId: string | null;
  onFocusApplied: () => void;
  onExpand: (nodeId: string) => Promise<void>;
  onVerify: (nodeId: string, answer: string) => Promise<void>;
  onParentConfirm: (nodeId: string) => Promise<void>;
  onGenerateTransfer: () => Promise<void>;
  onSolution: (onDelta: (text: string) => void) => Promise<void>;
  onShare: () => Promise<void>;
  onReset: () => void;
}

export function LearningWorkspace(props: WorkspaceProps) {
  const { focusNodeId, onFocusApplied } = props;
  const [selectedId, setSelectedId] = useState(focusNodeId ?? props.session.currentNodeId ?? props.session.rootNodeId);
  const [answer, setAnswer] = useState("");
  const [solution, setSolution] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [highlightNodeId, setHighlightNodeId] = useState(focusNodeId);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const highlightTimerRef = useRef<number | null>(null);
  const selected = props.session.nodes.find((node) => node.id === selectedId) ?? props.session.nodes.find((node) => node.id === props.session.currentNodeId) ?? props.session.nodes[0];

  const selectNode = (nodeId: string) => {
    setSelectedId(nodeId);
    setAnswer("");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById("knowledge-coach")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      });
    });
  };

  useEffect(() => {
    const nodeId = focusNodeId;
    if (!nodeId) return;
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(`knowledge-node-${nodeId}`)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
        onFocusApplied();
      });
    });
    highlightTimerRef.current = window.setTimeout(() => { setHighlightNodeId(null); highlightTimerRef.current = null; }, 1800);
    return () => window.cancelAnimationFrame(frame);
  }, [focusNodeId, onFocusApplied]);

  useEffect(() => () => { if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current); }, []);

  useEffect(() => {
    const update = () => setShowBackToTop(window.scrollY > 520);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const showAnswer = async () => {
    setShowSolution(true);
    if (!solution) {
      setSolution("");
      await props.onSolution((text) => setSolution((current) => current + text));
    }
  };

  if (props.session.stage === "complete" && props.session.originalPassed && props.session.transferPassed) return <Completion session={props.session} busy={props.busy} notice={props.notice} onShare={props.onShare} onReset={props.onReset}/>;

  return <main className="workspace-screen min-h-dvh pb-36">
    <header className="workspace-header sticky top-0 z-20 border-b border-stone-200/80 bg-[#f4f3ef]/92 px-5 py-4 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div><div className="mb-1 flex items-center gap-2 text-[10px] font-semibold tracking-[.14em] text-stone-500"><NetworkIcon className="h-3.5 w-3.5"/> 回溯学习中</div><h1 className="text-lg font-semibold tracking-tight">{stageTitle(props.session)}</h1></div>
        <button onClick={props.onReset} aria-label="返回首页并结束当前辅导" className="flex min-h-11 shrink-0 items-center rounded-xl border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700">返回首页</button>
      </div>
    </header>

    {props.notice && !props.expandingNodeId && <div className="notice-banner mx-auto mt-4 flex max-w-6xl gap-2 px-5"><div className="flex w-full gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-700"><InfoIcon className="h-4 w-4 shrink-0"/>{props.notice}</div></div>}

    <div className="workspace-layout mx-auto grid max-w-6xl gap-5 px-5 py-5 lg:grid-cols-[360px_1fr] lg:items-start">
      <section className="topology-panel rounded-3xl border border-stone-200 bg-stone-100 p-4 lg:sticky lg:top-24" aria-label="知识拓扑">
        <div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-semibold tracking-[.14em] text-stone-400">KNOWLEDGE MAP</p><h2 className="mt-1 text-base font-semibold">从原题向下拆</h2></div><span className="text-[10px] text-stone-400">点节点自由查看</span></div>
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-3" aria-label="知识路径阅读说明">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-950 text-lg font-semibold text-white">↓</span>
          <div><p className="text-xs font-semibold text-stone-800">沿连线向下，知识越来越基础</p><p className="mt-0.5 text-[10px] leading-4 text-stone-500">找到孩子会的起点后，再沿原路向上学回原题</p></div>
        </div>
        <KnowledgeTree session={props.session} activeNodeId={selected?.id ?? null} highlightNodeId={highlightNodeId} onSelect={selectNode}/>
      </section>

      <section id="knowledge-coach" className="coach-panel overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        {props.session.stage === "transfer_check" ? <TransferPanel session={props.session} answer={answer} setAnswer={setAnswer} busy={props.busy} onGenerate={props.onGenerateTransfer} onVerify={() => props.onVerify("__transfer__", answer)}/> : selected ? <NodeCoach node={selected} actionable={selected.id === props.session.currentNodeId} answer={answer} setAnswer={setAnswer} busy={props.busy} expanding={selected.id === props.expandingNodeId} expansionMessage={props.notice} onExpand={props.onExpand} onVerify={props.onVerify} onParentConfirm={props.onParentConfirm} onShowSolution={showAnswer} onReset={props.onReset}/> : null}
        <div className="border-t border-stone-100 px-5 py-4 text-center"><button onClick={showAnswer} className="min-h-11 text-xs text-stone-400 underline decoration-stone-300 underline-offset-4">应急：直接查看原题完整答案</button></div>
      </section>
    </div>

    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-[#f4f3ef]/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
      <p className="mx-auto mb-2 max-w-3xl text-center text-[10px] text-stone-500">正在讲解</p><button onClick={() => props.session.currentNodeId && selectNode(props.session.currentNodeId)} className="mx-auto flex min-h-12 w-full max-w-3xl items-center justify-between rounded-2xl bg-stone-950 px-4 text-sm font-semibold text-white"><span>{props.session.currentNodeId ? `查看「${props.session.nodes.find((node) => node.id === props.session.currentNodeId)?.title ?? "当前知识点"}」讲解` : "查看当前讲解"}</span><ArrowIcon className="h-5 w-5"/></button>
    </div>

    {showBackToTop && <button type="button" aria-label="回到页面顶部" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })} className="back-to-top fixed bottom-24 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-stone-950 text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-stone-800 lg:bottom-7 lg:right-7"><ArrowIcon className="h-5 w-5 -rotate-90"/></button>}

    {showSolution && <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-0 sm:items-center sm:justify-center sm:p-5" onClick={() => setShowSolution(false)}><section className="w-full rounded-t-3xl bg-white p-6 sm:max-w-lg sm:rounded-3xl" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">已跳过当前辅导</p><h2 className="mt-1 text-xl font-semibold">原题完整答案</h2></div><button aria-label="关闭答案" className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100" onClick={() => setShowSolution(false)}><CloseIcon className="h-5 w-5"/></button></div><p aria-live="polite" className="whitespace-pre-wrap rounded-2xl bg-stone-100 p-4 text-[15px] leading-7">{solution || "正在生成…"}</p><p className="mt-4 text-xs leading-5 text-stone-500">查看答案不会把任何知识点标记为已掌握。返回后仍可继续倒推路径。</p></section></div>}
  </main>;
}

function NodeCoach({ node, actionable, answer, setAnswer, busy, expanding, expansionMessage, onExpand, onVerify, onParentConfirm, onShowSolution, onReset }: { node: KnowledgeNode; actionable: boolean; answer: string; setAnswer: (value: string) => void; busy: boolean; expanding: boolean; expansionMessage: string; onExpand: WorkspaceProps["onExpand"]; onVerify: WorkspaceProps["onVerify"]; onParentConfirm: WorkspaceProps["onParentConfirm"]; onShowSolution: () => Promise<void>; onReset: WorkspaceProps["onReset"] }) {
  const isRoot = node.kind === "problem";
  const isDone = isMastered(node.state);
  return <div>
    <div className="border-b border-stone-100 p-5 sm:p-7">
      <div className="mb-3 flex items-center justify-between gap-3"><span className="text-[11px] font-semibold uppercase tracking-[.15em] text-stone-400">{isRoot ? "回到原题" : node.atomic ? "最小知识点" : "当前知识节点"}</span><span className={`node-status status-${node.state} rounded-full px-2.5 py-1 text-[10px] font-semibold`}>{statusText[node.state]}</span></div>
      <h2 className="text-2xl font-semibold tracking-[-.035em]">{node.title}</h2><p className="mt-3 text-sm leading-6 text-stone-500">{isRoot ? "前置知识已经走通。现在不看刚才步骤，让孩子独立完成原题。" : node.simplification}</p>
      {!isRoot && node.diagnosticEvidence && <p className="mt-3 rounded-xl bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600"><span className="font-semibold text-stone-800">可核验依据：</span>{evidenceSourceLabel(node)}原文“{node.diagnosticEvidence}”</p>}
      {node.atomic && <AtomicStopReason/>}
    </div>

    {!isRoot && <TeachingGuide node={node}/>}

    <section className="border-t border-stone-100 p-5 sm:p-7">
      {!actionable && <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">这是旁支预览。请点击底部“查看当前讲解”回到主路径后再作答。</div>}
      <div className="mb-4 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">{isRoot ? <SparkIcon className="h-4 w-4"/> : "03"}</span><div><p className="text-sm font-semibold">{isRoot ? "独立重做" : "最后，让孩子试一道"}</p><p className="text-[11px] text-stone-400">题目很短，只确认刚才有没有听懂</p></div></div>
      <p className="mb-4 text-[15px] font-medium leading-7">{node.check.prompt}</p>
      {node.check.type === "choice" && node.check.choices ? <div className="mb-4 grid gap-2">{node.check.choices.map((choice) => <button key={choice} onClick={() => setAnswer(choice)} className={`min-h-12 rounded-xl border px-4 text-left text-sm transition ${answer === choice ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 hover:border-stone-500"}`}>{choice}</button>)}</div> : <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="记录孩子的答案" className="mb-4 min-h-12 w-full rounded-xl border border-stone-200 px-4 text-sm outline-none focus:border-stone-700"/>}
      {node.state === "needs_help" ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="font-semibold text-red-900">这个原子知识点仍未理解</p><p className="mt-2 text-sm leading-6 text-red-800">已经完成两次客观检查仍未通过。系统不会伪造更小节点或标记学会，建议暂停本题，寻求老师或其他真人帮助。</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={onShowSolution} className="min-h-12 rounded-xl border border-red-300 bg-white text-sm font-semibold text-red-900">查看原题完整答案</button><button onClick={onReset} className="min-h-12 rounded-xl bg-red-900 text-sm font-semibold text-white">暂停本题，返回首页</button></div></div> : expanding ? <ExpansionProgress node={node} message={expansionMessage}/> : <div className="grid gap-2 sm:grid-cols-2"><button disabled={busy || !actionable || !answer.trim()} onClick={() => onVerify(node.id, answer)} className="flex min-h-13 items-center justify-center gap-2 rounded-xl bg-stone-950 font-semibold text-white disabled:opacity-35"><CheckIcon className="h-5 w-5"/>{busy ? "正在判断…" : "提交孩子答案"}</button>{!isRoot && !isDone && (!node.atomic || node.attempts === 0) && <button disabled={busy || !actionable} onClick={() => node.atomic ? onVerify(node.id, "__not_known__") : onExpand(node.id)} className="min-h-13 rounded-xl border border-stone-300 font-semibold disabled:opacity-35">{node.atomic ? "这里不会，换种讲法" : "这里不会，继续向下拆"}</button>}</div>}
      {node.atomic && node.state === "unknown" && node.attempts > 0 && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">已切换为另一种讲法。请先用上面的新例子讲一遍，再让孩子独立试这道小题；这次仍未通过，才会建议真人介入。</p>}
      {!isRoot && !isDone && node.state !== "needs_help" && !expanding && <button disabled={busy || !actionable} onClick={() => onParentConfirm(node.id)} className="mt-3 min-h-11 w-full text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 disabled:opacity-35">跳过检查，由家长确认已经掌握</button>}
      {isDone && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckIcon className="h-4 w-4"/>{node.state === "parent_confirmed" ? "已记录为家长确认，最终仍需完成双重验收。" : "这个知识点已通过客观验收。"}</p>}
    </section>
  </div>;
}

function TeachingGuide({ node }: { node: KnowledgeNode }) {
  const explanation = node.attempts > 0 && node.atomic ? node.teaching.alternateExplanation : node.teaching.explanation;
  return <div className="space-y-4 p-5 sm:p-7">
    <div className="mb-1"><p className="text-[10px] font-semibold tracking-[.14em] text-stone-400">辅导顺序</p><p className="mt-1 text-xs text-stone-500">按顺序做，不需要一次把所有信息讲给孩子。</p></div>
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <header className="flex items-center gap-3 border-b border-stone-100 px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-xs font-semibold text-white">01</span><div><p className="text-sm font-semibold">先讲清楚</p><p className="text-[10px] text-stone-400">家长照着讲一遍</p></div></header>
      <div className="p-4"><p className="text-[15px] leading-7 text-stone-800">{explanation}</p><div className="mt-4 rounded-xl bg-stone-100 p-4"><p className="mb-1.5 text-[11px] font-semibold text-stone-500">接着用这个简单例子</p><p className="text-sm leading-6">{node.teaching.example}</p></div></div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <header className="flex items-center gap-3 border-b border-stone-100 px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-xs font-semibold text-white">02</span><div><p className="text-sm font-semibold">再问明白</p><p className="text-[10px] text-stone-400">用回答判断是否真的理解</p></div></header>
      <div className="space-y-3 p-4"><div><p className="mb-1.5 text-[11px] font-semibold text-stone-500">请直接问孩子</p><p className="rounded-xl bg-stone-100 p-3 text-sm font-medium leading-6">“{node.teaching.parentPrompt}”</p></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[11px] font-semibold text-emerald-800">听到这些表现，说明理解了</p><p className="mt-1 text-xs leading-5 text-emerald-900">{node.teaching.expectedSignal}</p></div><div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0"/><p><span className="font-semibold">如果答偏，留意这个误区：</span>{node.teaching.misconception}</p></div></div>
    </section>
  </div>;
}

function AtomicStopReason() {
  return <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-900 text-sm font-bold text-white">↓</span><div><p className="text-sm font-semibold text-amber-950">知识路径已拆到学习起点</p><p className="mt-1 text-xs leading-5 text-amber-900">这是当前学段可直接教学的最小知识点。继续拆会变成词义碎片，或超出课程范围，所以这里不再机械向下拆。</p><p className="mt-2 text-xs font-semibold text-amber-950">现在从这里开始讲，理解后再逐层回到原题。</p></div></div></section>;
}

function ExpansionProgress({ node, message }: { node: KnowledgeNode; message: string }) {
  return <div role="status" aria-live="polite" className="loading-border-card rounded-2xl bg-stone-50 p-4">
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white"/></span>
      <div><p className="text-sm font-semibold text-stone-900">正在为“{node.title}”补一层基础</p><p className="mt-1 text-xs leading-5 text-stone-600">{message || "先定位一个更简单、能直接讲给孩子的前置知识。"}</p><p className="mt-2 text-xs leading-5 text-stone-400">完成后会自动带你跳到新知识点；现在不需要操作。</p></div>
    </div>
  </div>;
}

function TransferPanel({ session, answer, setAnswer, busy, onGenerate, onVerify }: { session: LearningSession; answer: string; setAnswer: (value: string) => void; busy: boolean; onGenerate: () => void; onVerify: () => void }) {
  return <div className="p-5 sm:p-8"><span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><SparkIcon className="h-6 w-6"/></span><p className="text-xs font-semibold tracking-[.14em] text-emerald-700">FINAL CHECK</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">再换一道，才算真的会。</h2><p className="mt-3 text-sm leading-6 text-stone-500">原题已经通过。迁移题会改变数字或表述，但保持同一个核心知识关系。</p>
    {!session.transferCheck ? <button onClick={onGenerate} disabled={busy} className="mt-7 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 font-semibold text-white">{busy ? "正在生成…" : "生成迁移题"}<ArrowIcon className="h-5 w-5"/></button> : <div className="mt-7"><div className="rounded-2xl bg-stone-100 p-5 text-[15px] font-medium leading-7">{session.transferCheck.prompt}</div><input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="记录孩子的答案" className="mt-4 min-h-13 w-full rounded-xl border border-stone-200 px-4 outline-none focus:border-stone-700"/><button onClick={onVerify} disabled={busy || !answer.trim()} className="mt-3 min-h-14 w-full rounded-2xl bg-stone-950 font-semibold text-white disabled:opacity-35">{busy ? "正在验收…" : "提交最终答案"}</button></div>}
  </div>;
}

function Completion({ session, busy, notice, onShare, onReset }: { session: LearningSession; busy: boolean; notice: string; onShare: () => Promise<void>; onReset: () => void }) {
  const concepts = session.nodes.filter((node) => node.kind === "concept");
  return <main className="completion-screen mx-auto min-h-dvh w-full max-w-3xl px-5 pb-12 pt-10 sm:px-8"><div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><CheckIcon className="h-8 w-8"/></div><p className="text-xs font-semibold tracking-[.16em] text-emerald-700">LEARNING COMPLETE</p><h1 className="mt-3 text-4xl font-semibold leading-tight tracking-[-.05em]">不是做完了，<br/>是真的学会了。</h1><p className="mt-4 text-sm leading-6 text-stone-500">孩子已经独立完成原题，并通过同知识点迁移题。本次共走过 {concepts.length} 个知识节点。</p>{notice && <div role="status" className="mt-5 flex gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-700"><InfoIcon className="h-4 w-4 shrink-0"/>{notice}</div>}
    <section className="mt-8 rounded-3xl bg-stone-950 p-5 text-white"><div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">本次回溯路径</h2><span className="text-xs text-stone-400">由简单到复杂</span></div><div className="space-y-3">{concepts.slice().sort((a, b) => a.difficulty - b.difficulty).map((node, index) => <div key={node.id} className="flex items-center gap-3 rounded-xl bg-white/7 px-3 py-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-stone-950">{index + 1}</span><span className="flex-1 text-sm">{node.title}</span><span className={`text-[10px] ${node.state === "parent_confirmed" ? "text-amber-300" : "text-emerald-300"}`}>{statusText[node.state]}</span></div>)}</div></section>
    <button onClick={onShare} disabled={busy} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 font-semibold text-white"><ShareIcon className="h-5 w-5"/>{busy ? "正在生成报告…" : "生成脱敏学习报告"}</button><button onClick={onReset} className="mt-3 min-h-12 w-full rounded-2xl border border-stone-300 text-sm font-semibold">返回首页，辅导下一道题</button><p className="mt-5 flex gap-2 text-xs leading-5 text-stone-500"><InfoIcon className="h-4 w-4 shrink-0"/>报告不含原始照片、孩子身份、完整题目和模型对话，只保留知识路径与验收状态。</p></main>;
}

function stageTitle(session: LearningSession) {
  if (session.stage === "original_check") return "回到原题，独立完成";
  if (session.stage === "transfer_check") return "最后一道迁移检查";
  if (session.stage === "needs_help") return "这里需要真人介入";
  return "沿着不会的地方继续向下";
}
function evidenceSourceLabel(node: KnowledgeNode) {
  return node.diagnosticEvidenceSource === "child_work" ? "孩子作答" : node.diagnosticEvidenceSource === "parent" ? "上层知识节点" : "题干";
}
