"use client";

import { useEffect, useRef, useState } from "react";
import { isMastered } from "@/lib/learning/graph";
import type { KnowledgeNode, LearningSession, ProblemGuideSection, TutorScope } from "@/lib/learning/types";
import { ArrowIcon, CheckIcon, CloseIcon, InfoIcon, NetworkIcon, ShareIcon, SparkIcon } from "./icons";
import { KnowledgeTree, statusText } from "./knowledge-tree";

interface WorkspaceProps {
  session: LearningSession;
  busy: boolean;
  notice: string;
  focusNodeId: string | null;
  expandingNodeId: string | null;
  similarNodeId: string | null;
  onFocusApplied: () => void;
  onExpand: (nodeId: string) => Promise<void>;
  onSimilar: (nodeId: string) => Promise<void>;
  onVerify: (nodeId: string, answer: string) => Promise<void>;
  onGenerateTransfer: () => Promise<void>;
  onSolution: (onDelta: (text: string) => void) => Promise<void>;
  onTutor: (scope: TutorScope, question: string, onDelta: (text: string) => void) => Promise<void>;
  onTutorCancel: () => void;
  onShare: () => Promise<void>;
  onReset: () => void;
}

interface TutorContext {
  scope: TutorScope;
  title: string;
  initialQuestion: string;
  reference?: { label: string; text: string };
  returnFocus: HTMLElement | null;
}

interface GuideSectionReference {
  key: ProblemGuideSection;
  index: string;
  title: string;
  text: string;
  question: string;
}

export function LearningWorkspace(props: WorkspaceProps) {
  const { focusNodeId, onFocusApplied } = props;
  const initiallyLearningUnlocked = Boolean(focusNodeId || props.session.nodes.some((node) => node.kind === "concept" && node.state !== "unchecked"));
  const [selectedId, setSelectedId] = useState(focusNodeId ?? props.session.currentNodeId ?? props.session.rootNodeId);
  const [answer, setAnswer] = useState("");
  const [solution, setSolution] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [highlightNodeId, setHighlightNodeId] = useState(focusNodeId);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showKnowledgePath, setShowKnowledgePath] = useState(false);
  const [tutorContext, setTutorContext] = useState<TutorContext | null>(null);
  const [showLearningGuide, setShowLearningGuide] = useState(initiallyLearningUnlocked);
  const [learningUnlocked, setLearningUnlocked] = useState(initiallyLearningUnlocked);
  const highlightTimerRef = useRef<number | null>(null);
  const selected = props.session.nodes.find((node) => node.id === selectedId) ?? props.session.nodes.find((node) => node.id === props.session.currentNodeId) ?? props.session.nodes[0];
  const conceptCount = props.session.nodes.filter((node) => node.kind === "concept").length;
  const demo = props.session.modelId.endsWith("-demo");

  const selectNode = (nodeId: string) => {
    setShowLearningGuide(true);
    setLearningUnlocked(true);
    setSelectedId(nodeId);
    setAnswer("");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById("knowledge-coach")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      });
    });
  };

  const askTutor = (scope: TutorScope, title: string, initialQuestion: string, reference?: TutorContext["reference"]) => {
    setTutorContext({
      scope,
      title,
      initialQuestion,
      reference,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    });
  };

  const closeTutor = () => {
    props.onTutorCancel();
    setTutorContext(null);
  };

  useEffect(() => {
    const nodeId = focusNodeId;
    if (!nodeId) return;
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    const frame = window.requestAnimationFrame(() => {
      setSelectedId(nodeId);
      setShowLearningGuide(true);
      setLearningUnlocked(true);
      setAnswer("");
      window.requestAnimationFrame(() => {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById("knowledge-coach")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
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

  const pageScrollLocked = tutorContext !== null || showSolution || showKnowledgePath;
  useEffect(() => {
    document.documentElement.style.removeProperty("overflow");
    document.body.style.removeProperty("overflow");
    document.documentElement.classList.toggle("page-scroll-locked", pageScrollLocked);
    return () => document.documentElement.classList.remove("page-scroll-locked");
  }, [pageScrollLocked]);

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
        <div><div className="mb-1 flex items-center gap-2 text-[10px] font-semibold tracking-[.14em] text-stone-500"><NetworkIcon className="h-3.5 w-3.5"/> {demo ? "固定演示 · 不调用模型" : "AI 实时学习"}</div><h1 className="text-lg font-semibold tracking-tight">{demo ? "演示学习" : stageTitle(props.session)}</h1></div>
        <button onClick={props.onReset} aria-label="返回首页并结束当前学习" className="flex min-h-11 shrink-0 items-center rounded-xl border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700">返回首页</button>
      </div>
    </header>

    {props.notice && !props.expandingNodeId && <div className="notice-banner mx-auto mt-4 flex max-w-6xl gap-2 px-5"><div className="flex w-full gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-700"><InfoIcon className="h-4 w-4 shrink-0"/>{props.notice}</div></div>}

    <GuideProgress stage={props.session.stage} showLearningGuide={showLearningGuide} learningUnlocked={learningUnlocked} onProblem={() => setShowLearningGuide(false)} onLearn={() => props.session.currentNodeId && selectNode(props.session.currentNodeId)}/>

    {!showLearningGuide && (props.session.stage === "diagnosing" || props.session.stage === "learning") ? <ProblemGuideCard session={props.session} demo={demo} onStart={() => props.session.currentNodeId && selectNode(props.session.currentNodeId)} onAsk={(section) => askTutor({ kind: "problem", section: section.key }, `关于 ${section.index} · ${section.title}`, section.question, { label: `${section.index} · ${section.title}`, text: section.text })} onAskGeneral={(question) => askTutor({ kind: "problem" }, "关于这道原题", question)}/> : <div className="mx-auto max-w-3xl px-5 py-5">
      {selected?.kind === "concept" && <button type="button" onClick={() => setShowKnowledgePath(true)} className="mb-4 flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white px-4 text-left shadow-sm transition hover:border-stone-400"><span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100"><NetworkIcon className="h-4 w-4"/></span><span className="min-w-0"><span className="block text-[10px] font-semibold tracking-[.12em] text-stone-400">GUIDE 当前学习点</span><strong className="mt-1 block truncate text-sm text-stone-900">{selected.title}</strong></span></span><span className="shrink-0 text-right text-[11px] font-semibold leading-5 text-stone-500">打开知识路径<br/><span className="font-normal text-stone-400">共 {conceptCount} 个节点</span></span></button>}
      <section id="knowledge-coach" className="coach-panel scroll-mt-24 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        {props.session.stage === "transfer_check" ? <TransferPanel session={props.session} answer={answer} setAnswer={setAnswer} busy={props.busy} onGenerate={props.onGenerateTransfer} onVerify={() => props.onVerify("__transfer__", answer)}/> : selected ? <NodeCoach node={selected} demo={demo} actionable={selected.id === props.session.currentNodeId} answer={answer} setAnswer={setAnswer} busy={props.busy} expanding={selected.id === props.expandingNodeId} replacingSimilar={selected.id === props.similarNodeId} expansionMessage={props.notice} onExpand={props.onExpand} onSimilar={async (nodeId) => { setAnswer(""); await props.onSimilar(nodeId); }} onVerify={props.onVerify} onReturnCurrent={() => props.session.currentNodeId && selectNode(props.session.currentNodeId)} onAsk={(question) => askTutor({ kind: selected.kind === "problem" ? "problem" : "node", ...(selected.kind === "concept" ? { nodeId: selected.id } : {}) } as TutorScope, selected.kind === "problem" ? "关于这道原题" : `关于“${selected.title}”`, question)} onShowSolution={showAnswer} onReset={props.onReset}/> : null}
        <div className="border-t border-stone-100 px-5 py-4 text-center"><button onClick={showAnswer} className="min-h-11 text-xs text-stone-400 underline decoration-stone-300 underline-offset-4">直接查看原题答案</button></div>
      </section>
    </div>}

    {showBackToTop && <button type="button" aria-label="回到页面顶部" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })} className="back-to-top fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-stone-950 text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-stone-800 lg:bottom-7 lg:right-7"><ArrowIcon className="h-5 w-5 -rotate-90"/></button>}

    {tutorContext && <TutorSheet key={`${tutorContext.title}-${tutorContext.initialQuestion}`} context={tutorContext} demo={demo} onAsk={props.onTutor} onCancelRequest={props.onTutorCancel} onClose={closeTutor}/>}

    {showKnowledgePath && <KnowledgePathSheet session={props.session} activeNodeId={selected?.id ?? null} highlightNodeId={highlightNodeId} onSelect={(nodeId) => { setShowKnowledgePath(false); selectNode(nodeId); }} onClose={() => setShowKnowledgePath(false)}/>}

    {showSolution && <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-0 sm:items-center sm:justify-center sm:p-5" onClick={() => setShowSolution(false)}><section className="w-full rounded-t-3xl bg-white p-6 sm:max-w-lg sm:rounded-3xl" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-semibold text-amber-700">已跳过当前学习</p><h2 className="mt-1 text-xl font-semibold">原题完整答案</h2></div><button aria-label="关闭答案" className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100" onClick={() => setShowSolution(false)}><CloseIcon className="h-5 w-5"/></button></div><p aria-live="polite" className="whitespace-pre-wrap rounded-2xl bg-stone-100 p-4 text-[15px] leading-7">{solution || "正在生成…"}</p><p className="mt-4 text-xs leading-5 text-stone-500">查看答案不会把任何知识点标记为已掌握。返回后仍可继续学习。</p></section></div>}
  </main>;
}

function GuideProgress({ stage, showLearningGuide, learningUnlocked, onProblem, onLearn }: { stage: LearningSession["stage"]; showLearningGuide: boolean; learningUnlocked: boolean; onProblem: () => void; onLearn: () => void }) {
  const finalStage = stage === "original_check" || stage === "transfer_check" || stage === "complete";
  const active = finalStage ? 3 : showLearningGuide ? 2 : 1;
  const steps = [{ number: 1, label: "看懂题目", onClick: onProblem, unlocked: true }, { number: 2, label: learningUnlocked && active === 1 ? "继续学卡点" : "学会卡点", onClick: onLearn, unlocked: learningUnlocked || finalStage }, { number: 3, label: "独立作答", unlocked: finalStage }];
  return <nav className="mx-auto max-w-3xl px-5 pt-5" aria-label="学习进度"><ol className="grid grid-cols-3 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm">{steps.map((step) => <li key={step.number}><button type="button" disabled={!step.unlocked || step.number === 3} onClick={step.onClick} aria-current={active === step.number ? "step" : undefined} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-2 text-xs font-semibold transition ${active === step.number ? "bg-stone-950 text-white" : step.number < active ? "text-emerald-700 hover:bg-stone-100" : step.unlocked ? "text-stone-700 hover:bg-stone-100" : "text-stone-400"}`}><span>{step.number < active ? "✓" : step.number}</span>{step.label}</button></li>)}</ol></nav>;
}

function KnowledgePathSheet({ session, activeNodeId, highlightNodeId, onSelect, onClose }: { session: LearningSession; activeNodeId: string | null; highlightNodeId: string | null; onSelect: (nodeId: string) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-black/45 sm:items-center sm:justify-center sm:p-5" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="knowledge-path-title" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[28px] bg-[#f4f3ef] shadow-2xl sm:max-w-xl sm:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-[#f4f3ef]/95 px-5 py-4 backdrop-blur"><div><p className="text-[10px] font-semibold tracking-[.14em] text-stone-400">知识路径 · 学习导航</p><h2 id="knowledge-path-title" className="mt-1 text-xl font-semibold">为什么要先学这些</h2></div><button type="button" onClick={onClose} aria-label="关闭知识路径" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white"><CloseIcon className="h-5 w-5"/></button></header>
      <div className="p-5"><div className="mb-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white">↓</span><div><p className="text-xs font-semibold">越往下，越基础；从最下方再学回原题</p><p className="mt-1 text-[11px] leading-5 text-stone-500">这里负责展示知识关系。点任一节点，会回到 Guide 完成讲解和练习。</p></div></div><KnowledgeTree session={session} activeNodeId={activeNodeId} highlightNodeId={highlightNodeId} onSelect={onSelect}/></div>
    </section>
  </div>;
}

function ProblemGuideCard({ session, demo, onStart, onAsk, onAskGeneral }: { session: LearningSession; demo: boolean; onStart: () => void; onAsk: (section: GuideSectionReference) => void; onAskGeneral: (question: string) => void }) {
  const guide = session.problemGuide;
  const sections: GuideSectionReference[] = [
    { key: "goal", index: "01", title: "这道题要解决什么", text: guide.goal, question: "这道题到底要我找什么？" },
    { key: "keyClue", index: "02", title: "先抓住这条线索", text: guide.keyClue, question: "为什么这条条件最关键？" },
    { key: "approach", index: "03", title: "解题方向", text: guide.approach, question: "这个解题方向能再讲具体一点吗？" },
  ];
  return <section className="problem-guide mx-auto max-w-3xl px-5 pt-5" aria-labelledby="problem-guide-title">
    <article className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm">
      <header className="border-b border-stone-100 px-5 py-5 sm:px-7"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold tracking-[.16em] text-amber-700">GUIDE · 先理解，再动笔</p><h2 id="problem-guide-title" className="mt-2 text-2xl font-semibold tracking-[-.04em]">先看懂这道题</h2></div><span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-800">{demo ? "固定演示" : "AI 主讲"}</span></div><p className="mt-3 rounded-2xl bg-stone-100 px-4 py-3 text-xs leading-5 text-stone-600">{session.problem.text}</p></header>
      <div className="divide-y divide-stone-100 px-5 sm:px-7">{sections.map((item) => <section key={item.index} className="guide-paragraph py-5"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-stone-500"><span className="mr-2 text-amber-700">{item.index}</span>{item.title}</p><button type="button" onClick={() => onAsk(item)} aria-label={`针对第 ${item.index} 段“${item.title}”提问`} className="min-h-9 shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold text-amber-800 transition hover:border-amber-400">问 {item.index}</button></div><p className="text-[16px] leading-8 text-stone-900">{item.text}</p></section>)}</div>
      <footer className="bg-stone-950 p-5 text-white sm:p-7"><p className="text-xs text-stone-400">先不计算，想一想</p><p className="mt-2 text-lg font-semibold leading-8">“{guide.firstQuestion}”</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={onStart} className="flex min-h-13 items-center justify-between rounded-2xl bg-white px-4 font-semibold text-stone-950">开始一步步做<ArrowIcon className="h-5 w-5"/></button><button type="button" onClick={() => onAskGeneral("我还是不知道该怎样开始，请再讲得具体一点。") } className="min-h-13 rounded-2xl border border-white/20 px-4 text-sm font-semibold">这里没看懂，问 AI</button></div></footer>
    </article>
  </section>;
}

function TutorSheet({ context, demo, onAsk, onCancelRequest, onClose }: { context: TutorContext; demo: boolean; onAsk: WorkspaceProps["onTutor"]; onCancelRequest: () => void; onClose: () => void }) {
  const [question, setQuestion] = useState(context.initialQuestion);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [presetEdges, setPresetEdges] = useState({ left: false, right: false });
  const aliveRef = useRef(true);
  const dialogRef = useRef<HTMLElement | null>(null);
  const presetsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    aliveRef.current = true;
    const previousFocus = context.returnFocus;
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [])].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      aliveRef.current = false;
      onCancelRequest();
      window.removeEventListener("keydown", handleDialogKeys);
      previousFocus?.focus();
    };
  }, [context.returnFocus, onCancelRequest, onClose]);
  const presets = context.scope.kind === "problem" ? ["这道题第一步该看哪里？", "为什么要用这个关系？", "能换个更简单的例子吗？"] : ["换一种更简单的说法", "为什么要先学这个？", "给一个生活里的例子"];
  const updatePresetEdges = () => {
    const strip = presetsRef.current;
    if (!strip) return;
    setPresetEdges({ left: strip.scrollLeft > 4, right: strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 4 });
  };
  useEffect(() => {
    const frame = window.requestAnimationFrame(updatePresetEdges);
    window.addEventListener("resize", updatePresetEdges);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", updatePresetEdges); };
  }, []);
  const submit = async () => {
    const nextQuestion = question.trim();
    if (!nextQuestion || loading) return;
    setLoading(true); setAnswer(""); setError("");
    try {
      await onAsk(context.scope, nextQuestion, (delta) => { if (aliveRef.current) setAnswer((current) => current + delta); });
    } catch (nextError) {
      if (aliveRef.current) setError(nextError instanceof Error ? nextError.message : "追问失败，请重试");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  };
  return <div className="fixed inset-0 z-50 flex items-end bg-black/45 sm:items-center sm:justify-center sm:p-5" onClick={onClose}>
    <section ref={dialogRef} role="dialog" aria-modal="true" className="tutor-sheet max-h-[88dvh] w-full overflow-y-auto rounded-t-[30px] bg-[#f8f7f4] p-5 shadow-2xl sm:max-w-xl sm:rounded-[30px] sm:p-6" onClick={(event) => event.stopPropagation()} aria-labelledby="tutor-title">
      <header className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold tracking-[.14em] text-amber-700">就地问一问</p><h2 id="tutor-title" className="mt-1 text-2xl font-semibold tracking-[-.035em]">{context.title}</h2><p className="mt-2 max-w-md text-xs leading-5 text-stone-500">{demo ? "当前是固定演示回答，不会调用模型或改变掌握状态。" : "AI 只根据当前题目和这段讲解回答，不会改变掌握状态。"}</p></div><button type="button" onClick={onClose} aria-label="关闭追问" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm transition active:scale-95"><CloseIcon className="h-5 w-5"/></button></header>
      {context.reference && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3"><p className="text-[10px] font-semibold tracking-[.1em] text-amber-800">正在引用 {context.reference.label}</p><p className="mt-1.5 text-xs leading-5 text-stone-700">{context.reference.text}</p></div>}
      <div className={`tutor-presets-wrap mt-5 ${presetEdges.left ? "has-left" : ""} ${presetEdges.right ? "has-right" : ""}`}><div ref={presetsRef} onScroll={updatePresetEdges} className="tutor-presets flex gap-2 overflow-x-auto">{presets.map((preset) => <button type="button" key={preset} onClick={() => setQuestion(preset)} className={`min-h-10 shrink-0 snap-start rounded-full border px-4 text-[11px] font-semibold transition ${question === preset ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-600 shadow-sm active:bg-stone-100"}`}>{preset}</button>)}</div></div>
      <div className="mt-4 rounded-[22px] border border-stone-200 bg-white p-1 shadow-sm focus-within:border-stone-500"><textarea autoFocus value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={300} rows={3} placeholder="说说具体哪里没听懂" className="w-full resize-none rounded-[18px] bg-transparent p-4 text-sm leading-6 outline-none"/></div>
      <button type="button" disabled={loading || !question.trim()} onClick={submit} className="mt-3 flex min-h-13 w-full items-center justify-center gap-2 rounded-[18px] bg-stone-950 font-semibold text-white shadow-lg shadow-stone-300 transition active:scale-[.99] disabled:shadow-none disabled:opacity-35">{loading ? <><span className="h-2 w-2 animate-pulse rounded-full bg-white"/>AI 正在边想边讲…</> : <>发送问题<ArrowIcon className="h-5 w-5"/></>}</button>
      {(answer || loading) && <div aria-live={loading ? "off" : "polite"} className="mt-5 rounded-[22px] border border-stone-200 bg-white p-4 shadow-sm"><p className="mb-2 text-[10px] font-semibold tracking-[.12em] text-stone-500">AI 的讲解</p><p className={`whitespace-pre-wrap text-[15px] leading-7 text-stone-800 ${loading ? "tutor-streaming-text" : ""}`}>{answer || "正在组织第一句话…"}</p></div>}
      {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"><p>{error}</p><button type="button" onClick={submit} className="mt-2 min-h-9 font-semibold underline underline-offset-4">保留问题，重新发送</button></div>}
    </section>
  </div>;
}

function NodeCoach({ node, demo, actionable, answer, setAnswer, busy, expanding, replacingSimilar, expansionMessage, onExpand, onSimilar, onVerify, onReturnCurrent, onAsk, onShowSolution, onReset }: { node: KnowledgeNode; demo: boolean; actionable: boolean; answer: string; setAnswer: (value: string) => void; busy: boolean; expanding: boolean; replacingSimilar: boolean; expansionMessage: string; onExpand: WorkspaceProps["onExpand"]; onSimilar: WorkspaceProps["onSimilar"]; onVerify: WorkspaceProps["onVerify"]; onReturnCurrent: () => void; onAsk: (question: string) => void; onShowSolution: () => Promise<void>; onReset: WorkspaceProps["onReset"] }) {
  const isRoot = node.kind === "problem";
  const isDone = isMastered(node.state);
  return <div>
    <div className="border-b border-stone-100 p-5 sm:p-7">
      <div className="mb-3 flex items-center justify-between gap-3"><span className="text-[11px] font-semibold uppercase tracking-[.15em] text-stone-400">{isRoot ? "回到原题" : node.atomic ? "最小知识点" : "当前知识节点"}</span><span className={`node-status status-${node.state} rounded-full px-2.5 py-1 text-[10px] font-semibold`}>{statusText[node.state]}</span></div>
      <h2 className="text-2xl font-semibold tracking-[-.035em]">{node.title}</h2><p className="mt-3 text-sm leading-6 text-stone-500">{isRoot ? "前置知识已经走通。现在不看提示，独立完成原题。" : node.simplification}</p>
      {!isRoot && node.diagnosticEvidence && <p className="mt-3 rounded-xl bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600"><span className="font-semibold text-stone-800">可核验依据：</span>{evidenceSourceLabel(node)}原文“{node.diagnosticEvidence}”</p>}
      {node.atomic && <AtomicStopReason/>}
    </div>

    {!isRoot && <TeachingGuide node={node} onAsk={onAsk}/>}

    <section className="border-t border-stone-100 p-5 sm:p-7">
      {!actionable && <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600"><p>这是旁支预览。回到当前主讲节点后才能继续作答。</p><button type="button" onClick={onReturnCurrent} className="mt-2 min-h-10 rounded-xl bg-stone-950 px-4 font-semibold text-white">返回当前主讲节点</button></div>}
      <div className="mb-4 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">{isRoot ? <SparkIcon className="h-4 w-4"/> : "03"}</span><div><p className="text-sm font-semibold">{isRoot ? "独立重做" : "最后，你来试一道"}</p><p className="text-[11px] text-stone-400">题目很短，只确认刚才有没有听懂</p></div></div>{!isRoot && <button type="button" disabled={busy || !actionable || isDone} onClick={() => onSimilar(node.id)} className="min-h-9 shrink-0 rounded-full border border-stone-200 bg-white px-3 text-[11px] font-semibold text-stone-600 transition hover:border-stone-500 disabled:opacity-35">{replacingSimilar ? "正在换题…" : "换相似题"}</button>}</div>
      {node.check.id.startsWith("similar-") && <div className="mb-3 flex flex-wrap gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">同知识点</span><span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-semibold text-stone-600">{demo ? "固定演示" : "AI 生成"}</span></div>}
      <p className="mb-4 text-[15px] font-medium leading-7">{node.check.prompt}</p>
      {node.check.type === "choice" && node.check.choices ? <div className="mb-4 grid gap-2">{node.check.choices.map((choice) => <button key={choice} onClick={() => setAnswer(choice)} className={`min-h-12 rounded-xl border px-4 text-left text-sm transition ${answer === choice ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 hover:border-stone-500"}`}>{choice}</button>)}</div> : <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="写下你的答案" className="mb-4 min-h-12 w-full rounded-xl border border-stone-200 px-4 text-sm outline-none focus:border-stone-700"/>}
      {node.state === "needs_help" ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="font-semibold text-red-900">这个基础点还没有理解</p><p className="mt-2 text-sm leading-6 text-red-800">换过讲法后仍未通过检查。系统不会假装你已经学会，建议先暂停并请老师帮助。</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={onShowSolution} className="min-h-12 rounded-xl border border-red-300 bg-white text-sm font-semibold text-red-900">查看原题完整答案</button><button onClick={onReset} className="min-h-12 rounded-xl bg-red-900 text-sm font-semibold text-white">暂停本题，返回首页</button></div></div> : expanding ? <ExpansionProgress node={node} message={expansionMessage}/> : <div className="grid gap-2 sm:grid-cols-2"><button disabled={busy || !actionable || !answer.trim()} onClick={() => onVerify(node.id, answer)} className="flex min-h-13 items-center justify-center gap-2 rounded-xl bg-stone-950 font-semibold text-white disabled:opacity-35"><CheckIcon className="h-5 w-5"/>{replacingSimilar ? "新题生成中…" : busy ? "正在判断…" : "提交答案"}</button>{!isRoot && !isDone && (!node.atomic || node.attempts === 0) && <button disabled={busy || !actionable} onClick={() => node.atomic ? onVerify(node.id, "__not_known__") : onExpand(node.id)} className="min-h-13 rounded-xl border border-stone-300 font-semibold disabled:opacity-35">{node.atomic ? "还是不懂，换种讲法" : "这里不会，找更基础的知识"}</button>}</div>}
      {node.atomic && node.state === "unknown" && node.attempts > 0 && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">已换成另一种讲法。先看新例子，再独立完成这道小题；仍未通过时才会建议请老师帮助。</p>}
      {isDone && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckIcon className="h-4 w-4"/>这个知识点已通过检查。</p>}
    </section>
  </div>;
}

function TeachingGuide({ node, onAsk }: { node: KnowledgeNode; onAsk: (question: string) => void }) {
  const explanation = node.attempts > 0 && node.atomic ? node.teaching.alternateExplanation : node.teaching.explanation;
  return <div className="space-y-4 p-5 sm:p-7">
    <div className="mb-1"><p className="text-[10px] font-semibold tracking-[.14em] text-stone-400">本节学习</p><p className="mt-1 text-xs text-stone-500">按顺序看、想、答，不懂的地方随时问 AI。</p></div>
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <header className="flex items-center gap-3 border-b border-stone-100 px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-xs font-semibold text-white">01</span><div><p className="text-sm font-semibold">先听懂</p><p className="text-[10px] text-stone-400">先理解，再计算</p></div></header>
      <div className="p-4"><div className="guide-paragraph"><div className="mb-2 flex justify-end"><button type="button" onClick={() => onAsk("这段概念讲解我没听懂，请换一种更具体的说法。") } className="min-h-9 rounded-full border border-stone-200 px-3 text-[11px] font-semibold text-stone-600">问这段</button></div><p className="text-[15px] leading-7 text-stone-800">{explanation}</p></div><div className="mt-4 rounded-xl bg-stone-100 p-4"><div className="mb-1.5 flex items-center justify-between gap-3"><p className="text-[11px] font-semibold text-stone-500">再看一个简单例子</p><button type="button" onClick={() => onAsk("这个例子为什么能说明当前知识点？") } className="min-h-8 rounded-full bg-white px-3 text-[10px] font-semibold text-stone-600">问例子</button></div><p className="text-sm leading-6">{node.teaching.example}</p></div></div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <header className="flex items-center gap-3 border-b border-stone-100 px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-xs font-semibold text-white">02</span><div><p className="text-sm font-semibold">再问明白</p><p className="text-[10px] text-stone-400">用回答判断是否真的理解</p></div></header>
      <div className="space-y-3 p-4"><div><p className="mb-1.5 text-[11px] font-semibold text-stone-500">想一想</p><p className="rounded-xl bg-stone-100 p-3 text-sm font-medium leading-6">“{node.teaching.parentPrompt}”</p></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[11px] font-semibold text-emerald-800">做到这些，说明真的理解了</p><p className="mt-1 text-xs leading-5 text-emerald-900">{node.teaching.expectedSignal}</p></div><div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0"/><p><span className="font-semibold">容易出错的地方：</span>{node.teaching.misconception}</p></div></div>
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
      <div><p className="text-sm font-semibold text-stone-900">正在为“{node.title}”找更基础的知识</p><p className="mt-1 text-xs leading-5 text-stone-600">{message || "AI 正在定位一个更简单的前置知识。"}</p><p className="mt-2 text-xs leading-5 text-stone-400">找到后会自动回到 Guide 继续学习。</p></div>
    </div>
  </div>;
}

function TransferPanel({ session, answer, setAnswer, busy, onGenerate, onVerify }: { session: LearningSession; answer: string; setAnswer: (value: string) => void; busy: boolean; onGenerate: () => void; onVerify: () => void }) {
  return <div className="p-5 sm:p-8"><span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><SparkIcon className="h-6 w-6"/></span><p className="text-xs font-semibold tracking-[.14em] text-emerald-700">FINAL CHECK</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">再换一道，才算真的会。</h2><p className="mt-3 text-sm leading-6 text-stone-500">原题已经通过。迁移题会改变数字或表述，但保持同一个核心知识关系。</p>
    {!session.transferCheck ? <button onClick={onGenerate} disabled={busy} className="mt-7 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 font-semibold text-white">{busy ? "正在生成…" : "生成迁移题"}<ArrowIcon className="h-5 w-5"/></button> : <div className="mt-7"><div className="rounded-2xl bg-stone-100 p-5 text-[15px] font-medium leading-7">{session.transferCheck.prompt}</div><input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="写下你的答案" className="mt-4 min-h-13 w-full rounded-xl border border-stone-200 px-4 outline-none focus:border-stone-700"/><button onClick={onVerify} disabled={busy || !answer.trim()} className="mt-3 min-h-14 w-full rounded-2xl bg-stone-950 font-semibold text-white disabled:opacity-35">{busy ? "正在验收…" : "提交最终答案"}</button></div>}
  </div>;
}

function Completion({ session, busy, notice, onShare, onReset }: { session: LearningSession; busy: boolean; notice: string; onShare: () => Promise<void>; onReset: () => void }) {
  const concepts = session.nodes.filter((node) => node.kind === "concept");
  return <main className="completion-screen mx-auto min-h-dvh w-full max-w-3xl px-5 pb-12 pt-10 sm:px-8"><div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><CheckIcon className="h-8 w-8"/></div><p className="text-xs font-semibold tracking-[.16em] text-emerald-700">LEARNING COMPLETE</p><h1 className="mt-3 text-4xl font-semibold leading-tight tracking-[-.05em]">不是做完了，<br/>是真的学会了。</h1><p className="mt-4 text-sm leading-6 text-stone-500">你已经独立完成原题，并通过同知识点迁移题。本次共走过 {concepts.length} 个知识节点。</p>{notice && <div role="status" className="mt-5 flex gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-700"><InfoIcon className="h-4 w-4 shrink-0"/>{notice}</div>}
    <section className="mt-8 rounded-3xl bg-stone-950 p-5 text-white"><div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">本次回溯路径</h2><span className="text-xs text-stone-400">由简单到复杂</span></div><div className="space-y-3">{concepts.slice().sort((a, b) => a.difficulty - b.difficulty).map((node, index) => <div key={node.id} className="flex items-center gap-3 rounded-xl bg-white/7 px-3 py-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-stone-950">{index + 1}</span><span className="flex-1 text-sm">{node.title}</span><span className={`text-[10px] ${node.state === "parent_confirmed" ? "text-amber-300" : "text-emerald-300"}`}>{statusText[node.state]}</span></div>)}</div></section>
    <button onClick={onShare} disabled={busy} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 font-semibold text-white"><ShareIcon className="h-5 w-5"/>{busy ? "正在生成报告…" : "生成脱敏学习报告"}</button><button onClick={onReset} className="mt-3 min-h-12 w-full rounded-2xl border border-stone-300 text-sm font-semibold">返回首页，学习下一题</button><p className="mt-5 flex gap-2 text-xs leading-5 text-stone-500"><InfoIcon className="h-4 w-4 shrink-0"/>报告不含原始照片、身份、完整题目和模型对话，只保留知识路径与验收状态。</p></main>;
}

function stageTitle(session: LearningSession) {
  if (session.stage === "original_check") return "回到原题，独立完成";
  if (session.stage === "transfer_check") return "最后一道迁移检查";
  if (session.stage === "needs_help") return "这里需要真人介入";
  return "AI 先讲懂，再带着做";
}
function evidenceSourceLabel(node: KnowledgeNode) {
  return node.diagnosticEvidenceSource === "child_work" ? "我的作答" : node.diagnosticEvidenceSource === "parent" ? "上层知识节点" : "题干";
}
