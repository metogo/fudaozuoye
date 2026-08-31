"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { parseLearningPrompt, stripLearningChoiceLabel } from "@/lib/learning/presentation";
import { loadingLearningQuotes } from "@/lib/learning/quotes";
import type { ChatMessage, LearningChoice, LearningGate, LearningSession, ProblemSnapshot, ReasoningAvailability, ReasoningLevel, SuggestedQuestion } from "@/lib/learning/types";
import { ArrowIcon, CameraIcon, CheckIcon, ImageIcon, InfoIcon, NetworkIcon, PencilIcon, RefreshIcon, SparkIcon } from "./icons";
import { RichLearningText } from "./rich-learning-text";
import { StreamingIndicator } from "./streaming-indicator";

interface LearningChatProps {
  messages: ChatMessage[];
  session: LearningSession | null;
  reasoningLevels: ReasoningAvailability[];
  reasoningLevel: ReasoningLevel;
  ready: boolean;
  busy: boolean;
  loadingLabel: string;
  notice: string;
  retryLabel: string;
  reviewProblem: ProblemSnapshot | null;
  onReasoningLevel: (level: ReasoningLevel) => void;
  onFile: (file: File) => void;
  onResponsePhoto: (file: File, intent: "answer" | "question") => void;
  onWhiteboard: (intent: "answer" | "question") => void;
  onSend: (text: string) => void;
  onQuestion: (text: string) => void;
  onChoice: (gate: LearningGate, choice: LearningChoice) => void;
  onSuggestion: (suggestion: SuggestedQuestion) => void;
  onConfirmProblem: (problem: ProblemSnapshot) => void;
  onRetryOriginal: () => void;
  onRequestTransfer: () => void;
  onReopenBoard?: () => void;
  onNewProblem: () => void;
  onRetry: () => void;
}

export function LearningChat(props: LearningChatProps) {
  const [input, setInput] = useState("");
  const [fileError, setFileError] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [hasNewContent, setHasNewContent] = useState(false);
  const [questionGateId, setQuestionGateId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nearBottomRef = useRef(true);
  const hasNewContentRef = useRef(false);
  const previousContentVersionRef = useRef("");
  const gate = props.session?.flow.activeGate ?? null;
  const answerMode = gate?.kind === "node_answer" || gate?.kind === "solution_recall_answer" || gate?.kind === "original_answer" || gate?.kind === "transfer_answer";
  const promptChoices = gate?.prompt ? parseLearningPrompt(gate.prompt).choices : [];
  const sessionAnswerChoices = gate?.answerChoices ?? choicesFromSession(props.session, gate);
  const answerChoices = sessionAnswerChoices ?? (promptChoices.length ? promptChoices : undefined);
  const choicesDerivedFromPrompt = !sessionAnswerChoices?.length && promptChoices.length > 0;
  const choiceAnswerMode = Boolean(answerChoices?.length);
  const questionMode = Boolean(answerMode && gate?.id && questionGateId === gate.id);
  const responseIntent = answerMode && !questionMode ? "answer" : "question";
  const hasPendingRetry = Boolean(props.retryLabel);
  const showResponseTools = Boolean(props.session && !hasPendingRetry && (!choiceAnswerMode || questionMode) && !props.reviewProblem);
  const currentTask = gate && !hasPendingRetry ? currentTaskCopy(props.session, gate, questionMode) : null;
  const canAttach = !props.session && !props.busy && !props.reviewProblem;
  const isHome = !props.session && props.messages.length === 0 && !props.reviewProblem;
  const solutionDisplay = props.session?.flow.viewedSolution && gate?.kind !== "solution_review" ? "locked" as const : "normal" as const;
  const hasActiveChatStream = props.messages.some((message) => message.surface !== "board" && message.role === "assistant" && (message.status === "streaming" || message.status === "finishing"));
  const hasWritingChatStream = props.messages.some((message) => message.surface !== "board" && message.role === "assistant" && message.status === "streaming");
  const visibleChatMessages = props.messages.filter((message) => message.surface !== "board");
  const lastUserIndex = visibleChatMessages.reduce((last, message, index) => message.role === "user" ? index : last, -1);
  const hasAssistantOutputForCurrentTurn = props.busy && visibleChatMessages.slice(lastUserIndex + 1).some((message) => message.role === "assistant" && message.status !== "error");
  const isPreparingNextTurn = Boolean(props.session && props.busy && hasAssistantOutputForCurrentTurn && !hasWritingChatStream);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const area = scrollRef.current;
    const latest = props.messages.at(-1);
    const contentVersion = `${latest?.id ?? ""}:${latest?.text.length ?? 0}:${gate?.id ?? ""}:${props.busy}`;
    if (contentVersion === previousContentVersionRef.current) return;
    if (previousContentVersionRef.current && !nearBottomRef.current && !hasNewContentRef.current) {
      hasNewContentRef.current = true;
      setHasNewContent(true);
    }
    previousContentVersionRef.current = contentVersion;
    if (!area || !nearBottomRef.current) return;
    if (hasNewContentRef.current) {
      hasNewContentRef.current = false;
      setHasNewContent(false);
    }
    const frame = window.requestAnimationFrame(() => {
      if (!nearBottomRef.current) return;
      area.scrollTo({ top: area.scrollHeight, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.messages, props.busy, gate?.id]);

  useEffect(() => {
    const area = textareaRef.current;
    if (!area) return;
    if (!input) {
      area.style.height = "44px";
      return;
    }
    area.style.height = "0px";
    area.style.height = `${Math.min(128, Math.max(44, area.scrollHeight))}px`;
  }, [input, gate?.id, questionMode]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || props.busy) return;
    if (questionMode) props.onQuestion(text);
    else props.onSend(text);
    setInput("");
    setQuestionGateId(null);
  };

  const fileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setFileError("请选择图片文件");
    if (file.size > 20 * 1024 * 1024) return setFileError("图片不能超过 20MB");
    setFileError("");
    props.onFile(file);
  };

  const responsePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setFileError("请选择图片文件");
    if (file.size > 20 * 1024 * 1024) return setFileError("图片不能超过 20MB");
    setFileError("");
    props.onResponsePhoto(file, responseIntent);
  };

  const updateScrollState = () => {
    const area = scrollRef.current;
    if (!area) return;
    const nextNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 96;
    nearBottomRef.current = nextNearBottom;
    if (nextNearBottom && hasNewContentRef.current) {
      hasNewContentRef.current = false;
      setHasNewContent(false);
    }
  };

  const jumpToLatest = () => {
    const area = scrollRef.current;
    if (!area) return;
    nearBottomRef.current = true;
    if (hasNewContentRef.current) {
      hasNewContentRef.current = false;
      setHasNewContent(false);
    }
    area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
  };

  return <main className={`learning-chat-shell mx-auto flex h-dvh w-full max-w-3xl flex-col overflow-hidden ${isHome ? "home-chat-shell" : "bg-[#f7f6f2]"}`}>
    {isHome && <h1 className="sr-only">学习首页</h1>}
    <header className={`chat-header z-20 flex shrink-0 items-center justify-between px-4 backdrop-blur-xl sm:px-6 ${isHome ? "home-chat-header py-4" : "border-b border-stone-200/80 bg-[#f7f6f2]/92 py-3"}`}>
      <div className={`flex min-w-0 items-center ${isHome ? "gap-2.5" : "gap-3"}`}>
        <span className={`flex shrink-0 items-center justify-center bg-stone-950 text-white ${isHome ? "h-8 w-8 rounded-xl shadow-[0_8px_24px_rgba(28,25,23,.16)]" : "h-10 w-10 rounded-2xl shadow-lg shadow-stone-300"}`}><NetworkIcon className={isHome ? "h-3.5 w-3.5" : "h-4 w-4"}/></span>
        {!isHome && <time dateTime={currentTime.toISOString()} className="block min-w-0 truncate text-xs tabular-nums text-stone-500">{formatCurrentTime(currentTime)}</time>}
      </div>
      {props.session && <button type="button" onClick={props.onNewProblem} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-stone-500 transition hover:bg-white hover:text-stone-900">开始新题</button>}
    </header>

    <div ref={scrollRef} onScroll={updateScrollState} className={`chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 sm:px-6 ${isHome ? "home-chat-scroll pb-5 pt-0" : "pb-7 pt-5"}`}>
      {isHome ? <EmptyConversation ready={props.ready} fileError={fileError}/> : <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {props.messages.filter((message) => message.surface !== "board").map((message) => <MessageBubble key={message.id} message={message} solutionDisplay={solutionDisplay} activeSuggestionIds={new Set(props.session?.flow.suggestedQuestions?.map((item) => item.id) ?? [])} onSuggestion={props.onSuggestion}/>) }
        {props.reviewProblem && <RecognitionReview problem={props.reviewProblem} onConfirm={props.onConfirmProblem} busy={props.busy}/>}
        {props.busy && !hasActiveChatStream && !hasAssistantOutputForCurrentTurn && <LoadingWhisper label={props.loadingLabel}/>}
        {isPreparingNextTurn && <NextTurnPlaceholder/>}
        {!props.busy && !hasPendingRetry && gate && <GateCard gate={gate} answerChoices={answerChoices} choicesDerivedFromPrompt={choicesDerivedFromPrompt} allowFullSolution={!props.session?.flow.viewedSolution} onChoice={props.onChoice} onAnswer={props.onSend}/>}
        {!props.busy && !hasPendingRetry && props.onReopenBoard && props.session?.flow.stage !== "complete" && <button type="button" onClick={props.onReopenBoard} className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-stone-200 bg-white/70 px-4 text-left text-[11px] font-semibold text-stone-600 transition hover:border-stone-400 hover:bg-white active:scale-[.99]"><span>再次查看刚才的板书</span><span className="text-[9px] font-normal text-stone-400">不改变当前任务</span></button>}
        {!props.busy && props.session?.flow.stage === "complete" && !gate && <CompletionActions session={props.session} onTransfer={props.onRequestTransfer} onNew={props.onNewProblem}/>}
        {!props.busy && props.session?.flow.stage === "reviewed_complete" && !gate && <ReviewCompletionActions onRetryOriginal={props.onRetryOriginal} onTransfer={props.onRequestTransfer} onNew={props.onNewProblem}/>}
      </div>}
    </div>

    {props.notice && <div role="alert" className="chat-toast absolute inset-x-4 top-[68px] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-stone-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl"><p className="min-w-0 flex-1"><InfoIcon className="mr-2 inline h-4 w-4 align-[-3px]"/>{props.notice}</p>{props.retryLabel && <button type="button" disabled={props.busy} onClick={props.onRetry} className="min-h-11 shrink-0 rounded-xl bg-white px-3 text-[11px] font-semibold text-stone-950 disabled:opacity-40">{props.retryLabel}</button>}</div>}

    {hasNewContent && <button type="button" onClick={jumpToLatest} className="chat-new-message absolute bottom-28 left-1/2 z-30 -translate-x-1/2 rounded-full bg-stone-950 px-4 py-2 text-xs font-semibold text-white shadow-xl">有新讲解 ↓</button>}

    <form onSubmit={submit} className={`chat-composer relative z-20 shrink-0 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-5 ${isHome ? "home-chat-composer" : "border-t border-stone-200/80 bg-[#f7f6f2]/95"}`}>
      {currentTask && <div className="mx-auto mb-2 flex max-w-2xl items-center gap-2 px-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"/><div className="min-w-0 flex-1"><span className="mr-1.5 text-[9px] font-semibold tracking-[.08em] text-stone-400">当前环节</span><span className="text-[11px] font-semibold text-stone-600">{currentTask.intent}</span></div>{answerMode && <button type="button" disabled={props.busy} onClick={() => { setQuestionGateId(questionMode ? null : gate?.id ?? null); setInput(""); textareaRef.current?.focus(); }} className="min-h-11 shrink-0 rounded-xl px-2 text-[10px] font-semibold text-stone-500 transition hover:text-stone-900 disabled:opacity-40">{questionMode ? "返回作答" : "改为提问"}</button>}</div>}
      <div className={`mx-auto flex max-w-2xl flex-col gap-2 rounded-[22px] border border-stone-200 bg-white p-2 shadow-[0_10px_30px_rgba(41,37,36,.1)] focus-within:border-stone-400 ${isHome ? "home-input-panel" : ""}`}>
        {isHome && <ReasoningLevelPicker levels={props.reasoningLevels} level={props.reasoningLevel} onLevel={props.onReasoningLevel}/>}
        <div className={`chat-composer__input-row flex w-full items-end gap-1 ${isHome ? "border-t border-stone-100 pt-1" : ""}`}>
          {canAttach && <div className="flex shrink-0 items-center">
            <label aria-label="拍照发题" className={`flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 ${props.ready ? "cursor-pointer" : "cursor-not-allowed opacity-35"}`}><CameraIcon className="h-5 w-5"/><input disabled={!props.ready} type="file" accept="image/*" capture="environment" className="sr-only" onChange={fileChange}/></label>
            <label aria-label="从相册选择题目" className={`flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 ${props.ready ? "cursor-pointer" : "cursor-not-allowed opacity-35"}`}><ImageIcon className="h-5 w-5"/><input disabled={!props.ready} type="file" accept="image/*" className="sr-only" onChange={fileChange}/></label>
            <button type="button" aria-label="白板写题" title="白板写题" disabled={!props.ready} onClick={() => props.onWhiteboard("question")} className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-35"><PencilIcon className="h-5 w-5"/></button>
          </div>}
          {!isHome && showResponseTools && <div aria-label="输入方式" className="flex shrink-0 items-center border-r border-stone-100 pr-1">
            <button type="button" disabled={props.busy} onClick={() => props.onWhiteboard(responseIntent)} aria-label={`打开白板${responseIntent === "answer" ? "作答" : "提问"}`} title={responseIntent === "answer" ? "白板作答" : "白板提问"} className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-35"><PencilIcon className="h-4 w-4"/></button>
            <label aria-label={`拍照${responseIntent === "answer" ? "作答" : "提问"}`} title={responseIntent === "answer" ? "拍照作答" : "拍照提问"} className={`flex h-10 w-10 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 ${props.busy ? "pointer-events-none opacity-35" : "cursor-pointer"}`}><CameraIcon className="h-4 w-4"/><input type="file" accept="image/*" capture="environment" className="sr-only" onChange={responsePhotoChange}/></label>
          </div>}
          <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} rows={1} maxLength={questionMode ? 300 : answerMode ? 2_000 : props.session ? 300 : 8_000} disabled={props.busy || hasPendingRetry || Boolean(props.reviewProblem) || (choiceAnswerMode && !questionMode)} placeholder={hasPendingRetry ? "请先重试刚才未完成的步骤" : questionMode ? currentTask?.placeholder : choiceAnswerMode ? "请点击上方选项作答" : currentTask?.placeholder ?? composerPlaceholder(props.session, props.ready)} aria-label={questionMode ? "询问当前步骤" : answerMode ? "输入你的答案" : "输入题目或问题"} className="min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-sm leading-6 outline-none placeholder:text-stone-400 disabled:opacity-50"/>
          <button type="submit" disabled={props.busy || hasPendingRetry || !input.trim() || Boolean(props.reviewProblem) || (choiceAnswerMode && !questionMode) || (!props.session && !props.ready)} aria-label={questionMode ? "发送问题" : answerMode ? "提交答案" : "发送"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-950 text-white transition active:scale-95 disabled:bg-stone-200 disabled:text-stone-400"><ArrowIcon className="h-5 w-5"/></button>
        </div>
      </div>
      {fileError && <p className="mx-auto mt-2 max-w-2xl px-2 text-[10px] text-red-700">{fileError}</p>}
    </form>
  </main>;
}

function EmptyConversation({ ready, fileError }: { ready: boolean; fileError: string }) {
  const [quoteIndex, setQuoteIndex] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuoteIndex(randomQuoteIndex()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const quote = loadingLearningQuotes[quoteIndex];
  const refreshQuote = () => setQuoteIndex((current) => randomQuoteIndexExcept(current));
  return <section className="empty-chat home-canvas relative mx-auto min-h-full w-full max-w-2xl overflow-hidden rounded-[30px] px-1 pb-5 pt-[clamp(2.5rem,9vh,6.5rem)] sm:px-3">
    <div className="home-ambient" aria-hidden="true"><i/><i/><i/></div>
    <div className="home-hero relative z-10 max-w-xl">
      <p className="mb-4 flex items-center gap-2 text-[9px] font-semibold tracking-[.2em] text-stone-400"><span className="h-px w-7 bg-stone-300"/>从一个问题开始</p>
      <blockquote><div key={`quote-${quoteIndex}`} aria-live="polite" aria-atomic="true" className="quote-enter"><p className="home-quote max-w-[22rem] whitespace-pre-line text-[clamp(1.85rem,7vw,3.1rem)] font-semibold leading-[1.16] tracking-[-.06em] text-stone-950 sm:max-w-[34rem]">“{quote.text}”</p><cite className="mt-4 block text-right text-[11px] leading-4 not-italic text-stone-600">— {quote.source}</cite></div><button type="button" onClick={refreshQuote} className="mt-1 flex min-h-11 items-center gap-1 rounded-full px-2 text-[10px] font-medium text-stone-600 transition hover:bg-white/75 hover:text-stone-900" aria-label="换一句学习寄语"><RefreshIcon className="h-3 w-3"/>换一句</button></blockquote>
    </div>
    {(fileError || !ready) && <p className="relative z-10 mt-3 flex items-center gap-2 text-[9px] leading-5 text-red-700"><InfoIcon className="h-3.5 w-3.5 shrink-0"/>{fileError || "AI 服务正在准备"}</p>}
  </section>;
}

function ReasoningLevelPicker({ levels, level, onLevel }: { levels: ReasoningAvailability[]; level: ReasoningLevel; onLevel: (level: ReasoningLevel) => void }) {
  return <div className="flex min-h-11 w-full items-center justify-between gap-2 px-1"><span className="pl-1 text-[9px] font-semibold tracking-[.1em] text-stone-400">推理强度</span><div className="flex items-center gap-0.5">{levels.map((item) => <button type="button" key={item.id} onClick={() => onLevel(item.id)} disabled={!item.available} aria-pressed={level === item.id} title={item.available ? `${item.label}推理` : `${item.label}推理尚未配置`} className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[10px] font-semibold transition active:scale-[.98] ${level === item.id ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-700 disabled:opacity-35"}`}><span className={`h-1.5 w-1.5 rounded-full ${level === item.id ? "bg-emerald-500" : "bg-stone-300"}`}/>{item.label}</button>)}</div></div>;
}

function MessageBubble({ message, solutionDisplay, activeSuggestionIds, onSuggestion }: { message: ChatMessage; solutionDisplay: "normal" | "locked"; activeSuggestionIds: Set<string>; onSuggestion: (suggestion: SuggestedQuestion) => void }) {
  if (message.kind === "milestone") return <div className="chat-milestone flex items-center gap-3 py-1"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white"><CheckIcon className="h-4 w-4"/></span><div className="h-px flex-1 bg-stone-200"/><div className="shrink-0 text-[11px] font-semibold text-stone-500"><RichLearningText text={message.text} compact/></div></div>;
  if (message.kind === "path") return <div className="chat-path rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4"><p className="text-[10px] font-semibold tracking-[.12em] text-amber-800">正在补回缺失的基础</p><div className="mt-2 text-sm font-semibold leading-6 text-stone-800"><RichLearningText text={message.text} compact/></div><p className="mt-1 text-[10px] text-stone-500">理解后会自动回到刚才的原题步骤</p></div>;
  if (message.kind === "result") return <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${message.text.startsWith("✓") ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}><RichLearningText text={message.text} compact/></div>;
  if (message.role === "assistant" && message.scopeLabel === "原题完整讲解") {
    if (message.status === "error") return <div className="rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3"><p className="text-xs font-semibold text-red-800">完整讲解未完成</p><p className="mt-1 text-[11px] leading-5 text-red-700/70">未完成内容已隐藏，请重试后再继续。</p></div>;
    if (solutionDisplay === "locked") return <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3"><p className="text-[10px] font-semibold tracking-[.1em] text-amber-700">完整讲解已收起</p><p className="mt-1 text-xs leading-5 text-stone-500">接下来只保留学习任务，避免答案继续影响独立思考。</p></div>;
  }
  const mine = message.role === "user";
  const activeSuggestions = message.suggestions?.filter((item) => activeSuggestionIds.has(item.id)) ?? [];
  return <article className={`chat-message flex ${mine ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[90%] ${mine ? "rounded-[22px_22px_6px_22px] bg-stone-950 text-white" : "rounded-[6px_22px_22px_22px] border border-stone-200 bg-white text-stone-900 shadow-sm"} px-4 py-3`}>
      {mine && message.reference && <blockquote className="mb-2 rounded-xl border-l-2 border-amber-400 bg-white/10 px-3 py-2 text-left"><p className="text-[9px] font-semibold tracking-[.08em] text-amber-200">引用 · {message.reference.scopeLabel}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-stone-300">{message.reference.sourceSummary}</p></blockquote>}
      {message.scopeLabel && !mine && <div className="mb-1.5 text-[9px] font-semibold tracking-[.1em] text-amber-700">关于「<RichLearningText text={message.scopeLabel} compact/>」</div>}
      {message.imageUrl && <img src={message.imageUrl} alt="学生发送的题目" className="mb-3 max-h-56 w-full rounded-xl object-contain"/>}
      {mine
        ? <p className="whitespace-pre-wrap text-[15px] leading-7">{message.text}</p>
        : <RichLearningText text={message.text} streaming={message.status === "streaming"} trailing={(message.status === "streaming" || message.status === "finishing") ? <StreamingIndicator status={message.status}/> : undefined}/>}
      {message.status === "error" && <p className={`mt-2 text-[10px] ${mine ? "text-stone-300" : "text-red-700"}`}>本条处理未完成，可以重试或重新发送。</p>}
      {!mine && activeSuggestions.length > 0 && <SuggestedQuestionTrail suggestions={activeSuggestions} onSuggestion={onSuggestion}/>}
    </div>
  </article>;
}

function SuggestedQuestionTrail({ suggestions, onSuggestion }: { suggestions: SuggestedQuestion[]; onSuggestion: (suggestion: SuggestedQuestion) => void }) {
  return <section className="suggested-question-trail mt-4" aria-label="猜你想问">
    <div className="suggested-question-trail__heading">
      <span className="suggested-question-trail__origin" aria-hidden="true"><SparkIcon className="h-3 w-3"/></span>
      <h3>猜你想问</h3>
    </div>
    <div className="suggested-question-trail__branches">
      {suggestions.map((suggestion, index) => <button type="button" key={suggestion.id} onClick={() => onSuggestion(suggestion)} className="suggested-question-trail__question group">
        <span className="suggested-question-trail__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold leading-5 text-stone-800">{suggestion.text}</span>
          <span className="mt-1 block truncate text-[9px] font-medium text-stone-400">关联 · {suggestion.scopeLabel}</span>
        </span>
        <ArrowIcon className="h-3.5 w-3.5 shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-amber-600"/>
      </button>)}
    </div>
  </section>;
}

function GateCard({ gate, answerChoices, choicesDerivedFromPrompt, allowFullSolution, onChoice, onAnswer }: { gate: LearningGate; answerChoices?: string[]; choicesDerivedFromPrompt: boolean; allowFullSolution: boolean; onChoice: (gate: LearningGate, choice: LearningChoice) => void; onAnswer: (answer: string) => void }) {
  const visibleOptions = allowFullSolution ? gate.options : gate.options?.filter((option) => option.id !== "full_solution");
  const parsedPrompt = gate.prompt ? parseLearningPrompt(gate.prompt) : null;
  const isAnswerGate = gate.kind === "node_answer" || gate.kind === "solution_recall_answer" || gate.kind === "original_answer" || gate.kind === "transfer_answer";
  return <section className="chat-gate rounded-[24px] border border-stone-200 bg-white p-4 shadow-[0_14px_36px_rgba(41,37,36,.1)]" aria-label="当前学习任务">
    <div className="mb-3 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white"><NetworkIcon className="h-3.5 w-3.5"/></span><div><p className="text-[9px] font-semibold tracking-[.14em] text-stone-400">轮到你了</p><h2 className="mt-1 text-sm font-bold leading-6"><RichLearningText text={gate.title} compact/></h2></div></div>
    {parsedPrompt?.body && <div className="learning-prompt mb-3 rounded-2xl border border-stone-200/80 bg-stone-50 px-4 py-4 text-stone-800"><p className="mb-2 text-[9px] font-bold tracking-[.14em] text-stone-400">{gate.kind === "original_answer" ? "同一道原题" : gate.kind === "transfer_answer" ? "同类练习" : gate.kind === "solution_recall_answer" ? "关键步骤检查" : "理解检查"}</p><RichLearningText text={parsedPrompt.body}/></div>}
    {isAnswerGate ? <>
      <AnswerChoices choices={answerChoices} stripLabels={choicesDerivedFromPrompt} onAnswer={onAnswer}/>
      {!answerChoices?.length && <p className="text-[11px] leading-5 text-stone-500">请在下方输入你的答案并发送。</p>}
      {visibleOptions?.some((option) => option.id === "view_board") && <button type="button" onClick={() => onChoice(gate, "view_board")} className="mt-3 min-h-11 w-full rounded-xl border border-stone-200 text-[11px] font-semibold text-stone-600 transition hover:border-stone-400">用板书讲清楚</button>}
      {visibleOptions?.some((option) => option.id === "full_solution") && <button type="button" onClick={() => onChoice(gate, "full_solution")} className="mt-3 min-h-11 w-full rounded-xl text-[11px] font-semibold text-stone-400 underline decoration-stone-300 underline-offset-4">先看完整讲解</button>}
    </> : visibleOptions?.length ? <div className="grid grid-cols-2 gap-2">{visibleOptions.map((option) => <button type="button" key={option.id} onClick={() => onChoice(gate, option.id)} className={`min-h-11 rounded-xl px-3 text-xs font-semibold transition active:scale-[.98] ${gate.kind === "solution_review" ? "col-span-2" : ""} ${option.emphasis === "primary" ? "bg-stone-950 text-white" : option.emphasis === "quiet" ? "col-span-2 text-stone-400 underline decoration-stone-300 underline-offset-4" : "border border-stone-200 text-stone-700 hover:border-stone-400"}`}>{option.label}</button>)}</div> : <p className="text-[11px] leading-5 text-stone-500">可以在下方继续描述哪里不懂。</p>}
  </section>;
}

function AnswerChoices({ choices, stripLabels, onAnswer }: { choices?: string[]; stripLabels: boolean; onAnswer: (answer: string) => void }) {
  if (!choices?.length) return null;
  return <div className="mb-2 space-y-2" aria-label="答案选项"><p className="text-[10px] font-semibold text-stone-400">选择一个答案</p>{choices.map((choice, index) => {
    const displayed = choiceDisplayText(choice, index);
    return <button type="button" key={choice} onClick={() => onAnswer(stripLabels ? displayed : choice)} className="group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-3 text-left text-sm font-medium text-stone-800 transition hover:border-stone-400 hover:bg-white active:scale-[.99]"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-[10px] font-bold text-stone-500 group-hover:border-stone-950 group-hover:bg-stone-950 group-hover:text-white">{String.fromCharCode(65 + index)}</span><div className="min-w-0 flex-1 leading-6"><RichLearningText text={displayed} compact/></div></button>;
  })}</div>;
}

function choiceDisplayText(choice: string, index: number): string {
  return stripLearningChoiceLabel(choice, index);
}

function RecognitionReview({ problem, onConfirm, busy }: { problem: ProblemSnapshot; onConfirm: (problem: ProblemSnapshot) => void; busy: boolean }) {
  const [text, setText] = useState(problem.text);
  return <section className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-4"><p className="text-[10px] font-semibold tracking-[.12em] text-amber-800">识别结果需要你确认</p><textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} className="mt-3 w-full resize-y rounded-2xl border border-amber-200 bg-white p-3 text-sm leading-6 outline-none focus:border-amber-500"/><button type="button" disabled={busy || text.trim().length < 3} onClick={() => onConfirm({ ...problem, text: text.trim(), userRevised: true })} className="mt-3 min-h-11 w-full rounded-xl bg-stone-950 text-sm font-semibold text-white disabled:opacity-35">确认题目，开始讲解</button></section>;
}

function LoadingWhisper({ label }: { label: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setIndex((value) => (value + 1) % loadingLearningQuotes.length), 5_500); return () => window.clearInterval(timer); }, []);
  const quote = loadingLearningQuotes[index];
  return <div className="loading-whisper rounded-2xl border border-stone-200/80 bg-white/75 px-4 py-3"><div role="status" aria-live="polite" className="flex items-center gap-2"><StreamingIndicator status="starting" compact/><p className="text-xs font-semibold text-stone-700">{label || "AI 正在继续思考"}</p></div><p aria-hidden="true" key={index} className="quote-enter mt-2 text-[11px] leading-5 text-stone-400">“{quote.text}” <span>— {quote.source}</span></p></div>;
}

function NextTurnPlaceholder() {
  return <section className="next-turn-placeholder chat-gate rounded-[24px] border border-stone-200 bg-white p-4 shadow-[0_14px_36px_rgba(41,37,36,.08)]" role="status" aria-live="polite" aria-label="下一步正在准备">
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white"><NetworkIcon className="h-3.5 w-3.5"/></span>
      <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold tracking-[.14em] text-stone-400">下一步正在准备</p><h2 className="mt-1 text-sm font-bold leading-6 text-stone-800">接下来会轮到你</h2><p className="mt-1 text-[10px] leading-5 text-stone-400">正在把刚才的内容整理成下一步互动</p></div>
      <span className="next-turn-placeholder__status shrink-0 rounded-full bg-stone-100 px-2 py-1 text-[9px] font-semibold text-stone-500">即将出现</span>
    </div>
    <div className="next-turn-placeholder__preview mt-4 rounded-2xl border border-stone-100 bg-stone-50/70 p-3" aria-hidden="true">
      <span className="next-turn-placeholder__skeleton block h-2 w-2/3 rounded-full"/>
      <div className="mt-3 grid grid-cols-2 gap-2"><span className="next-turn-placeholder__skeleton block h-10 rounded-xl"/><span className="next-turn-placeholder__skeleton block h-10 rounded-xl"/></div>
    </div>
  </section>;
}

function CompletionActions({ session, onTransfer, onNew }: { session: LearningSession; onTransfer: () => void; onNew: () => void }) {
  const title = session.originalPassed ? "你已经独立解决了这道原题" : "你已经独立解决了一道同知识点题";
  const evidence = session.originalPassed ? "原题独立作答已经通过。" : "换了题目后仍能使用同一关键方法。";
  return <section className="rounded-[24px] bg-stone-950 p-5 text-white"><p className="text-[10px] font-semibold tracking-[.14em] text-emerald-400">已验证掌握</p><h2 className="mt-2 text-xl font-bold tracking-[-.03em]">{title}</h2><p className="mt-2 text-xs leading-5 text-stone-400">{evidence}{session.flow.pathNodeIds.length ? ` 这次还补过 ${session.flow.pathNodeIds.length} 个基础节点。` : ""} 还可以继续追问，不会丢失本题上下文。</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={onTransfer} className="min-h-11 rounded-xl bg-white text-xs font-semibold text-stone-950">再练一道同类题</button><button type="button" onClick={onNew} className="min-h-11 rounded-xl border border-white/15 text-xs font-semibold">开始新题</button></div><p className="mt-3 text-center text-[9px] text-stone-500">同类题由 AI 生成，不冒充真题或高频题</p></section>;
}

function ReviewCompletionActions({ onRetryOriginal, onTransfer, onNew }: { onRetryOriginal: () => void; onTransfer: () => void; onNew: () => void }) {
  return <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-[0_14px_36px_rgba(41,37,36,.08)]"><p className="text-[10px] font-semibold tracking-[.14em] text-amber-700">已学习 · 尚未验证掌握</p><h2 className="mt-2 text-xl font-bold tracking-[-.03em] text-stone-950">关键步骤已经理解</h2><p className="mt-2 text-xs leading-5 text-stone-500">你看过完整讲解，也说清了关键关系；但还没有独立做对一道题，因此暂不标记为“已掌握”。</p><div className="mt-4 grid gap-2"><button type="button" onClick={onRetryOriginal} className="min-h-11 rounded-xl bg-stone-950 px-3 text-xs font-semibold text-white">遮住讲解，重做原题</button><button type="button" onClick={onTransfer} className="min-h-11 rounded-xl border border-stone-200 px-3 text-xs font-semibold text-stone-700">换一道同知识点题</button><button type="button" onClick={onNew} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-stone-400">开始新题</button></div></section>;
}

function composerPlaceholder(session: LearningSession | null, ready: boolean) {
  if (!ready && !session) return "AI 服务正在准备";
  if (!session) return "输入一道题目…";
  return "继续问这道题…";
}

function currentTaskCopy(session: LearningSession | null, gate: LearningGate, questionMode: boolean): { intent: string; placeholder: string } {
  if (questionMode) return { intent: "解决你对当前步骤的疑问", placeholder: "具体说说你卡在哪一步…" };

  switch (gate.kind) {
    case "understanding": {
      const intent = session?.flow.stage === "core_explanation"
        ? "确认你是否理解核心思路"
        : session?.flow.stage === "remediation"
          ? "确认新的讲法是否解决了卡点"
          : "确认你是否理解当前这一步";
      return { intent, placeholder: "懂了、没懂，或直接问…" };
    }
    case "node_answer":
      return { intent: "用一道小题检验当前知识点", placeholder: "写下答案，也可以补充你的思路…" };
    case "solution_review":
      return { intent: "完整阅读解题过程，找出仍不清楚的步骤", placeholder: "可以继续问讲解中没看懂的步骤…" };
    case "solution_recall_answer":
      return { intent: "用自己的话说清一个关键步骤", placeholder: "写下你理解的关键步骤…" };
    case "post_solution":
      return { intent: "选择一种方式验证是否真正掌握", placeholder: "也可以告诉我你想怎样继续…" };
    case "original_answer":
      return { intent: "独立完成原题，验证是否真正掌握", placeholder: "写下答案和关键步骤…" };
    case "transfer_answer":
      return { intent: "完成同类题，验证方法能否迁移", placeholder: "写下这道同类题的答案和思路…" };
    case "needs_help":
      return { intent: "说清具体卡点，找到下一种讲法", placeholder: "告诉我具体卡在哪里…" };
  }
}

function formatCurrentTime(value: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("month")}月${read("day")}日 ${read("weekday")} · ${read("hour")}:${read("minute")}`;
}

function randomQuoteIndexExcept(current: number): number {
  if (loadingLearningQuotes.length < 2) return 0;
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  const next = value[0] % (loadingLearningQuotes.length - 1);
  return next >= current ? next + 1 : next;
}

function randomQuoteIndex(): number {
  if (typeof crypto === "undefined") return 0;
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % loadingLearningQuotes.length;
}

function choicesFromSession(session: LearningSession | null, gate: LearningGate | null): string[] | undefined {
  if (!session || !gate) return undefined;
  if (gate.kind === "solution_recall_answer") return undefined;
  if (gate.kind === "transfer_answer") return session.transferCheck?.choices;
  return session.nodes.find((node) => node.id === gate.nodeId)?.check.choices;
}
