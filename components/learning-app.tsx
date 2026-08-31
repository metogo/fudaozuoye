"use client";

import { useEffect, useRef, useState } from "react";
import { createReportFile } from "@/lib/learning/report";
import type { ApiEnvelope, ClientSessionState, LearningSession, ProblemSnapshot, ProviderAvailability, ProviderId, TutorScope } from "@/lib/learning/types";
import { CaptureStep } from "./capture-step";
import { ImageCropper } from "./image-cropper";
import { LearningWorkspace } from "./learning-workspace";
import { PreparationStep, type PreparationPhase } from "./review-step";

type Screen = "capture" | "preparing" | "learning";
const SESSION_KEY = "guided-learning-session-v2";
const fallbackProviders: ProviderAvailability[] = [
  { id: "doubao", label: "豆包", description: "默认模型", available: false, mode: "unavailable" },
  { id: "openai", label: "GPT", description: "可选模型", available: false, mode: "unavailable" },
  { id: "xai", label: "Grok", description: "可选模型", available: false, mode: "unavailable" },
];

export function LearningApp() {
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>("capture");
  const [preparationPhase, setPreparationPhase] = useState<PreparationPhase>("recognizing");
  const [consentReady, setConsentReady] = useState(false);
  const [providers, setProviders] = useState(fallbackProviders);
  const [provider, setProvider] = useState<ProviderId>("doubao");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [problem, setProblem] = useState<ProblemSnapshot | null>(null);
  const [session, setSession] = useState<LearningSession | null>(null);
  const [stateToken, setStateToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [analysisLabel, setAnalysisLabel] = useState("正在读题");
  const [analysisEvents, setAnalysisEvents] = useState<string[]>([]);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
  const [similarNodeId, setSimilarNodeId] = useState<string | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const expandAbortRef = useRef<AbortController | null>(null);
  const tutorAbortRef = useRef<AbortController | null>(null);
  const returningHomeRef = useRef(false);

  useEffect(() => {
    let active = true;
    const hydrationTimer = window.setTimeout(() => {
      if (!active) return;
      try {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (stored) {
          const restored = JSON.parse(stored) as unknown;
          if (isRestorableState(restored)) { const displayProvider = (restored as { displayProvider?: unknown }).displayProvider; setSession(restored.session); setStateToken(restored.stateToken); setProvider(isProviderId(displayProvider) ? displayProvider : restored.session.provider); setScreen("learning"); }
          else { sessionStorage.removeItem(SESSION_KEY); setScreen("capture"); }
        } else setScreen("capture");
      } catch { setScreen("capture"); }
      setHydrated(true);
    }, 0);
    fetch(apiUrl("/consent"), { method: "POST", credentials: "include" }).then(async (response) => {
      if (!response.ok) throw new Error("无法准备分析服务");
      const data = await response.json() as { providers?: ProviderAvailability[] };
      if (!data.providers?.length) throw new Error("分析服务没有返回模型状态");
      if (active) {
        setProviders(data.providers);
        setConsentReady(true);
        if (!data.providers.some((item) => item.id === "doubao" && item.available)) setNotice("豆包服务暂不可用，请稍后刷新重试。");
      }
    }).catch(() => setNotice("服务暂时无法准备，请刷新后重试。"));
    return () => { active = false; window.clearTimeout(hydrationTimer); };
  }, []);

  useEffect(() => {
    if (!session || !stateToken) return;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ session, stateToken, displayProvider: provider })); }
    catch { queueMicrotask(() => setNotice("当前浏览器无法保存进度；本页关闭后会话将丢失。 ")); }
  }, [provider, session, stateToken]);

  const recognize = async (blob: Blob, nextPreviewUrl: string) => {
    returningHomeRef.current = false;
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setCropFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(nextPreviewUrl);
    setCroppedBlob(blob);
    setPreparationPhase("recognizing"); setAnalysisLabel("正在连接模型"); setAnalysisEvents([]); setBusy(true); setScreen("preparing");
    setNotice("");
    try {
      const form = new FormData();
      form.set("stage", "recognize"); form.set("provider", "doubao");
      form.set("image", new File([blob], "homework.jpg", { type: "image/jpeg" }));
      await postSse(form, (event, data) => {
        if (event === "phase") {
          const label = String((data as { label?: string }).label ?? "正在识别");
          setAnalysisLabel(label);
          setAnalysisEvents((events) => events.at(-1) === label ? events : [...events, label].slice(-4));
        }
        if (event === "recognized") { const next = data as ProblemSnapshot; setProblem(next); setPreparationPhase("review"); }
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
    setPreparationPhase("analyzing"); setAnalysisLabel("正在连接模型"); setAnalysisEvents([]); setBusy(true); setNotice("");
    try {
      const form = new FormData();
      form.set("stage", "full"); form.set("provider", "doubao"); form.set("problem", JSON.stringify(problem));
      if (croppedBlob) form.set("image", new File([croppedBlob], "homework.jpg", { type: "image/jpeg" }));
      await postSse(form, (event, data) => {
        if (event === "phase") {
          const label = String((data as { label?: string }).label ?? "正在分析");
          setAnalysisLabel(label);
          setAnalysisEvents((events) => events.at(-1) === label ? events : [...events, label].slice(-4));
        }
        if (event === "graph") { const next = data as ClientSessionState; setFocusNodeId(null); setSession(next.session); setStateToken(next.stateToken); setScreen("learning"); }
      }, controller.signal);
    } catch (error) {
      if (!returningHomeRef.current) {
        setNotice(isAbortError(error) ? "已停止分析，可以修改题目后重新开始。" : analysisMessageOf(error));
        setPreparationPhase("review");
      }
    }
    finally { analysisAbortRef.current = null; setBusy(false); }
  };

  const updateSession = async <T,>(url: string, body: Record<string, unknown>): Promise<T> => {
    const response = await fetch(apiUrl(url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
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
    setExpandingNodeId(nodeId);
    setBusy(true); setNotice(`正在从“${node?.title ?? "当前知识点"}”继续找更简单的前置知识…`);
    try {
      await postJsonSse("/learning/expand", { stateToken, targetNodeId: nodeId }, (event, data) => {
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
    finally { expandAbortRef.current = null; setExpandingNodeId(null); setBusy(false); }
  };

  const verify = async (nodeId: string, answer: string) => {
    if (!session || !stateToken) return;
    setBusy(true); setNotice("");
    try {
      const data = await updateSession<ClientSessionState & { assessment: { passed: boolean; explanation: string } }>("/learning/verify", { stateToken, nodeId, ...(answer === "__not_known__" ? { action: "mark_unknown" } : { answer }), source: "system" });
      if (data.session.currentNodeId && data.session.currentNodeId !== session.currentNodeId) setFocusNodeId(data.session.currentNodeId);
      setSession(data.session); setStateToken(data.stateToken); setNotice(data.assessment.explanation);
      if (data.session.stage === "transfer_check" && !data.session.transferCheck) await generateTransfer({ session: data.session, stateToken: data.stateToken });
    } catch (error) { setNotice(messageOf(error)); }
    finally { setBusy(false); }
  };

  const replaceSimilarCheck = async (nodeId: string) => {
    if (!session || !stateToken) return;
    setBusy(true); setSimilarNodeId(nodeId); setNotice("");
    try {
      await postJsonSse("/learning/similar", { stateToken, nodeId }, (event, data) => {
        if (event === "phase") setNotice(String((data as { label?: string }).label ?? "正在生成同知识点新题…"));
        if (event === "graph") {
          const next = data as ClientSessionState;
          setSession(next.session);
          setStateToken(next.stateToken);
          setNotice("已换成一道同知识点新题。题目由 AI 生成，不冒充真题或高频题。");
        }
      });
    } catch (error) { setNotice(messageOf(error)); }
    finally { setSimilarNodeId(null); setBusy(false); }
  };

  const generateTransfer = async (override?: ClientSessionState) => {
    const current = override?.session ?? session;
    const token = override?.stateToken ?? stateToken;
    if (!current || !token) return;
    setBusy(true); setNotice("");
    try {
      const next = await updateSession<ClientSessionState>("/learning/transfer", { stateToken: token });
      setSession(next.session); setStateToken(next.stateToken);
    } catch (error) { setNotice(messageOf(error)); }
    finally { setBusy(false); }
  };

  const solution = async (onDelta: (text: string) => void) => {
    if (!session || !stateToken) return;
    try {
      const response = await fetch(apiUrl("/learning/solution"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken }), credentials: "include" });
      await readSseResponse(response, (event, data) => {
        if (event === "delta") onDelta(String((data as { text?: string }).text ?? ""));
      });
    } catch (error) { setNotice(messageOf(error)); onDelta("答案生成失败，请稍后重试。"); }
  };

  const tutor = async (scope: TutorScope, question: string, onDelta: (text: string) => void) => {
    const controller = new AbortController();
    let timedOut = false;
    tutorAbortRef.current?.abort();
    tutorAbortRef.current = controller;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 65_000);
    try {
      const response = await fetch(apiUrl("/learning/tutor"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateToken, scope, question }),
        credentials: "include",
        signal: controller.signal,
      });
      await readSseResponse(response, (event, data) => {
        if (event === "delta") onDelta(String((data as { text?: string }).text ?? ""));
      });
    } catch (error) {
      if (timedOut) throw new Error("追问等待超时，原问题已保留，可以直接重试。");
      throw error;
    } finally {
      window.clearTimeout(timeout);
      if (tutorAbortRef.current === controller) tutorAbortRef.current = null;
    }
  };

  const cancelTutor = () => {
    tutorAbortRef.current?.abort();
    tutorAbortRef.current = null;
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
    tutorAbortRef.current?.abort();
    tutorAbortRef.current = null;
    sessionStorage.removeItem(SESSION_KEY);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSession(null); setStateToken(""); setProblem(null); setCroppedBlob(null); setPreviewUrl(""); setNotice(""); setFocusNodeId(null); setExpandingNodeId(null); setSimilarNodeId(null); setPreparationPhase("recognizing"); setScreen("capture");
  };

  if (!hydrated) return <div className="flex min-h-dvh items-center justify-center text-sm text-stone-500">正在准备学习空间…</div>;
  if (screen === "capture") return <><CaptureStep providers={providers} provider={provider} ready={consentReady && providers.some((item) => item.id === "doubao" && item.available)} onProvider={setProvider} onFile={setCropFile}/>{notice && <FloatingNotice text={notice}/>} {cropFile && <ImageCropper file={cropFile} onConfirm={recognize} onCancel={() => setCropFile(null)}/>}</>;
  if (screen === "preparing") return <><PreparationStep phase={preparationPhase} problem={problem} previewUrl={previewUrl} demo={providers.find((item) => item.id === provider)?.mode === "demo"} label={analysisLabel} events={analysisEvents} busy={busy} onChange={setProblem} onConfirm={analyze} onCancel={() => analysisAbortRef.current?.abort()} onRetake={reset}/>{notice && <FloatingNotice text={notice}/>}</>;
  if (session) return <LearningWorkspace key={session.requestId} session={session} busy={busy} notice={notice} focusNodeId={focusNodeId} expandingNodeId={expandingNodeId} similarNodeId={similarNodeId} onFocusApplied={() => setFocusNodeId(null)} onExpand={expand} onSimilar={replaceSimilarCheck} onVerify={verify} onGenerateTransfer={() => generateTransfer()} onSolution={solution} onTutor={tutor} onTutorCancel={cancelTutor} onShare={share} onReset={reset}/>;
  return null;
}

function FloatingNotice({ text }: { text: string }) { return <div className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl rounded-2xl bg-stone-950 px-4 py-3 text-sm leading-6 text-white shadow-2xl">{text}</div>; }

async function postSse(form: FormData, onEvent: (event: string, data: unknown) => void, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  try {
    await readSseResponse(await fetch(apiUrl("/learning/analyze"), { method: "POST", body: form, signal: controller.signal, credentials: "include" }), onEvent);
  } finally { externalSignal?.removeEventListener("abort", abort); window.clearTimeout(timeout); }
}

async function postJsonSse(url: string, body: Record<string, unknown>, onEvent: (event: string, data: unknown) => void, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  try {
    await readSseResponse(await fetch(apiUrl(url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal, credentials: "include" }), onEvent);
  } finally { externalSignal?.removeEventListener("abort", abort); window.clearTimeout(timeout); }
}

function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  return `${base ?? "/api"}${path}`;
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
  const guideReady = session?.problemGuide && ["goal", "keyClue", "approach", "firstQuestion"].every((key) => typeof session.problemGuide?.[key as keyof typeof session.problemGuide] === "string" && session.problemGuide[key as keyof typeof session.problemGuide].trim());
  return typeof item.stateToken === "string" && item.stateToken.length > 40 && Boolean(session && session.schemaVersion === "1.1" && guideReady && Array.isArray(session.nodes) && Array.isArray(session.edges) && typeof session.rootNodeId === "string" && session.nodes.some((node) => node?.id === session.rootNodeId));
}

function isProviderId(value: unknown): value is ProviderId {
  return value === "doubao" || value === "openai" || value === "xai";
}

function messageOf(error: unknown) { return error instanceof Error ? error.message : "操作失败，请重试"; }
function analysisMessageOf(error: unknown) {
  const message = messageOf(error);
  return message.includes("知识关系没有通过可靠性检查") ? "AI 返回的知识关系不够可靠，请再次点击“开始学习”重试。" : message;
}
function isAbortError(error: unknown) { return error instanceof DOMException && error.name === "AbortError"; }
