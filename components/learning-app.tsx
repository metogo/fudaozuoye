"use client";

import { useEffect, useRef, useState } from "react";
import { createReportFile } from "@/lib/learning/report";
import type { ApiEnvelope, ClientSessionState, LearningSession, ProblemSnapshot, ProviderAvailability, ProviderId } from "@/lib/learning/types";
import { CaptureStep } from "./capture-step";
import { ArrowIcon, CheckIcon, InfoIcon, LockIcon, NetworkIcon } from "./icons";
import { ImageCropper } from "./image-cropper";
import { LearningWorkspace } from "./learning-workspace";
import { ReviewStep } from "./review-step";

type Screen = "consent" | "capture" | "review" | "recognizing" | "analyzing" | "learning";
const CONSENT_KEY = "backtrack-guardian-consent-v1";
const SESSION_KEY = "backtrack-current-session-v1";
const fallbackProviders: ProviderAvailability[] = [
  { id: "doubao", label: "豆包", description: "默认模型", available: false, mode: "unavailable" },
  { id: "openai", label: "GPT", description: "可选模型", available: false, mode: "unavailable" },
  { id: "xai", label: "Grok", description: "可选模型", available: false, mode: "unavailable" },
];

export function LearningApp() {
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>("consent");
  const [consented, setConsented] = useState(false);
  const [providers, setProviders] = useState(fallbackProviders);
  const [provider, setProvider] = useState<ProviderId>("doubao");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [problem, setProblem] = useState<ProblemSnapshot | null>(null);
  const [session, setSession] = useState<LearningSession | null>(null);
  const [stateToken, setStateToken] = useState("");
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [analysisLabel, setAnalysisLabel] = useState("正在读题");
  const [analysisEvents, setAnalysisEvents] = useState<string[]>([]);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const expandAbortRef = useRef<AbortController | null>(null);
  const returningHomeRef = useRef(false);

  useEffect(() => {
    let active = true;
    const hydrationTimer = window.setTimeout(() => {
      if (!active) return;
      try {
        const consent = localStorage.getItem(CONSENT_KEY) === "accepted";
        const stored = sessionStorage.getItem(SESSION_KEY);
        setConsented(consent);
        if (stored) {
          const restored = JSON.parse(stored) as unknown;
          if (isRestorableState(restored)) { setSession(restored.session); setStateToken(restored.stateToken); setProvider(restored.session.provider); setScreen(consent ? "learning" : "consent"); }
          else { sessionStorage.removeItem(SESSION_KEY); setScreen(consent ? "capture" : "consent"); }
        } else setScreen(consent ? "capture" : "consent");
      } catch { setScreen("consent"); }
      setHydrated(true);
    }, 0);
    fetch("/api/providers", { cache: "no-store" }).then((response) => response.json()).then((data: { providers?: ProviderAvailability[] }) => {
      if (data.providers?.length) setProviders(data.providers);
    }).catch(() => setNotice("模型状态暂时无法读取，暂不能开始识别。"))
      .finally(() => setProvidersLoaded(true));
    return () => { active = false; window.clearTimeout(hydrationTimer); };
  }, []);

  useEffect(() => {
    if (!session || !stateToken) return;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ session, stateToken } satisfies ClientSessionState)); }
    catch { queueMicrotask(() => setNotice("当前浏览器无法保存进度；本页关闭后会话将丢失。 ")); }
  }, [session, stateToken]);

  const acceptConsent = async () => {
    if (!consented) return;
    setBusy(true);
    try {
      const response = await fetch("/api/consent", { method: "POST" });
      if (!response.ok) throw new Error("无法记录监护人同意，请重试");
      localStorage.setItem(CONSENT_KEY, "accepted");
      setScreen(session ? "learning" : "capture");
    } catch (error) { setNotice(messageOf(error)); }
    finally { setBusy(false); }
  };

  const recognize = async (blob: Blob, nextPreviewUrl: string) => {
    returningHomeRef.current = false;
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setCropFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(nextPreviewUrl);
    setCroppedBlob(blob);
    setAnalysisLabel("正在连接模型"); setAnalysisEvents([]); setBusy(true); setScreen("recognizing");
    setNotice("");
    try {
      const form = new FormData();
      form.set("stage", "recognize"); form.set("provider", provider);
      form.set("image", new File([blob], "homework.jpg", { type: "image/jpeg" }));
      await postSse(form, (event, data) => {
        if (event === "phase") {
          const label = String((data as { label?: string }).label ?? "正在识别");
          setAnalysisLabel(label);
          setAnalysisEvents((events) => events.at(-1) === label ? events : [...events, label].slice(-4));
        }
        if (event === "recognized") { const next = data as ProblemSnapshot; setProblem(next); setScreen("review"); }
      }, controller.signal);
    } catch (error) {
      if (!returningHomeRef.current) {
        setNotice(isAbortError(error) ? "已停止识别，可以重新拍摄。" : messageOf(error));
        setScreen("capture");
      }
    }
    finally { analysisAbortRef.current = null; setBusy(false); }
  };

  const analyze = async () => {
    if (!problem) return;
    returningHomeRef.current = false;
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setAnalysisLabel("正在连接模型"); setAnalysisEvents([]); setBusy(true); setNotice("");
    try {
      const form = new FormData();
      form.set("stage", "full"); form.set("provider", provider); form.set("problem", JSON.stringify(problem));
      if (croppedBlob) form.set("image", new File([croppedBlob], "homework.jpg", { type: "image/jpeg" }));
      await postSse(form, (event, data) => {
        if (event === "phase") {
          const label = String((data as { label?: string }).label ?? "正在分析");
          setAnalysisLabel(label);
          setAnalysisEvents((events) => events.at(-1) === label ? events : [...events, label].slice(-4));
          setScreen("analyzing");
        }
        if (event === "graph") { const next = data as ClientSessionState; setFocusNodeId(null); setSession(next.session); setStateToken(next.stateToken); setScreen("learning"); }
      }, controller.signal);
    } catch (error) {
      if (!returningHomeRef.current) {
        setNotice(isAbortError(error) ? "已停止分析，可以修订题目后重新开始。" : messageOf(error));
        setScreen("review");
      }
    }
    finally { analysisAbortRef.current = null; setBusy(false); }
  };

  const updateSession = async <T,>(url: string, body: Record<string, unknown>): Promise<T> => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const envelope = await response.json() as ApiEnvelope<T>;
    if (!response.ok || envelope.error || envelope.data === null) throw new Error(envelope.error?.message ?? "请求失败");
    return envelope.data;
  };

  const expand = async (nodeId: string) => {
    if (!session || !stateToken) return;
    const node = session.nodes.find((item) => item.id === nodeId);
    if (node?.atomic) { await verify(nodeId, "__not_known__"); return; }
    const controller = new AbortController();
    expandAbortRef.current = controller;
    setBusy(true); setNotice(`正在从“${node?.title ?? "当前知识点"}”继续找更简单的前置知识…`);
    try {
      await postJsonSse("/api/learning/expand", { stateToken, targetNodeId: nodeId }, (event, data) => {
        if (event === "phase") setNotice(String((data as { label?: string }).label ?? "正在继续向下拆…"));
        if (event === "graph") {
          const next = data as ClientSessionState;
          const nextNode = next.session.nodes.find((item) => item.id === next.session.currentNodeId);
          setFocusNodeId(next.session.currentNodeId);
          setSession(next.session);
          setStateToken(next.stateToken);
          setNotice(`已向下拆到“${nextNode?.title ?? "新的前置知识"}”，讲解已切换到这里。`);
        }
      }, controller.signal);
    } catch (error) { if (!returningHomeRef.current) setNotice(isAbortError(error) ? "已停止继续拆解。" : messageOf(error)); }
    finally { expandAbortRef.current = null; setBusy(false); }
  };

  const verify = async (nodeId: string, answer: string) => {
    if (!session || !stateToken) return;
    setBusy(true); setNotice("");
    try {
      const data = await updateSession<ClientSessionState & { assessment: { passed: boolean; explanation: string } }>("/api/learning/verify", { stateToken, nodeId, ...(answer === "__not_known__" ? { action: "mark_unknown" } : { answer }), source: "system" });
      setSession(data.session); setStateToken(data.stateToken); setNotice(data.assessment.explanation);
      if (data.session.stage === "transfer_check" && !data.session.transferCheck) await generateTransfer({ session: data.session, stateToken: data.stateToken });
    } catch (error) { setNotice(messageOf(error)); }
    finally { setBusy(false); }
  };

  const parentConfirm = async (nodeId: string) => {
    if (!session || !stateToken) return;
    setBusy(true); setNotice("");
    try {
      const data = await updateSession<ClientSessionState & { assessment: { explanation: string } }>("/api/learning/verify", { stateToken, nodeId, source: "parent" });
      setSession(data.session); setStateToken(data.stateToken); setNotice(data.assessment.explanation);
    } catch (error) { setNotice(messageOf(error)); }
    finally { setBusy(false); }
  };

  const generateTransfer = async (override?: ClientSessionState) => {
    const current = override?.session ?? session;
    const token = override?.stateToken ?? stateToken;
    if (!current || !token) return;
    setBusy(true); setNotice("");
    try {
      const next = await updateSession<ClientSessionState>("/api/learning/transfer", { stateToken: token });
      setSession(next.session); setStateToken(next.stateToken);
    } catch (error) { setNotice(messageOf(error)); }
    finally { setBusy(false); }
  };

  const solution = async (onDelta: (text: string) => void) => {
    if (!session || !stateToken) return;
    try {
      const response = await fetch("/api/learning/solution", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken }) });
      await readSseResponse(response, (event, data) => {
        if (event === "delta") onDelta(String((data as { text?: string }).text ?? ""));
      });
    } catch (error) { setNotice(messageOf(error)); onDelta("答案生成失败，请稍后重试。"); }
  };

  const share = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const file = await createReportFile(session);
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: "回溯学学习报告", files: [file] });
      else {
        const url = URL.createObjectURL(file); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("当前浏览器不支持直接分享，报告已保存为图片。 ");
      }
    } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; setNotice(messageOf(error)); }
    finally { setBusy(false); }
  };

  const reset = () => {
    returningHomeRef.current = true;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    expandAbortRef.current?.abort();
    expandAbortRef.current = null;
    sessionStorage.removeItem(SESSION_KEY);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSession(null); setStateToken(""); setProblem(null); setCroppedBlob(null); setPreviewUrl(""); setNotice(""); setFocusNodeId(null); setScreen("capture");
  };

  if (!hydrated) return <div className="flex min-h-dvh items-center justify-center text-sm text-stone-500">正在准备辅导空间…</div>;
  if (screen === "consent") return <><ConsentScreen checked={consented} busy={busy} onChecked={setConsented} onContinue={acceptConsent}/>{notice && <FloatingNotice text={notice}/>}</>;
  if (screen === "capture") return <><CaptureStep providers={providers} provider={provider} ready={providersLoaded && providers.some((item) => item.id === provider && item.available)} onProvider={setProvider} onFile={setCropFile} onResetConsent={() => { setConsented(false); localStorage.removeItem(CONSENT_KEY); setScreen("consent"); }}/>{notice && <FloatingNotice text={notice}/>} {cropFile && <ImageCropper file={cropFile} onConfirm={recognize} onCancel={() => setCropFile(null)}/>}</>;
  if (screen === "review" && problem) return <><ReviewStep problem={problem} previewUrl={previewUrl} demo={providers.find((item) => item.id === provider)?.mode === "demo"} onChange={setProblem} onConfirm={analyze} onRetake={reset} busy={busy}/>{notice && <FloatingNotice text={notice}/>}</>;
  if (screen === "recognizing") return <AnalysisScreen activity="recognize" label={analysisLabel} events={analysisEvents} provider={provider} onCancel={() => analysisAbortRef.current?.abort()} onHome={reset}/>;
  if (screen === "analyzing") return <AnalysisScreen activity="analyze" label={analysisLabel} events={analysisEvents} provider={provider} onCancel={() => analysisAbortRef.current?.abort()} onHome={reset}/>;
  if (session) return <LearningWorkspace key={`${session.currentNodeId}-${session.stage}`} session={session} busy={busy} notice={notice} focusNodeId={focusNodeId} onFocusApplied={() => setFocusNodeId(null)} onExpand={expand} onVerify={verify} onParentConfirm={parentConfirm} onGenerateTransfer={() => generateTransfer()} onSolution={solution} onShare={share} onReset={reset}/>;
  return null;
}

function ConsentScreen({ checked, busy, onChecked, onContinue }: { checked: boolean; busy: boolean; onChecked: (checked: boolean) => void; onContinue: () => void }) {
  return <main className="consent-screen mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-8 pt-8 sm:px-8"><div className="mb-auto"><div className="mb-12 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-950 text-white"><NetworkIcon className="h-6 w-6"/></div><p className="text-xs font-semibold tracking-[.18em] text-stone-500">FOR PARENTS</p><h1 className="mt-3 text-4xl font-semibold leading-[1.12] tracking-[-.055em]">先保护孩子，<br/>再开始辅导。</h1><p className="mt-5 max-w-xl text-[15px] leading-7 text-stone-600">本产品面向家长使用。作业照片可能包含未成年人的姓名、学校或笔迹等敏感信息，请只拍一道题并避开身份信息。</p>
      <section className="mt-8 space-y-3"><PolicyItem icon={<LockIcon className="h-5 w-5"/>} title="不保存原始照片" text="图片仅在当前请求中发送给你选择的模型，不写入应用存储。"/><PolicyItem icon={<CheckIcon className="h-5 w-5"/>} title="结果由家长监督" text="AI 可能识别或推理错误；你可以修订题目，并报告不相关知识点。"/><PolicyItem icon={<InfoIcon className="h-5 w-5"/>} title="不建立孩子画像" text="首版没有账号、长期记录或个性化追踪，只保留当前单题进度。"/></section></div>
    <div className="mt-8"><label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-stone-300 bg-white p-4"><input type="checkbox" checked={checked} onChange={(event) => onChecked(event.target.checked)} className="mt-1 h-5 w-5 accent-stone-950"/><span className="text-sm leading-6">我是孩子的家长或监护人，已阅读并同意本次处理说明。</span></label><button onClick={onContinue} disabled={!checked || busy} className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 font-semibold text-white disabled:opacity-30">{busy ? "正在记录同意…" : "继续使用"}<ArrowIcon className="h-5 w-5"/></button></div>
  </main>;
}

function PolicyItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="flex gap-4 rounded-2xl bg-stone-100 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">{icon}</span><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-stone-500">{text}</p></div></div>; }

function AnalysisScreen({ activity, label, events, provider, onCancel, onHome }: { activity: "recognize" | "analyze"; label: string; events: string[]; provider: ProviderId; onCancel: () => void; onHome: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const recognizing = activity === "recognize";
  const title = recognizing ? "正在识别题目" : "正在搭建知识路径";
  const description = recognizing ? "裁切已完成。模型会读取题干、孩子作答、学科和学段，识别后再由你确认。" : "模型的分析进度会实时显示；先找直接前置，不会一次铺满整张图。";
  const cancelText = recognizing ? "停止识别，返回拍照" : "停止分析，返回检查题目";
  return <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-10 pt-8 sm:px-8" aria-busy="true"><header><div className="flex items-start justify-between gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-950 text-white"><NetworkIcon className="h-6 w-6"/></div><button onClick={onHome} className="min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700">返回首页</button></div><p className="mt-8 text-xs font-semibold tracking-[.16em] text-stone-400">{provider === "doubao" ? "豆包" : provider === "openai" ? "GPT" : "Grok"} · 实时{recognizing ? "识别" : "分析"}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">{title}</h1><p className="mt-3 text-sm leading-6 text-stone-500">{description}</p></header><section className="mt-8 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm" aria-live="polite"><div className="border-b border-stone-100 px-5 py-4"><p className="text-xs font-semibold text-stone-500">SSE 实时输出</p></div><ol className="divide-y divide-stone-100">{events.map((event, index) => <li key={`${event}-${index}`} className="flex min-h-16 items-center gap-3 px-5 py-3"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${index === events.length - 1 ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-500"}`}>{index === events.length - 1 ? <span className="h-2 w-2 animate-pulse rounded-full bg-white"/> : index + 1}</span><span className={`text-sm ${index === events.length - 1 ? "font-semibold text-stone-950" : "text-stone-500"}`}><StreamingText text={event} animate={index === events.length - 1}/></span></li>)}</ol><div className="flex items-center gap-3 bg-stone-50 px-5 py-4"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-stone-950"/><p className="text-sm font-medium text-stone-700">{events.length ? "模型仍在继续输出…" : <StreamingText text={label} animate/>}</p></div></section><p className="mt-4 text-xs text-stone-500">已{recognizing ? "识别" : "分析"} {elapsed} 秒</p><div className="mt-auto grid gap-3 pt-8 sm:grid-cols-2"><button onClick={onCancel} className="min-h-12 rounded-2xl bg-stone-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800">{cancelText}</button><button onClick={onHome} className="min-h-12 rounded-2xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:border-stone-500">结束本题，返回首页</button></div></main>;
}

function StreamingText({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return <>{text}</>;
  return <AnimatedStreamingText text={text}/>;
}

function AnimatedStreamingText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 38);
    return () => window.clearInterval(timer);
  }, [text]);
  return <>{displayed}{displayed.length < text.length && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-[-2px]"/>}</>;
}

function FloatingNotice({ text }: { text: string }) { return <div className="fixed inset-x-4 bottom-5 z-40 mx-auto max-w-xl rounded-2xl bg-stone-950 px-4 py-3 text-sm leading-6 text-white shadow-2xl">{text}</div>; }

async function postSse(form: FormData, onEvent: (event: string, data: unknown) => void, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  try {
    await readSseResponse(await fetch("/api/learning/analyze", { method: "POST", body: form, signal: controller.signal }), onEvent);
  } finally { externalSignal?.removeEventListener("abort", abort); window.clearTimeout(timeout); }
}

async function postJsonSse(url: string, body: Record<string, unknown>, onEvent: (event: string, data: unknown) => void, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  try {
    await readSseResponse(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }), onEvent);
  } finally { externalSignal?.removeEventListener("abort", abort); window.clearTimeout(timeout); }
}

async function readSseResponse(response: Response, onEvent: (event: string, data: unknown) => void) {
  if (!response.ok || !response.body) throw new Error(await response.text() || "流式请求失败");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let completed = false;
  const parseBlock = (block: string) => {
    const event = block.match(/^event: (.+)$/m)?.[1]; const raw = block.match(/^data: (.+)$/m)?.[1];
    if (!event || !raw) return;
    const data = JSON.parse(raw) as unknown;
    if (event === "error") throw new Error(String((data as { message?: string }).message ?? "流式请求失败"));
    if (event === "complete") completed = true;
    onEvent(event, data);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n"); buffer = blocks.pop() ?? "";
    for (const block of blocks) parseBlock(block);
  }
  if (buffer.trim()) parseBlock(buffer);
  if (!completed) throw new Error("流式连接意外中断，请重试同一模型");
}

function isRestorableState(value: unknown): value is ClientSessionState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ClientSessionState>;
  const session = item.session;
  return typeof item.stateToken === "string" && item.stateToken.length > 40 && Boolean(session && session.schemaVersion === "1.0" && Array.isArray(session.nodes) && Array.isArray(session.edges) && typeof session.rootNodeId === "string" && session.nodes.some((node) => node?.id === session.rootNodeId));
}

function messageOf(error: unknown) { return error instanceof Error ? error.message : "操作失败，请重试"; }
function isAbortError(error: unknown) { return error instanceof DOMException && error.name === "AbortError"; }
