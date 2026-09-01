"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { loadingLearningQuotes } from "@/lib/learning/quotes";
import { learningTextToPlainText } from "@/lib/learning/presentation";
import type { BoardAnnotation, BoardConversationMessage, BoardLesson, ChatMessage } from "@/lib/learning/types";
import { BoardVisualFigure } from "./board-visual";
import { BoardSceneVisual } from "./board-scene-visual";
import { ArrowIcon, ChevronIcon, NetworkIcon } from "./icons";
import { RichLearningText } from "./rich-learning-text";
import { StreamingIndicator } from "./streaming-indicator";

interface LearningBoardProps {
  lesson: BoardLesson;
  messages: ChatMessage[];
  sourceMessages?: BoardConversationMessage[];
  busy: boolean;
  loadingLabel: string;
  notice: string;
  retryLabel: string;
  onAsk: (text: string) => void;
  onClose: () => void;
  onRetry: () => void;
}

const emptyBoardAnnotations: BoardAnnotation[] = [];

export function LearningBoard({ lesson, messages, sourceMessages = [], busy, loadingLabel, notice, retryLabel, onAsk, onClose, onRetry }: LearningBoardProps) {
  const annotations = lesson.annotations ?? emptyBoardAnnotations;
  const [input, setInput] = useState("");
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [hasUnreadAnswer, setHasUnreadAnswer] = useState(false);
  const [questionDockHeight, setQuestionDockHeight] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [activeScene, setActiveScene] = useState(0);
  const [allScenesVisible, setAllScenesVisible] = useState(true);
  const [replayKey, setReplayKey] = useState(0);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const boardRef = useRef<HTMLElement>(null);
  const dialogueRef = useRef<HTMLDivElement>(null);
  const questionDockRef = useRef<HTMLDivElement>(null);
  const previousBusyRef = useRef(busy);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setQuoteIndex((value) => (value + 1) % loadingLearningQuotes.length), 5_500);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    document.documentElement.classList.add("page-scroll-locked");
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    boardRef.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.classList.remove("page-scroll-locked");
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const dock = questionDockRef.current;
    if (!dock) return;
    const updateHeight = () => setQuestionDockHeight(Math.ceil(dock.getBoundingClientRect().height));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateInset = () => setKeyboardInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    updateInset();
    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);
    return () => {
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
    };
  }, []);

  useEffect(() => {
    if (previousBusyRef.current && !busy && !notice && !panelExpanded) setHasUnreadAnswer(true);
    previousBusyRef.current = busy;
  }, [busy, notice, panelExpanded]);

  useEffect(() => {
    if (!panelExpanded) return;
    const dialogue = dialogueRef.current;
    if (dialogue) dialogue.scrollTop = dialogue.scrollHeight;
  }, [messages, busy, notice, panelExpanded]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    onAsk(text);
    setInput("");
  };

  const visibleMessages = recentBoardMessages(messages);
  const hasActiveStream = visibleMessages.some((message) => message.role === "assistant" && (message.status === "streaming" || message.status === "finishing"));
  const lastUserIndex = visibleMessages.reduce((last, message, index) => message.role === "user" ? index : last, -1);
  const hasAssistantOutputForCurrentTurn = busy && visibleMessages.slice(lastUserIndex + 1).some((message) => message.role === "assistant" && message.status !== "error");
  const quote = loadingLearningQuotes[quoteIndex % loadingLearningQuotes.length];
  const plan = lesson.plan;
  const showLegacyVisual = lesson.visual && !legacyVisualCovered(lesson.visual, plan) ? lesson.visual : null;
  const visibleScenes = plan ? plan.scenes.slice(0, allScenesVisible ? plan.scenes.length : activeScene + 1) : [];
  const citedMessages = plan ? sourceMessages.filter((message) => plan.sourceMessageIds.includes(message.id)) : [];
  const togglePanel = () => {
    if (!panelExpanded) setHasUnreadAnswer(false);
    setPanelExpanded((value) => !value);
  };
  const handleBoardKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(boardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <section ref={boardRef} role="dialog" aria-modal="true" aria-label={`AI 专注板书：${learningTextToPlainText(lesson.title)}`} tabIndex={-1} onKeyDown={handleBoardKeyDown} className="learning-board fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-[#f1f2ea] text-stone-950 outline-none">
    <header className="flex shrink-0 items-center justify-between border-b border-stone-900/10 bg-[#f1f2ea]/90 px-4 py-3 backdrop-blur-xl sm:px-7">
      <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-950 text-white"><NetworkIcon className="h-4 w-4"/></span><div className="min-w-0"><p className="text-[9px] font-semibold tracking-[.16em] text-emerald-800">AI 专注板书</p><h1 className="truncate text-sm font-bold"><RichLearningText text={lesson.title} compact/></h1></div></div>
      <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-stone-900/10 bg-white/65 px-4 text-xs font-semibold text-stone-700 shadow-sm">{busy ? "停止回答并返回" : "回到学习主线"}</button>
    </header>

    <div className="board-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-6 sm:px-7 sm:pt-10" style={{ paddingBottom: questionDockHeight > 0 ? questionDockHeight + 44 : panelExpanded ? 280 : 112 }}>
      <article className="mx-auto w-full max-w-4xl">
        <div className="board-overview mb-7 max-w-2xl rounded-[20px] border border-emerald-950/10 bg-white/45 p-4"><p className="text-[9px] font-semibold tracking-[.14em] text-emerald-900">{plan ? "本次板书要帮你看清" : "完整板书 · 关系总览"}</p><div className="mt-2 text-xs leading-6 text-stone-600"><RichLearningText text={plan?.learningGoal ?? lesson.subtitle} compact/></div>{plan && <p className="mt-3 flex items-center gap-2 border-t border-emerald-950/10 pt-3 text-[10px] text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-500"/>整条脉络已展开 · {plan.scenes.filter((scene) => scene.visual).length} 处辅助理解</p>}{citedMessages.length > 0 && <SourceTrail label="板书承接了" messages={citedMessages.slice(-3)} expandedId={expandedSourceId} onToggle={(id) => setExpandedSourceId((current) => current === id ? null : id)}/>} {annotations.length > 0 && <p className="mt-3 border-t border-emerald-950/10 pt-3 text-[10px] leading-5 text-stone-500">圈、线、框只标记关键条件、核心关系和易错边界；图形只表达有题目依据的关系。</p>}</div>
        {showLegacyVisual && <BoardVisualFigure visual={showLegacyVisual}/>}
        {plan ? <div className="board-scene-list">{visibleScenes.map((scene, index) => {
          const blockAnnotations = annotations.filter((item) => item.blockId === scene.id);
          const sceneSources = sourceMessages.filter((message) => scene.sourceMessageIds.includes(message.id));
          return <motion.section key={`${scene.id}-${replayKey}`} initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.38, delay: reducedMotion || !allScenesVisible ? 0 : Math.min(index * 0.07, 0.28), ease: [0.2, 0.8, 0.2, 1] }} className={`board-block board-block--${scene.tone}`}>
            <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-900/20 bg-[#f1f2ea] text-[10px] font-bold text-emerald-950">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><p className="text-[9px] font-semibold tracking-[.12em] text-amber-700">{sceneIntentLabel(scene.intent)}</p><h2 className="mt-1 text-sm font-bold text-emerald-950">{scene.title}</h2></div></div>
            <div className="mt-4 whitespace-pre-wrap text-[17px] font-medium leading-8 tracking-[-.015em] text-stone-800 sm:text-xl sm:leading-9"><MarkedBoardText content={scene.content} annotations={blockAnnotations}/></div>
            {sceneSources.length > 0 && <SourceTrail label="这一步承接" messages={sceneSources} expandedId={expandedSourceId} onToggle={(id) => setExpandedSourceId((current) => current === id ? null : id)}/>}
            {scene.visual && <BoardSceneVisual visual={scene.visual}/>}
            {blockAnnotations.length > 0 && <div className="mt-4 space-y-2" aria-label="重点标记说明">{blockAnnotations.map((annotation) => <div key={`${annotation.blockId}-${annotation.target}`} className="board-annotation-note"><span>{markLabel(annotation.kind)}</span><RichLearningText text={annotation.reason} compact/></div>)}</div>}
          </motion.section>;
        })}<SceneControls active={activeScene} count={plan.scenes.length} allVisible={allScenesVisible} onPrevious={() => { setAllScenesVisible(false); setActiveScene((value) => Math.max(0, value - 1)); }} onNext={() => setActiveScene((value) => Math.min(plan.scenes.length - 1, value + 1))} onAll={() => setAllScenesVisible(true)} onReplay={() => { setAllScenesVisible(false); setActiveScene(0); setReplayKey((value) => value + 1); }}/></div> : <div className={`board-grid board-grid--${lesson.layout}`}>
          {lesson.blocks.map((block, index) => {
            const blockAnnotations = annotations.filter((item) => item.blockId === block.id);
            return <section key={block.id} className={`board-block board-block--${block.tone}`}>
            <div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-900/20 bg-[#f1f2ea] text-[10px] font-bold text-emerald-950">{String(index + 1).padStart(2, "0")}</span><h2 className="text-sm font-bold text-emerald-950">{block.label}</h2></div>
            <div className="mt-4 whitespace-pre-wrap text-[17px] font-medium leading-8 tracking-[-.015em] text-stone-800 sm:text-xl sm:leading-9"><MarkedBoardText content={block.content} annotations={blockAnnotations}/></div>
            {blockAnnotations.length > 0 && <div className="mt-4 space-y-2" aria-label="重点标记说明">{blockAnnotations.map((annotation) => <div key={`${annotation.blockId}-${annotation.target}`} className="board-annotation-note"><span>{markLabel(annotation.kind)}</span><RichLearningText text={annotation.reason} compact/></div>)}</div>}
          </section>;
          })}
        </div>}
      </article>
    </div>

    <div className={`pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-7 ${panelExpanded ? "bg-gradient-to-t from-[#f1f2ea] via-[#f1f2ea]/96 to-transparent pt-12" : "pt-3"}`} style={{ bottom: keyboardInset }}>
      <div ref={questionDockRef} className={`board-question-dock pointer-events-auto mx-auto max-w-2xl border border-stone-900/10 bg-white/95 shadow-[0_18px_60px_rgba(28,25,23,.14)] backdrop-blur-xl ${panelExpanded ? "overflow-y-auto rounded-[24px] p-3" : "rounded-2xl px-3 py-2"}`} style={{ maxHeight: `calc(100dvh - ${keyboardInset + 24}px)` }}>
        <button type="button" onClick={togglePanel} aria-expanded={panelExpanded} aria-controls="board-question-panel" className={`flex min-h-11 w-full items-center gap-3 text-left ${panelExpanded ? "border-b border-stone-900/8 px-1 pb-3" : "px-1"}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-950/[.07] text-sm font-bold text-emerald-900" aria-hidden="true">?</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold tracking-[-.01em] text-emerald-950">板书问答</span>
            <span className="mt-0.5 block truncate text-[10px] text-stone-500">{busy ? (loadingLabel || "正在结合板书回答") : hasUnreadAnswer ? "回答已完成，点击查看" : panelExpanded ? "只回答这页板书，不改变学习进度" : "有疑问时展开提问"}</span>
          </span>
          {hasUnreadAnswer && !panelExpanded && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="有新的板书回答"/>}
          <span className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-[10px] font-semibold text-stone-500">
            {panelExpanded ? "收起" : "展开"}<ChevronIcon className={`h-3.5 w-3.5 transition-transform ${panelExpanded ? "-rotate-90" : "rotate-90"}`}/>
          </span>
        </button>

        {panelExpanded && <div id="board-question-panel" className="pt-3">
          {(visibleMessages.length > 0 || busy || notice) && <div ref={dialogueRef} className="board-dialogue-scroll mb-3 max-h-[min(28dvh,220px)] overflow-y-auto overscroll-contain px-1">
            {visibleMessages.length > 0 && <div className="space-y-2">{visibleMessages.map((message) => message.kind === "milestone" || message.kind === "result" ? <div key={message.id} className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-900"><RichLearningText text={message.text} compact/></div> : <div key={message.id} className={`rounded-xl px-3 py-2 text-xs leading-5 ${message.role === "user" ? "ml-10 bg-emerald-950 text-white" : message.status === "error" ? "mr-5 border border-red-200 bg-red-50 text-red-800" : "mr-5 bg-stone-100 text-stone-700"}`}><p className={`mb-1 text-[9px] font-semibold ${message.role === "user" ? "text-white/60" : message.status === "error" ? "text-red-600" : "text-emerald-800"}`}>{message.role === "user" ? "你" : message.status === "error" ? "回答中断" : "板书助教"}</p>{message.role === "user" ? (message.text || "…") : <RichLearningText text={message.text || "…"} compact streaming={message.status === "streaming"} trailing={(message.status === "streaming" || message.status === "finishing") ? <StreamingIndicator status={message.status} compact/> : undefined}/>}</div>)}</div>}
            {busy && !hasActiveStream && !hasAssistantOutputForCurrentTurn && <div className="mt-2 rounded-xl bg-stone-100 px-3 py-2"><p role="status" className="flex items-center gap-2 text-[10px] font-semibold text-stone-600"><StreamingIndicator status="starting" compact/>{loadingLabel || "正在结合这块板书回答"}</p><p aria-hidden="true" className="mt-1 text-[9px] leading-4 text-stone-400">“{quote.text}” — {quote.source}</p></div>}
            {notice && <div role="alert" className="mt-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] leading-4 text-red-800"><p className="min-w-0 flex-1">{notice}</p>{retryLabel && <button type="button" disabled={busy} onClick={onRetry} className="min-h-11 shrink-0 rounded-lg bg-stone-950 px-3 font-semibold text-white disabled:opacity-40">{retryLabel}</button>}</div>}
          </div>}

          <form onSubmit={submit} className="board-question-composer rounded-[18px] border border-stone-900/10 bg-stone-50/90 p-2 transition-shadow focus-within:border-emerald-900/30 focus-within:ring-2 focus-within:ring-emerald-900/10">
            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <label htmlFor="board-question-input" className="text-[9px] font-semibold text-emerald-800">围绕当前板书提问</label>
              {input.length > 0 && <span className="text-[9px] tabular-nums text-stone-400">{input.length}/300</span>}
            </div>
            <div className="flex items-end gap-2">
              <textarea id="board-question-input" value={input} onChange={(event) => setInput(event.target.value)} rows={1} maxLength={300} disabled={busy} placeholder="例如：这一步为什么这样变形？" className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-6 outline-none placeholder:text-stone-400 disabled:opacity-50"/>
              <button type="submit" disabled={busy || !input.trim()} aria-label="发送板书问题" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-950 text-white transition active:scale-95 disabled:bg-stone-200 disabled:text-stone-400"><ArrowIcon className="h-5 w-5"/></button>
            </div>
          </form>

          <button type="button" onClick={onClose} className="board-return-task mt-2 flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors hover:bg-stone-50">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-900/10 bg-white text-emerald-900"><ArrowIcon className="h-3.5 w-3.5"/></span>
            <span className="min-w-0 flex-1"><span className="block text-[9px] font-semibold text-stone-400">{busy ? "停止回答并回到学习主线" : "回到学习主线"}</span><span className="block truncate text-[10px] font-semibold text-stone-600"><RichLearningText text={lesson.returnLabel} compact/></span></span>
          </button>
        </div>}
      </div>
    </div>
  </section>;
}

function SourceTrail({ label, messages, expandedId, onToggle }: { label: string; messages: BoardConversationMessage[]; expandedId: string | null; onToggle: (id: string) => void }) {
  return <div className="board-source-trail" aria-label="板书内容来源"><span>{label}</span>{messages.map((message) => <div className={`board-source-item${expandedId === message.id ? " board-source-item--expanded" : ""}`} key={message.id}><button type="button" aria-expanded={expandedId === message.id} onClick={() => onToggle(message.id)}>{message.scopeLabel ?? (message.role === "user" ? "你的提问" : "刚才的讲解")}</button>{expandedId === message.id && <div className="board-source-excerpt"><RichLearningText text={message.text.slice(0, 180)} compact/>{message.text.length > 180 && "…"}</div>}</div>)}</div>;
}

function SceneControls({ active, count, allVisible, onPrevious, onNext, onAll, onReplay }: { active: number; count: number; allVisible: boolean; onPrevious: () => void; onNext: () => void; onAll: () => void; onReplay: () => void }) {
  const atEnd = active >= count - 1;
  const controlsRef = useRef<HTMLElement>(null);
  const previousModeRef = useRef(allVisible);
  useEffect(() => {
    if (previousModeRef.current === allVisible) return;
    previousModeRef.current = allVisible;
    const frame = window.requestAnimationFrame(() => controlsRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [allVisible]);
  return <nav ref={controlsRef} className={`board-scene-controls${allVisible ? " board-scene-controls--overview" : ""}`} aria-label="板书步骤控制">
    <div><span>{allVisible ? `完整脉络 · ${count} 个环节` : `正在聚焦第 ${active + 1} / ${count} 个环节`}</span><i style={{ width: `${allVisible ? 100 : (active + 1) / count * 100}%` }}/></div>
    {allVisible ? <div className="board-scene-controls__overview"><button type="button" onClick={onReplay}>按环节聚焦学习</button></div> : <div>
      <button type="button" onClick={onPrevious} disabled={active === 0}>上一个环节</button>
      {!atEnd ? <button type="button" onClick={onNext} className="board-scene-controls__primary">聚焦下一个</button> : <button type="button" onClick={onAll} className="board-scene-controls__primary">回到完整脉络</button>}
      <button type="button" onClick={onAll}>完整脉络</button>
    </div>}
  </nav>;
}

function sceneIntentLabel(intent: NonNullable<BoardLesson["plan"]>["scenes"][number]["intent"]): string {
  if (intent === "extract") return "提取条件";
  if (intent === "connect") return "连接关系";
  if (intent === "derive") return "展开推理";
  if (intent === "compare") return "对照辨析";
  return "回看验证";
}

function legacyVisualCovered(visual: NonNullable<BoardLesson["visual"]>, plan?: BoardLesson["plan"]): boolean {
  const semanticKind = visual.kind === "geometry" ? "geometry_model" : visual.kind === "relation" || visual.kind === "process" ? "concept_graph" : null;
  return Boolean(semanticKind && plan?.scenes.some((scene) => scene.visual?.kind === semanticKind));
}

function MarkedBoardText({ content, annotations }: { content: string; annotations: BoardAnnotation[] }) {
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

function expandProtectedRange(content: string, start: number, end: number): { start: number; end: number } {
  const protectedRanges = Array.from(content.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]*`/g)).map((match) => ({ start: match.index!, end: match.index! + match[0].length }));
  const containing = protectedRanges.find((range) => start >= range.start && end <= range.end);
  return containing ?? { start, end };
}

function markLabel(kind: BoardAnnotation["kind"]): string {
  return kind === "circle" ? "圈出" : kind === "underline" ? "划线" : "框住";
}

function recentBoardMessages(messages: ChatMessage[]): ChatMessage[] {
  const boardMessages = messages.filter((message) => message.surface === "board");
  if (boardMessages.length <= 6) return boardMessages;
  const userIndexes = boardMessages.map((message, index) => message.role === "user" ? index : -1).filter((index) => index >= 0);
  const start = userIndexes.length >= 2 ? userIndexes[userIndexes.length - 2] : Math.max(0, boardMessages.length - 6);
  return boardMessages.slice(start);
}
