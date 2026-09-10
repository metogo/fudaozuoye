"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { readSseResponse } from "@/lib/learning/client-sse";
import { isOptionalPracticeTurn, turnIdleTimeout } from "@/lib/learning/turn-recovery";
import { restoreChatRetry, type StoredChatRetry } from "@/lib/learning/chat-retry";
import { BOARD_UI_ENABLED } from "@/lib/learning/ui-features";
import { createTextBatcher } from "@/lib/learning/text-batcher";
import { createDeferredTask } from "@/lib/learning/deferred-task";
import { boardContextFromChat } from "@/lib/learning/board-context";
import {
  BOARD_CACHE_VERSION,
  isStoredBoardCache,
  isStoredBoardLesson,
  type StoredBoardCache,
} from "@/lib/learning/board-cache-schema";
import {
  compileBoardDocument,
  createBoardWorkspaceState,
  isStoredBoardWorkspaceState,
  restoreBoardWorkspaceState,
} from "@/lib/learning/board-workspace";
import { finalizeLearningMarkdown } from "@/lib/learning/presentation";
import type {
  BoardDocument,
  BoardExperience,
  BoardLesson,
  BoardWorkspaceState,
  ChatMessage,
  ClientSessionState,
  IllustrationAvailability,
  IllustrationFrame,
  IllustrationLesson,
  LearningChoice,
  LearningGate,
  LearningSession,
  LearningTurnInput,
  ProblemSnapshot,
  ReasoningAvailability,
  ReasoningLevel,
  SuggestedQuestion,
} from "@/lib/learning/types";
import {
  needsVisualReview,
  requiresProblemImage,
} from "@/lib/learning/problem-evidence";
import { illustrationFingerprint } from "@/lib/learning/illustration-fingerprint";
import { BoardErrorBoundary } from "./board-error-boundary";
import { LearningChat } from "./learning-chat";
import { useQuestionEntryReporting } from "./use-question-entry-reporting";
import { STREAMING_FINISH_MS } from "./streaming-indicator";
const ImageCropper = dynamic(() => import("./image-cropper").then((module) => module.ImageCropper), { ssr: false });
const WhiteboardInput = dynamic(() => import("./whiteboard-input").then((module) => module.WhiteboardInput), { ssr: false });
const LearningIllustration = dynamic(() => import("./learning-illustration").then((module) => module.LearningIllustration), { ssr: false });

const SESSION_KEY = "education-chat-session-v3";
const LearningBoard = dynamic(
  () => import("./learning-board").then((module) => module.LearningBoard),
  { ssr: false },
);
const fallbackReasoningLevels: ReasoningAvailability[] = [
  { id: "light", label: "轻度", available: false },
  { id: "medium", label: "中", available: false },
  { id: "high", label: "高", available: false },
];
const fallbackIllustration: IllustrationAvailability = {
  available: false,
  reason: "插画能力状态正在读取",
};

interface StoredChatState extends ClientSessionState {
  pendingRetry?: StoredChatRetry;
  reasoningLevel?: ReasoningLevel;
  messages: ChatMessage[];
  boardCache?: StoredBoardCache;
  boardWorkspace?: BoardWorkspaceState;
}

export function EducationChatApp() {
  const [storageWriter] = useState(() => createDeferredTask());
  useEffect(() => {
    const flush = () => storageWriter.flush();
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => { flush(); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hidden); };
  }, [storageWriter]);
  const [hydrated, setHydrated] = useState(false);
  const [reasoningLevels, setReasoningLevels] = useState(
    fallbackReasoningLevels,
  );
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>("light");
  const [illustrationAvailability, setIllustrationAvailability] =
    useState<IllustrationAvailability>(fallbackIllustration);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<LearningSession | null>(null);
  const [stateToken, setStateToken] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // A new problem owns a fresh set of transient chat UI state (scroll hints,
  // quote selection, draft input and export dialog), not only fresh messages.
  const [chatUiEpoch, setChatUiEpoch] = useState(0);
  const recordQuestionEntry = useQuestionEntryReporting(ready, chatUiEpoch);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [responseCrop, setResponseCrop] = useState<{
    file: File;
    intent: "answer" | "question";
  } | null>(null);
  const [whiteboardIntent, setWhiteboardIntent] = useState<
    "answer" | "question" | null
  >(null);
  const [reviewProblem, setReviewProblem] = useState<ProblemSnapshot | null>(
    null,
  );
  const [boardExperience, setBoardExperience] =
    useState<BoardExperience | null>(null);
  const [cachedBoardLesson, setCachedBoardLesson] =
    useState<BoardLesson | null>(null);
  const [boardDocument, setBoardDocument] = useState<BoardDocument | null>(
    null,
  );
  const [boardWorkspaceState, setBoardWorkspaceState] =
    useState<BoardWorkspaceState | null>(null);
  const [pendingBoardCache, setPendingBoardCache] =
    useState<StoredBoardCache | null>(null);
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [illustrationLesson, setIllustrationLesson] =
    useState<IllustrationLesson | null>(null);
  const illustrationLessonRef = useRef<IllustrationLesson | null>(null);
  const [illustrationFrames, setIllustrationFrames] = useState<
    IllustrationFrame[]
  >([]);
  const [illustrationExpectedCount, setIllustrationExpectedCount] = useState(0);
  const [illustrationOpen, setIllustrationOpen] = useState(false);
  const [illustrationError, setIllustrationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [retryLabel, setRetryLabel] = useState("");
  const [retryMessageId, setRetryMessageId] = useState<string | null>(null);
  const [pendingRetry, setPendingRetry] = useState<StoredChatRetry | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelReasonRef = useRef<"board-close" | "illustration-close" | null>(
    null,
  );
  const retryRef = useRef<null | (() => Promise<void>)>(null);
  const restoredRetryRef = useRef<StoredChatRetry | null>(null);
  const emphasisRequestsRef = useRef(new Set<AbortController>());
  const previewUrlsRef = useRef<string[]>([]);
  const pendingImageMessageIdRef = useRef<string | null>(null);
  const messageFinishTimersRef = useRef<Map<string, number>>(new Map());
  const boardRestoreRequestIdRef = useRef("");
  const boardRestoreEpochRef = useRef(0);

  useEffect(() => {
    let active = true;
    const messageFinishTimers = messageFinishTimersRef.current;
    const emphasisRequests = emphasisRequestsRef.current;
    const hydrationTimer = window.setTimeout(() => {
      if (!active) return;
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
          const restored = JSON.parse(raw) as unknown;
          if (isStoredChatState(restored)) {
            setSession(restored.session);
            setStateToken(restored.stateToken);
            setReasoningLevel(
              restored.reasoningLevel ??
                restored.session.reasoningLevel ??
                "light",
            );
            setMessages(
              restored.messages.map((message) => ({
                ...message,
                status:
                  message.status === "streaming"
                    ? "error"
                    : message.status === "finishing"
                      ? "complete"
                      : message.status,
              })),
            );
            setCachedBoardLesson(null);
            const recoveredRetry = restoreChatRetry(restored.pendingRetry, restored, restored.messages);
            if (recoveredRetry) {
              setPendingRetry(recoveredRetry);
              restoredRetryRef.current = recoveredRetry;
              setRetryLabel("重试这一步");
              setRetryMessageId(recoveredRetry.messageId);
              setNotice("上次请求未完成，可以在消息旁重试。");
            }
            boardRestoreRequestIdRef.current = restored.session.requestId;
            const recoverableBoardCache = boardCacheCandidate(
              restored.boardCache,
              restored.session.requestId,
            );
            if (recoverableBoardCache) {
              const expectedRequestId = restored.session.requestId;
              const expectedEpoch = ++boardRestoreEpochRef.current;
              if (
                isStoredBoardCache(
                  restored.boardCache,
                  restored.session.requestId,
                )
              )
                setPendingBoardCache(restored.boardCache);
              void validateStoredBoardLesson(
                restored.stateToken,
                recoverableBoardCache.lesson,
              ).then(async (result) => {
                if (
                  !active ||
                  boardRestoreRequestIdRef.current !== expectedRequestId ||
                  boardRestoreEpochRef.current !== expectedEpoch
                )
                  return;
                if (result.status === "unavailable") return;
                setPendingBoardCache(null);
                if (result.status === "valid") {
                  try {
                    const { compileBoardExperience, legacyBoardWorkspaceKey } = await import("@/lib/learning/board-experience");
                    if (!active || boardRestoreRequestIdRef.current !== expectedRequestId || boardRestoreEpochRef.current !== expectedEpoch) return;
                    const legacyWorkspaceKey = isStoredBoardLesson(recoverableBoardCache.lesson) ? legacyBoardWorkspaceKey(recoverableBoardCache.lesson) : undefined;
                    const document = compileBoardDocument(
                      compileBoardExperience(result.lesson, {
                        legacyWorkspaceKey,
                      }),
                    );
                    setCachedBoardLesson(result.lesson);
                    setBoardDocument(document);
                    setBoardWorkspaceState(
                      restoreBoardWorkspaceState(
                        document,
                        restored.boardWorkspace,
                      ),
                    );
                  } catch {
                    if (!active || boardRestoreRequestIdRef.current !== expectedRequestId || boardRestoreEpochRef.current !== expectedEpoch) return;
                    setCachedBoardLesson(null);
                    setBoardDocument(null);
                    setBoardWorkspaceState(null);
                    setNotice(
                      "上次板书结构已失效，当前题目仍可继续学习；请重新打开板书生成新版内容。",
                    );
                  }
                } else {
                  setCachedBoardLesson(null);
                  setBoardDocument(null);
                  setBoardWorkspaceState(null);
                }
              });
            }
          } else sessionStorage.removeItem(SESSION_KEY);
        }
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
      setHydrated(true);
    }, 0);
    fetch(apiUrl("/consent"), { method: "POST", credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("服务暂时无法准备");
        const data = (await response.json()) as {
          reasoningLevels?: ReasoningAvailability[];
          illustration?: IllustrationAvailability;
        };
        if (!data.reasoningLevels?.length)
          throw new Error("推理强度状态暂时无法读取");
        if (!active) return;
        setReasoningLevels(data.reasoningLevels);
        setIllustrationAvailability(data.illustration ?? fallbackIllustration);
        const available = data.reasoningLevels.filter((item) => item.available);
        setReady(available.length > 0);
        setReasoningLevel((current) =>
          available.some((item) => item.id === current)
            ? current
            : (available[0]?.id ?? current),
        );
        if (available.length === 0)
          setNotice("AI 服务暂不可用，请稍后刷新重试。");
      })
      .catch((error) => {
        if (active) setNotice(messageOf(error));
      });
    return () => {
      active = false;
      for (const request of emphasisRequests) request.abort();
      emphasisRequests.clear();
      window.clearTimeout(hydrationTimer);
      abortRef.current?.abort();
      for (const timer of messageFinishTimers.values())
        window.clearTimeout(timer);
      messageFinishTimers.clear();
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
      previewUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!session || !stateToken) return;
    storageWriter.schedule(() => {
    const persistable = messages.map((message) => ({
      ...message,
      imageUrl: undefined,
    }));
    const retainedBoardCache =
      pendingBoardCache?.requestId === session.requestId
        ? pendingBoardCache
        : undefined;
    const boardCache = cachedBoardLesson
      ? ({
          version: BOARD_CACHE_VERSION,
          requestId: session.requestId,
          lesson: cachedBoardLesson,
        } satisfies StoredBoardCache)
      : retainedBoardCache;
    const boardWorkspace =
      boardDocument &&
      boardWorkspaceState &&
      isStoredBoardWorkspaceState(boardWorkspaceState, boardDocument)
        ? boardWorkspaceState
        : undefined;
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          session,
          stateToken,
          reasoningLevel,
          messages: persistable,
          ...(pendingRetry ? { pendingRetry } : {}),
          ...(boardCache ? { boardCache } : {}),
          ...(boardWorkspace ? { boardWorkspace } : {}),
        } satisfies StoredChatState),
      );
    } catch {
      queueMicrotask(() =>
        setNotice("当前浏览器无法保存进度；关闭页面后记录会丢失。"),
      );
    }
    });
  }, [
    boardDocument,
    boardWorkspaceState,
    cachedBoardLesson,
    hydrated,
    messages,
    pendingBoardCache,
    pendingRetry,
    reasoningLevel,
    session,
    stateToken,
    storageWriter,
  ]);

  const selectReasoningLevel = (next: ReasoningLevel) => {
    if (session) return;
    const option = reasoningLevels.find((item) => item.id === next);
    if (!option?.available)
      return setNotice(`${reasoningLabel(next)}推理尚未配置`);
    setReasoningLevel(next);
    const message = `推理强度已切换为「${reasoningLabel(next)}」`;
    setNotice(message);
    window.setTimeout(
      () => setNotice((current) => (current === message ? "" : current)),
      2200,
    );
  };

  const beginRequest = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  };

  const finishRequest = (controller: AbortController) => {
    if (abortRef.current === controller) abortRef.current = null;
  };

  const sendText = async (text: string) => {
    if (!session) {
      addMessage(userMessage(text));
      if (messages.length === 0) recordQuestionEntry();
      await recognizeText(text);
      return;
    }
    const gate = session.flow.activeGate;
    addMessage(userMessage(text));
    const understandingChoice =
      gate?.kind === "understanding" ? understandingChoiceFromText(text) : null;
    if (gate && understandingChoice) {
      await performTurn(
        { session, stateToken },
        { type: "choose", gateId: gate.id, choice: understandingChoice, ...(understandingChoice === "try" ? { boardContext: boardContextFromChat(messages.filter((message) => message.kind === "assistant")) } : {}) },
      );
      return;
    }
    if (
      gate &&
      [
        "step_answer",
        "node_answer",
        "solution_recall_answer",
        "original_answer",
        "transfer_answer",
      ].includes(gate.kind)
    ) {
      await performTurn(
        { session, stateToken },
        { type: "answer", gateId: gate.id, answer: text },
      );
      return;
    }
    await performTurn({ session, stateToken }, { type: "question", text });
  };

  const askCurrentQuestion = async (text: string, quote?: string) => {
    if (!session) return;
    addMessage({ ...userMessage(text), ...(quote ? { reference: { scopeLabel: "选中文字", sourceSummary: quote } } : {}) });
    await performTurn({ session, stateToken }, { type: "question", text, ...(quote ? { quote } : {}) });
  };

  const sendImageResponse = async (
    blob: Blob,
    previewUrl: string,
    intent: "answer" | "question",
    source: "whiteboard" | "photo",
  ) => {
    if (!session || busy) return;
    previewUrlsRef.current.push(previewUrl);
    const gate = session.flow.activeGate;
    const answerIntent =
      intent === "answer" &&
      gate &&
      [
        "node_answer",
        "solution_recall_answer",
        "original_answer",
        "transfer_answer",
      ].includes(gate.kind);
    addMessage({
      ...userMessage(
        source === "whiteboard"
          ? answerIntent
            ? "我的白板作答"
            : "我在白板上标出了疑问"
          : answerIntent
            ? "我的拍照作答"
            : "请看我拍下的这一步",
      ),
      imageUrl: previewUrl,
    });
    const input: LearningTurnInput = answerIntent
      ? { type: "image_answer", gateId: gate.id }
      : { type: "image_question" };
    await performTurn({ session, stateToken }, input, "chat", blob);
  };

  const choose = async (gate: LearningGate, choice: LearningChoice) => {
    if (!session || busy) return;
    if (choice === "view_board" && !BOARD_UI_ENABLED) return;
    if (
      choice === "view_illustration" &&
      canReuseIllustration(illustrationLessonRef.current ?? illustrationLesson, session)
    ) {
      setIllustrationLesson(illustrationLessonRef.current ?? illustrationLesson);
      setIllustrationOpen(true);
      return;
    }
    const label =
      choice === "try" ? choiceLabel(choice) :
      gate.options?.find((option) => option.id === choice)?.label ?? choiceLabel(choice);
    addMessage(userMessage(label));
    if (choice === "view_illustration") {
      illustrationLessonRef.current = null;
      setIllustrationLesson(null);
      setIllustrationFrames([]);
      setIllustrationExpectedCount(0);
      setIllustrationError("");
      setIllustrationOpen(true);
    }
    await performTurn(
      { session, stateToken },
      {
        type: "choose",
        gateId: gate.id,
        choice,
        ...(choice === "view_board" || choice === "try"
          ? { boardContext: boardContextFromChat(choice === "try" ? messages.filter((message) => message.kind === "assistant") : messages) }
          : {}),
      },
    );
  };

  const chooseSuggestion = async (suggestion: SuggestedQuestion) => {
    if (
      !session ||
      busy ||
      !session.flow.suggestedQuestions?.some(
        (item) => item.id === suggestion.id,
      )
    )
      return;
    addMessage({
      ...userMessage(suggestion.text),
      reference: {
        scopeLabel: suggestion.scopeLabel,
        sourceSummary: suggestion.sourceSummary,
      },
    });
    await performTurn(
      { session, stateToken },
      { type: "choose_suggestion", suggestionId: suggestion.id },
    );
  };

  const receiveImage = async (blob: Blob, previewUrl: string) => {
    previewUrlsRef.current.push(previewUrl);
    setCropFile(null);
    setPendingImage(blob);
    const pendingId = pendingImageMessageIdRef.current;
    if (pendingId)
      updateMessage(pendingId, (message) => ({
        ...message,
        imageUrl: previewUrl,
        status: "streaming",
        text: "这道题我不会，想把它学懂。",
      }));
    else {
      const message = {
        ...userMessage("这道题我不会，想把它学懂。"),
        imageUrl: previewUrl,
        status: "streaming" as const,
      };
      pendingImageMessageIdRef.current = message.id;
      addMessage(message);
      if (!session && messages.length === 0) recordQuestionEntry();
    }
    await recognizeImage(blob);
  };

  const recognizeText = async (text: string) => {
    clearRetry();
    setBusy(true);
    setNotice("");
    setLoadingLabel("正在读懂你发来的题目");
    const controller = beginRequest();
    try {
      const form = new FormData();
      form.set("stage", "recognize_text");
      form.set("provider", "doubao");
      form.set("reasoningLevel", reasoningLevel);
      form.set("text", text);
      const result: { recognized?: ProblemSnapshot } = {};
      await postFormSse(
        form,
        (event, data) => {
          if (event === "phase") setLoadingLabel(labelOf(data, "正在读题"));
          if (event === "recognized")
            result.recognized = data as ProblemSnapshot;
        },
        controller.signal,
      );
      const recognized = result.recognized;
      if (!recognized) throw new Error("没有识别到完整题目");
      await analyzeProblem(recognized, null);
    } catch (error) {
      setNotice(messageOf(error));
      setRetry("重新识别", () => recognizeText(text));
    } finally {
      const ownsRequest = abortRef.current === controller;
      finishRequest(controller);
      if (ownsRequest) setBusy(false);
    }
  };

  const recognizeImage = async (blob: Blob) => {
    clearRetry();
    const pendingMessageId = pendingImageMessageIdRef.current;
    if (pendingMessageId)
      updateMessage(pendingMessageId, (message) => ({
        ...message,
        status: "streaming",
      }));
    setBusy(true);
    setNotice("");
    setLoadingLabel("正在识别题干与你的作答");
    const controller = beginRequest();
    try {
      const form = new FormData();
      form.set("stage", "recognize");
      form.set("provider", "doubao");
      form.set("reasoningLevel", reasoningLevel);
      form.set(
        "image",
        new File([blob], "homework.jpg", { type: "image/jpeg" }),
      );
      const result: { recognized?: ProblemSnapshot } = {};
      await postFormSse(
        form,
        (event, data) => {
          if (event === "phase") setLoadingLabel(labelOf(data, "正在识别题目"));
          if (event === "recognized")
            result.recognized = data as ProblemSnapshot;
        },
        controller.signal,
      );
      const recognized = result.recognized;
      if (!recognized) throw new Error("没有识别到完整题目");
      finishPendingImageMessage("complete");
      if (needsVisualReview(recognized)) {
        setReviewProblem(recognized);
        setLoadingLabel("");
        return;
      }
      setReviewProblem(null);
      await analyzeProblem(recognized, blob);
    } catch (error) {
      finishPendingImageMessage("error");
      setNotice(`${messageOf(error)}。可以重试，或用下方相机/相册换一张。`);
      setRetry("重新识别", () => recognizeImage(blob));
    } finally {
      const ownsRequest = abortRef.current === controller;
      finishRequest(controller);
      if (ownsRequest) setBusy(false);
    }
  };

  const confirmProblem = async (problem: ProblemSnapshot) => {
    setReviewProblem(null);
    addMessage({ ...userMessage("我已确认识别结果。"), text: problem.text });
    await analyzeProblem(problem, pendingImage);
  };

  const analyzeProblem = async (
    problem: ProblemSnapshot,
    image: Blob | null,
  ) => {
    clearRetry();
    setBusy(true);
    setNotice("");
    setLoadingLabel("正在找到最适合的讲解起点");
    const controller = beginRequest();
    try {
      const form = new FormData();
      form.set("stage", "full");
      form.set("provider", "doubao");
      form.set("reasoningLevel", reasoningLevel);
      form.set("problem", JSON.stringify(problem));
      const result: { next?: ClientSessionState } = {};
      await postFormSse(
        form,
        (event, data) => {
          if (event === "phase") setLoadingLabel(labelOf(data, "正在准备讲解"));
          if (event === "graph") result.next = data as ClientSessionState;
        },
        controller.signal,
      );
      const next = result.next;
      if (!next) throw new Error("AI 没有返回可用的学习路径");
      boardRestoreRequestIdRef.current = next.session.requestId;
      boardRestoreEpochRef.current += 1;
      setPendingBoardCache(null);
      setCachedBoardLesson(null);
      setBoardDocument(null);
      setBoardWorkspaceState(null);
      setSession(next.session);
      setStateToken(next.stateToken);
      setPendingImage(null);
      addMessage(milestoneMessage("题目已经读懂，先从核心思路开始"));
      await performTurn(
        next,
        { type: "start" },
        "chat",
        requiresProblemImage(problem) ? (image ?? undefined) : undefined,
      );
    } catch (error) {
      const message = messageOf(error);
      const needsNewPhoto = /重新拍摄|重新提交原题照片|关键条件仍不清楚/.test(
        message,
      );
      setNotice(
        needsNewPhoto
          ? `${message}。请用下方相机或相册换一张更完整、清晰的照片。`
          : message,
      );
      if (!needsNewPhoto)
        setRetry("重新分析", () => analyzeProblem(problem, image));
    } finally {
      const ownsRequest = abortRef.current === controller;
      finishRequest(controller);
      if (ownsRequest) setBusy(false);
    }
  };

  const performTurn = async (
    current: ClientSessionState,
    input: LearningTurnInput,
    surface: "chat" | "board" = "chat",
    image?: Blob,
  ) => {
    clearRetry();
    setBusy(true);
    setNotice("");
    setLoadingLabel(turnLoadingLabel(input));
    const controller = new AbortController();
    abortRef.current?.abort();
    cancelReasonRef.current = null;
    abortRef.current = controller;
    let streamId: string | null = null;
    let streamSource = "";
    const rememberRetry = () => {
      if (surface === "chat" && !image && !isOptionalPracticeTurn(input))
        setPendingRetry({ version: 1, requestId: current.session.requestId, stateToken: current.stateToken, messageId: streamId, input });
    };
    rememberRetry();
    const textBatch = createTextBatcher((text) => {
      if (streamId) updateMessage(streamId, (message) => ({ ...message, text: message.text + text }));
    });
    let receivedState = false;
    const timeoutDuration = turnIdleTimeout(input);
    let timeout = window.setTimeout(() => controller.abort(), timeoutDuration);
    const keepAlive = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => controller.abort(), timeoutDuration);
    };
    try {
      const multipart = Boolean(image);
      const form = multipart ? new FormData() : null;
      if (form && image) {
        form.set("stateToken", current.stateToken);
        form.set("input", JSON.stringify(input));
        form.set(
          "image",
          new File([image], "student-response.png", {
            type: image.type || "image/png",
          }),
        );
      }
      const response = await fetch(apiUrl("/learning/turn"), {
        method: "POST",
        ...(multipart
          ? {}
          : { headers: { "Content-Type": "application/json" } }),
        body: form ?? JSON.stringify({ stateToken: current.stateToken, input }),
        credentials: "include",
        signal: controller.signal,
      });
      await readSseResponse(response, async (event, data) => {
        // A ready turn can still be producing optional suggestions when the user
        // starts the next action. Late events must not replace its new task.
        if (abortRef.current !== controller || controller.signal.aborted) return;
        keepAlive();
        if (event !== "message.delta") textBatch.flush();
        if (event === "message.delta") {
          const text = String((data as { text?: string }).text ?? "");
          if (!text) return;
          streamSource += text;
          if (!streamId) {
            streamId = id("assistant");
            rememberRetry();
            const scopeLabel =
              input.type === "choose" && input.choice === "full_solution"
                ? "原题完整讲解"
                : undefined;
            addMessage({
              id: streamId,
              role: "assistant",
              kind: "assistant",
              text,
              status: "streaming",
              surface,
              scopeLabel,
              createdAt: new Date().toISOString(),
            });
          } else {
            textBatch.push(text);
          }
          return;
        }
        if (event === "message.reset") {
          if (streamId) cancelMessageFinish(streamId);
          if (streamId)
            updateMessage(streamId, (message) => ({
              ...message,
              text: "",
              emphasis: undefined,
              status: "streaming",
            }));
          setLoadingLabel(
            String(
              (data as { reason?: string }).reason ?? "正在重新整理完整讲解",
            ),
          );
          streamSource = "";
        }
        if (event === "message.complete" && streamId) {
          finishStreamMessage(
            streamId,
            String((data as { scopeLabel?: string }).scopeLabel ?? "") ||
              undefined,
          );
          if (surface === "chat" && streamSource.length >= 30 && streamSource.length <= 16000) {
            const messageId = streamId, source = finalizeLearningMarkdown(streamSource);
            const emphasisController = new AbortController();
            const requests = emphasisRequestsRef.current;
            if (requests.size >= 2) { const oldest = requests.values().next().value; oldest?.abort(); requests.delete(oldest!); }
            requests.add(emphasisController);
            void fetch(apiUrl("/learning/emphasis"), {
              method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ stateToken: current.stateToken, source, context: JSON.stringify({ operation: input, scopeLabel: (data as { scopeLabel?: string }).scopeLabel }) }),
              signal: AbortSignal.any([emphasisController.signal, AbortSignal.timeout(22000)]),
            }).then(async (response) => {
              if (!response.ok) return;
              const result = await response.json() as { marks?: ChatMessage["emphasis"] };
              if (emphasisController.signal.aborted || boardRestoreRequestIdRef.current !== current.session.requestId || !Array.isArray(result.marks)) return;
              updateMessage(messageId, (message) => message.text === source && (message.status === "complete" || message.status === "finishing") ? { ...message, emphasis: result.marks!.slice(0, 3) } : message);
            }).catch(() => { /* Optional decoration never interrupts learning or creates a retry gate. */ })
              .finally(() => requests.delete(emphasisController));
          }
        }
        if (event === "flow.suggestions" && streamId) {
          const suggestions = (data as { suggestions?: SuggestedQuestion[] })
            .suggestions;
          if (Array.isArray(suggestions) && suggestions.length)
            updateMessage(streamId, (message) => ({ ...message, suggestions }));
        }
        if (event === "flow.milestone")
          addMessage(
            milestoneMessage(
              String((data as { label?: string }).label ?? "继续学习"),
              surface,
            ),
          );
        if (event === "flow.resume")
          addMessage(
            milestoneMessage(
              String(
                (data as { label?: string }).label ?? "回到刚才的学习任务",
              ),
              surface,
            ),
          );
        if (event === "flow.progress")
          setLoadingLabel(labelOf(data, "正在补基础"));
        if (event === "illustration.progress") {
          const progress = data as { requestId?: string; label?: string };
          if (
            progress.requestId === current.session.requestId &&
            boardRestoreRequestIdRef.current === current.session.requestId
          ) {
            setIllustrationError("");
            setLoadingLabel(progress.label ?? "正在生成插画");
          }
        }
        if (event === "illustration.frame") {
          const result = data as {
            requestId?: string;
            frameCount?: number;
            frame?: IllustrationFrame;
          };
          if (
            result.requestId !== current.session.requestId ||
            boardRestoreRequestIdRef.current !== current.session.requestId ||
            !result.frame ||
            !Number.isInteger(result.frameCount)
          )
            return;
          setIllustrationExpectedCount(Number(result.frameCount));
          setIllustrationFrames((existing) =>
            existing.some((frame) => frame.id === result.frame?.id)
              ? existing
              : existing.concat(result.frame as IllustrationFrame).sort((left, right) => left.index - right.index),
          );
        }
        if (event === "illustration.complete") {
          const lesson = data as IllustrationLesson;
          if (
            lesson.requestId !== current.session.requestId ||
            boardRestoreRequestIdRef.current !== current.session.requestId ||
            lesson.frameCount !== lesson.frames?.length
          )
            return;
          setIllustrationLesson(lesson);
          illustrationLessonRef.current = lesson;
          setIllustrationFrames(lesson.frames);
          setIllustrationExpectedCount(lesson.frameCount);
          setIllustrationError("");
          setIllustrationOpen(true);
        }
        if (event === "flow.branch_error") {
          const message = String(
            (data as { message?: string }).message ??
              "这一步暂时没有完成，当前学习位置已保留",
          );
          setNotice(message);
          addMessage({
            id: id("branch-error"),
            role: "system",
            kind: "result",
            text: `暂时没完成：${message}`,
            createdAt: new Date().toISOString(),
          });
        }
        if (event === "presentation.unavailable")
          addMessage(
            milestoneMessage(
              String(
                (data as { message?: string }).message ??
                  "板书暂时不可用，已回到当前学习任务",
              ),
              surface,
            ),
          );
        if (event === "path.updated")
          upsertPath((data as { labels?: string[] }).labels ?? []);
        if (event === "answer.result") {
          const result = data as { passed?: boolean; assisted?: boolean; text?: string };
          addMessage({
            id: id("result"),
            role: "system",
            kind: "result",
            text: `${result.passed ? (result.assisted ? "已对照答案：" : "✓") : "再看一步："} ${String(result.text ?? "")}`.trim(),
            createdAt: new Date().toISOString(),
          });
        }
        if (event === "input.transcribed") {
          const result = data as { text?: string; needsConfirmation?: boolean };
          const text = String(result.text ?? "").trim();
          if (text)
            addMessage({
              id: id("transcription"),
              role: "system",
              kind: "result",
              text: result.needsConfirmation
                ? `请核对 AI 读到的作答：${text}\n\n识别把握不足，请在下方修改后再发送。`
                : `AI 读到的作答：${text}`,
              createdAt: new Date().toISOString(),
            });
        }
        if (event === "board.lesson") {
          if (!BOARD_UI_ENABLED) return;
          const { enrichBoardLessonWithSafeAids } = await import("@/lib/learning/board-aids");
          const { compileBoardExperience } = await import("@/lib/learning/board-experience");
          if (abortRef.current !== controller || controller.signal.aborted) return;
          const lesson = enrichBoardLessonWithSafeAids(
            current.session,
            data as BoardLesson,
          );
          const experience = compileBoardExperience(lesson);
          const document = compileBoardDocument(experience);
          boardRestoreEpochRef.current += 1;
          setPendingBoardCache(null);
          setCachedBoardLesson(lesson);
          setBoardDocument(document);
          setBoardWorkspaceState(createBoardWorkspaceState(document));
          setBoardExperience(experience);
        }
        if (event === "flow.update") {
          const next = data as ClientSessionState;
          if (boardRestoreRequestIdRef.current !== next.session.requestId) {
            boardRestoreEpochRef.current += 1;
            setPendingBoardCache(null);
            setCachedBoardLesson(null);
            setBoardDocument(null);
            setBoardWorkspaceState(null);
            if (!canReuseIllustration(illustrationLessonRef.current, next.session)) {
              illustrationLessonRef.current = null;
              setIllustrationLesson(null);
              setIllustrationFrames([]);
              setIllustrationExpectedCount(0);
              setIllustrationError("");
              setIllustrationOpen(false);
            }
          }
          boardRestoreRequestIdRef.current = next.session.requestId;
          setSession(next.session);
          setStateToken(next.stateToken);
          receivedState = true;
          setPendingRetry(null);
        }
        if (event === "flow.ready") {
          setBusy(false);
          setLoadingLabel("");
        }
      });
      if (!receivedState)
        throw new Error("学习状态没有完整返回，请重试当前操作");
    } catch (error) {
      const superseded = isAbortError(error) && abortRef.current !== controller;
      if (superseded) return;
      textBatch.flush();
      const closedBoard =
        isAbortError(error) && cancelReasonRef.current === "board-close";
      if (closedBoard) {
        if (streamId)
          setMessages((currentMessages) =>
            currentMessages.filter(
              (message) =>
                message.id !== streamId ||
                message.status === "complete" ||
                message.status === "finishing",
            ),
          );
        return;
      }
      if (
        isAbortError(error) &&
        cancelReasonRef.current === "illustration-close"
      )
        return;
      if (input.type === "choose" && input.choice === "view_illustration") {
        setIllustrationError(
          isAbortError(error)
            ? "插画生成等待超时，当前学习任务未改变。"
            : messageOf(error),
        );
        return;
      }
      if (isOptionalPracticeTurn(input)) {
        setNotice("同类练习暂时没有生成成功，当前学习进度已保留。可以继续提问、选择其他操作，或再次点击生成练习。");
        // This branch does not advance the required learning task. Its existing
        // action is the retry entry; do not lock the composer behind a retry.
        return;
      }
      if (streamId)
        updateMessage(streamId, (message) =>
          message.status === "complete" || message.status === "finishing"
            ? message
            : { ...message, status: "error" },
        );
      setNotice(
        isAbortError(error)
          ? "等待超时，当前学习任务已保留，可以直接重试。"
          : messageOf(error),
      );
      if (!receivedState)
        setRetry("重试这一步", () =>
          performTurn(current, input, surface, image),
          streamId,
        );
    } finally {
      if (abortRef.current === controller) textBatch.flush();
      textBatch.discard();
      window.clearTimeout(timeout);
      if (abortRef.current === controller) {
        abortRef.current = null;
        cancelReasonRef.current = null;
        setBusy(false);
        setLoadingLabel("");
      }
    }
  };

  const requestTransfer = async () => {
    if (!session) return;
    addMessage(userMessage("再练一道同知识点题"));
    await performTurn({ session, stateToken }, { type: "request_transfer" });
  };

  const retryOriginal = async () => {
    if (!session) return;
    addMessage(userMessage("遮住讲解，重做原题"));
    await performTurn({ session, stateToken }, { type: "retry_original" });
  };

  const reset = () => {
    setChatUiEpoch((epoch) => epoch + 1);
    for (const request of emphasisRequestsRef.current) request.abort();
    emphasisRequestsRef.current.clear();
    storageWriter.cancel();
    abortRef.current?.abort();
    abortRef.current = null;
    for (const timer of messageFinishTimersRef.current.values())
      window.clearTimeout(timer);
    messageFinishTimersRef.current.clear();
    pendingImageMessageIdRef.current = null;
    boardRestoreRequestIdRef.current = "";
    boardRestoreEpochRef.current += 1;
    sessionStorage.removeItem(SESSION_KEY);
    revokePreviews();
    setSession(null);
    setStateToken("");
    setMessages([]);
    setReviewProblem(null);
    setBoardExperience(null);
    setCachedBoardLesson(null);
    setBoardDocument(null);
    setBoardWorkspaceState(null);
    setPendingBoardCache(null);
    setPendingImage(null);
    setCropFile(null);
    setResponseCrop(null);
    setWhiteboardIntent(null);
    setIllustrationLesson(null);
    illustrationLessonRef.current = null;
    setIllustrationFrames([]);
    setIllustrationExpectedCount(0);
    setIllustrationOpen(false);
    setIllustrationError("");
    setBusy(false);
    setLoadingLabel("");
    setNotice("");
    clearRetry();
  };

  const retry = async () => {
    if (busy) return;
    const action = retryRef.current;
    const recovered = restoredRetryRef.current;
    if (!action && (!recovered || !session || recovered.requestId !== session.requestId || recovered.stateToken !== stateToken)) return;
    clearRetry();
    if (action) await action();
    else if (recovered && session) await performTurn({ session, stateToken }, recovered.input);
  };

  const setRetry = (label: string, action: () => Promise<void>, messageId: string | null = null) => {
    retryRef.current = action;
    setRetryLabel(label);
    setRetryMessageId(messageId);
  };
  const clearRetry = () => {
    retryRef.current = null;
    restoredRetryRef.current = null;
    setRetryLabel("");
    setRetryMessageId(null);
    setPendingRetry(null);
  };

  const askOnBoard = async (text: string) => {
    if (!session || busy) return;
    addMessage({ ...userMessage(text), surface: "board" });
    await performTurn(
      { session, stateToken },
      { type: "question", text },
      "board",
    );
  };

  const regenerateBoard = async () => {
    const gate = session?.flow.activeGate;
    if (!session || !gate || busy) return;
    addMessage({ ...userMessage("重新生成完整板书"), surface: "board" });
    await performTurn(
      { session, stateToken },
      {
        type: "choose",
        gateId: gate.id,
        choice: "view_board",
        boardContext: boardContextFromChat(messages),
      },
      "board",
    );
  };

  const reopenBoard = async () => {
    if (!cachedBoardLesson) return;
    const epoch = boardRestoreEpochRef.current;
    try {
    const { compileBoardExperience } = await import("@/lib/learning/board-experience");
    if (boardRestoreEpochRef.current !== epoch) return;
    const experience = compileBoardExperience(cachedBoardLesson);
    const document = boardDocument ?? compileBoardDocument(experience);
    setBoardDocument(document);
    setBoardWorkspaceState((current) =>
      restoreBoardWorkspaceState(document, current),
    );
    setBoardExperience(experience);
    } catch {
      if (boardRestoreEpochRef.current === epoch) setNotice("板书暂时无法打开，请稍后重试。");
    }
  };

  const updateBoardWorkspace = (next: BoardWorkspaceState) => {
    if (!boardDocument || !isStoredBoardWorkspaceState(next, boardDocument)) {
      setNotice("主动回忆状态异常，已保留当前板书内容。");
      return;
    }
    setBoardWorkspaceState(next);
  };

  const closeBoard = () => {
    if (busy) {
      cancelReasonRef.current = "board-close";
      abortRef.current?.abort();
    }
    setBoardExperience(null);
    const milestone = milestoneMessage("板书讲解收起，回到刚才的学习任务");
    setMessages((current) =>
      current
        .map((message) =>
          message.surface === "board"
            ? { ...message, surface: "chat" as const }
            : message,
        )
        .concat(milestone),
    );
  };

  const regenerateIllustration = async () => {
    const gate = session?.flow.activeGate;
    if (
      !session ||
      !gate ||
      busy ||
      !gate.options?.some((option) => option.id === "view_illustration")
    )
      return;
    setIllustrationLesson(null);
    illustrationLessonRef.current = null;
    setIllustrationFrames([]);
    setIllustrationExpectedCount(0);
    setIllustrationError("");
    setIllustrationOpen(true);
    addMessage(userMessage("重新生成插画演示"));
    await performTurn(
      { session, stateToken },
      { type: "choose", gateId: gate.id, choice: "view_illustration" },
    );
  };

  const closeIllustration = () => {
    if (busy && illustrationLesson) return;
    if (busy) {
      cancelReasonRef.current = "illustration-close";
      abortRef.current?.abort();
    }
    setIllustrationOpen(false);
    const gate = session?.flow.activeGate;
    if (
      !busy &&
      illustrationLesson?.receipt &&
      session &&
      gate &&
      !session.flow.viewedSolution
    ) {
      void performTurn(
        { session, stateToken },
        {
          type: "acknowledge_illustration",
          gateId: gate.id,
          receipt: illustrationLesson.receipt,
        },
      );
    }
  };

  const addMessage = (message: ChatMessage) =>
    setMessages((current) => current.concat(message));
  const updateMessage = (
    messageId: string,
    update: (message: ChatMessage) => ChatMessage,
  ) =>
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === messageId);
      if (index < 0) return current;
      const message = current[index];
      const nextMessage = update(message);
      if (nextMessage === message) return current;
      const next = current.slice();
      next[index] = nextMessage;
      return next;
    });
  const cancelMessageFinish = (messageId: string) => {
    const timer = messageFinishTimersRef.current.get(messageId);
    if (timer !== undefined) window.clearTimeout(timer);
    messageFinishTimersRef.current.delete(messageId);
  };
  const finishStreamMessage = (messageId: string, scopeLabel?: string) => {
    cancelMessageFinish(messageId);
    updateMessage(messageId, (message) => ({
      ...message,
      text: finalizeLearningMarkdown(message.text),
      status: "finishing",
      scopeLabel,
    }));
    const timer = window.setTimeout(() => {
      updateMessage(messageId, (message) => ({
        ...message,
        status: "complete",
      }));
      messageFinishTimersRef.current.delete(messageId);
    }, STREAMING_FINISH_MS);
    messageFinishTimersRef.current.set(messageId, timer);
  };
  const finishPendingImageMessage = (status: "complete" | "error") => {
    const messageId = pendingImageMessageIdRef.current;
    if (!messageId) return;
    updateMessage(messageId, (message) => ({ ...message, status }));
    if (status === "complete") pendingImageMessageIdRef.current = null;
  };
  const upsertPath = (labels: string[]) => {
    if (!labels.length) return;
    const path: ChatMessage = {
      id: "active-learning-path",
      role: "system",
      kind: "path",
      text: ["原题步骤", ...labels].join(" → "),
      createdAt: new Date().toISOString(),
    };
    setMessages((current) =>
      current.some((message) => message.id === path.id)
        ? current.map((message) => (message.id === path.id ? path : message))
        : current.concat(path),
    );
  };
  const revokePreviews = () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current = [];
  };

  const initialWhiteboard = !session && whiteboardIntent === "question";
  return (
    <>
      <LearningChat
        key={chatUiEpoch}
        messages={messages}
        session={session}
        stateToken={stateToken}
        reasoningLevels={reasoningLevels}
        reasoningLevel={reasoningLevel}
        illustrationAvailability={illustrationAvailability}
        ready={hydrated && ready}
        homeMotionPaused={!hydrated || Boolean(cropFile || responseCrop || whiteboardIntent)}
        busy={busy}
        loadingLabel={loadingLabel}
        notice={notice}
        retryLabel={retryLabel}
        retryMessageId={retryMessageId}
        reviewProblem={reviewProblem}
        onReasoningLevel={selectReasoningLevel}
        onFile={(file) => {
          setNotice("");
          clearRetry();
          setCropFile(file);
        }}
        onResponsePhoto={(file, intent) => {
          setNotice("");
          clearRetry();
          setResponseCrop({ file, intent });
        }}
        onWhiteboard={setWhiteboardIntent}
        onTranscribeStep={async (gateId, blob, signal) => {
          if (!session || session.flow.activeGate?.id !== gateId) throw new Error("当前步骤已变化，请重新填写");
          const form = new FormData();
          form.set("stateToken", stateToken);
          form.set("input", JSON.stringify({ type: "transcribe_step", gateId }));
          form.set("image", new File([blob], "step-answer.png", { type: blob.type || "image/png" }));
          let result: { text: string; confidence: number } | undefined;
          await readSseResponse(await fetch(apiUrl("/learning/turn"), { method: "POST", body: form, credentials: "include", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) }), (event, data) => {
            if (event === "input.transcribed") result = data as { text: string; confidence: number };
          });
          if (!result) throw new Error("没有识别清楚，请重试；手写内容仍保留");
          return result;
        }}
        onSend={sendText}
        onQuestion={askCurrentQuestion}
        onChoice={choose}
        onSuggestion={chooseSuggestion}
        onConfirmProblem={confirmProblem}
        onRetryOriginal={retryOriginal}
        onRequestTransfer={requestTransfer}
        onReopenBoard={cachedBoardLesson ? reopenBoard : undefined}
        onNewProblem={reset}
        onRetry={retry}
      />
      {cropFile && (
        <ImageCropper
          file={cropFile}
          onConfirm={receiveImage}
          onCancel={() => setCropFile(null)}
        />
      )}{" "}
      {responseCrop && (
        <ImageCropper
          file={responseCrop.file}
          title={
            responseCrop.intent === "answer"
              ? "只保留你的作答"
              : "只保留想问的位置"
          }
          hint="拖动框移动，拖四角精确调整"
          confirmLabel={
            responseCrop.intent === "answer" ? "使用这份作答" : "发送这张图片"
          }
          onConfirm={(blob, previewUrl) => {
            const intent = responseCrop.intent;
            setResponseCrop(null);
            void sendImageResponse(blob, previewUrl, intent, "photo");
          }}
          onCancel={() => setResponseCrop(null)}
        />
      )}{" "}
      {whiteboardIntent && (
        <WhiteboardInput
          title={initialWhiteboard ? "白板写题" : "白板作答"}
          taskLabel={
            initialWhiteboard
              ? "写下题目、公式或画出图形"
              : (session?.flow.activeGate?.title ??
                "围绕当前题目写下步骤或画出疑问")
          }
          submitLabel={
            initialWhiteboard
              ? "识别这道题"
              : whiteboardIntent === "answer"
                ? "提交作答"
                : "发送提问"
          }
          hint={
            initialWhiteboard
              ? "写题目、公式或画图都可以，AI 会先识别再开始讲解"
              : undefined
          }
          onConfirm={(blob, previewUrl) => {
            const intent = whiteboardIntent;
            setWhiteboardIntent(null);
            if (!session) void receiveImage(blob, previewUrl);
            else void sendImageResponse(blob, previewUrl, intent, "whiteboard");
          }}
          onCancel={() => setWhiteboardIntent(null)}
        />
      )}{" "}
      {BOARD_UI_ENABLED && boardExperience && boardDocument && boardWorkspaceState && (
        <BoardErrorBoundary onClose={closeBoard}>
          <LearningBoard
            experience={boardExperience}
            document={boardDocument}
            workspaceState={boardWorkspaceState}
            onWorkspaceChange={updateBoardWorkspace}
            messages={messages.filter((message) => message.surface === "board")}
            sourceMessages={sourceMessagesForBoard(boardExperience, messages)}
            busy={busy}
            loadingLabel={loadingLabel}
            notice={notice}
            retryLabel={retryLabel}
            onAsk={askOnBoard}
            onRegenerate={regenerateBoard}
            onClose={closeBoard}
            onRetry={retry}
          />
        </BoardErrorBoundary>
      )}{" "}
      {illustrationOpen && (
        <LearningIllustration
          key={illustrationLesson?.frames[0]?.imageUrl ?? illustrationFrames[0]?.imageUrl ?? "illustration-generating"}
          lesson={illustrationLesson}
          frames={illustrationFrames}
          expectedCount={illustrationExpectedCount}
          busy={busy}
          loadingLabel={loadingLabel}
          error={illustrationError}
          canClose={!busy || !illustrationLesson}
          onClose={closeIllustration}
          onRegenerate={regenerateIllustration}
        />
      )}
    </>
  );
}

export function understandingChoiceFromText(
  text: string,
): "continue" | "try" | "not_understood" | null {
  const normalized = text.trim().replace(/[，。！？!?、\s]/g, "");
  if (
    ["懂了", "我懂了", "听懂了", "明白了", "理解了", "会了", "继续"].includes(
      normalized,
    )
  )
    return "continue";
  if (["这一步我来做", "我来试试", "让我试试", "试试"].includes(normalized)) return "try";
  if (
    [
      "没懂",
      "我没懂",
      "没听懂",
      "不懂",
      "不明白",
      "不理解",
      "不知道",
      "不会",
      "还是不懂",
      "这一步没懂",
    ].includes(normalized)
  )
    return "not_understood";
  return null;
}

async function postFormSse(
  form: FormData,
  onEvent: (event: string, data: unknown) => void,
  externalSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  try {
    await readSseResponse(
      await fetch(apiUrl("/learning/analyze"), {
        method: "POST",
        body: form,
        credentials: "include",
        signal: controller.signal,
      }),
      onEvent,
    );
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}

function isStoredChatState(value: unknown): value is StoredChatState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredChatState>;
  const session = item.session;
  if (
    typeof item.stateToken !== "string" ||
    item.stateToken.length <= 40 ||
    (item.reasoningLevel !== undefined &&
      !isReasoningLevel(item.reasoningLevel)) ||
    !Array.isArray(item.messages)
  )
    return false;
  if (
    !session ||
    session.schemaVersion !== "1.1" ||
    !session.flow ||
    !Array.isArray(session.nodes) ||
    !Array.isArray(session.edges) ||
    typeof session.problem?.text !== "string"
  )
    return false;
  if (
    !session.nodes.some(
      (node) => node?.id === session.rootNodeId && node.kind === "problem",
    )
  )
    return false;
  return item.messages.every((message) =>
    Boolean(
      message &&
        typeof message.id === "string" &&
        typeof message.text === "string" &&
        ["user", "assistant", "system"].includes(message.role),
    ),
  );
}

type BoardCacheValidation =
  | { status: "valid"; lesson: BoardLesson }
  | { status: "invalid" }
  | { status: "unavailable" };

async function validateStoredBoardLesson(
  stateToken: string,
  lesson: unknown,
): Promise<BoardCacheValidation> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(apiUrl("/learning/board-cache"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stateToken, lesson }),
      credentials: "include",
      signal: controller.signal,
    });
    if (!response.ok)
      return response.status === 408 ||
        response.status === 429 ||
        response.status >= 500
        ? { status: "unavailable" }
        : { status: "invalid" };
    const payload = (await response.json()) as { data?: { lesson?: unknown } };
    return isStoredBoardLesson(payload.data?.lesson)
      ? { status: "valid", lesson: payload.data.lesson }
      : { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  } finally {
    window.clearTimeout(timeout);
  }
}

function boardCacheCandidate(
  value: unknown,
  requestId: string,
): { lesson: unknown } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return candidate.requestId === requestId && "lesson" in candidate
    ? { lesson: candidate.lesson }
    : null;
}

function userMessage(text: string): ChatMessage {
  return {
    id: id("user"),
    role: "user",
    kind: "user",
    text,
    status: "complete",
    createdAt: new Date().toISOString(),
  };
}
function milestoneMessage(
  text: string,
  surface: "chat" | "board" = "chat",
): ChatMessage {
  return {
    id: id("milestone"),
    role: "system",
    kind: "milestone",
    text,
    status: "complete",
    surface,
    createdAt: new Date().toISOString(),
  };
}
function sourceMessagesForBoard(
  experience: BoardExperience,
  messages: ChatMessage[],
) {
  const ids = new Set(
    experience.scenes.flatMap((scene) => scene.sourceMessageIds),
  );
  return boardContextFromChat(
    messages.filter((message) => ids.has(message.id)),
  );
}
function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
function apiUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  return `${base ?? "/api"}${path}`;
}
function labelOf(value: unknown, fallback: string) {
  return String((value as { label?: string })?.label ?? fallback);
}
function messageOf(error: unknown) {
  const message = error instanceof Error ? error.message : "操作失败，请重试";
  return /JSON|unexpected token|expected property|minus sign|parse/i.test(
    message,
  )
    ? "AI 返回内容格式异常，当前学习位置已保留，请重试这一步。"
    : message;
}
function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return value === "light" || value === "medium" || value === "high";
}
function reasoningLabel(level: ReasoningLevel) {
  return level === "light" ? "轻度" : level === "medium" ? "中" : "高";
}
function choiceLabel(choice: LearningChoice) {
  if (choice === "view_step_answer") return "查看这个空的答案";
  if (choice === "full_solution") return "看完整讲解";
  if (choice === "continue") return "懂了，继续";
  if (choice === "try") return "这一步我来做";
  if (choice === "view_board") return "用板书讲清楚";
  if (choice === "view_illustration") return "插画演示";
  if (choice === "start_recall") return "我看完了，收起讲解";
  if (choice === "retry_original") return "遮住讲解，重做原题";
  if (choice === "practice_similar") return "换一道同知识点题";
  if (choice === "finish_review") return "先结束，稍后再练";
  return "这一步没懂";
}
function turnLoadingLabel(input: LearningTurnInput) {
  if (input.type === "choose_suggestion") return "正在回答你选中的问题";
  if (input.type === "question") return "正在回答你刚才的问题";
  if (input.type === "image_question") return "正在看你标出的疑问";
  if (input.type === "answer") return "正在判断你的思路";
  if (input.type === "image_answer") return "正在阅读你的作答";
  if (input.type === "retry_original") return "正在重新打开原题作答";
  if (input.type === "request_transfer") return "正在生成同知识点新题";
  if (input.type === "acknowledge_illustration") return "正在准备关键步骤回忆";
  if (input.type === "choose" && input.choice === "view_board")
    return "正在整理一份完整板书";
  if (input.type === "choose" && input.choice === "view_illustration")
    return "正在按演算步骤生成插画";
  if (input.type === "choose" && input.choice === "not_understood")
    return "正在换一种更容易理解的讲法";
  if (input.type === "choose" && input.choice === "full_solution")
    return "正在组织完整讲解";
  if (input.type === "choose" && input.choice === "start_recall")
    return "正在收起讲解并准备关键步骤检查";
  if (input.type === "choose" && input.choice === "practice_similar")
    return "正在生成同知识点新题";
  return "正在继续讲解";
}

export function canReuseIllustration(
  lesson: IllustrationLesson | null,
  session: Pick<LearningSession, "requestId" | "problem">,
): boolean {
  if (
    !lesson ||
    !lesson.receipt ||
    lesson.requestId !== session.requestId ||
    lesson.problemFingerprint !== illustrationFingerprint(session)
  )
    return false;
  if (
    lesson.frameCount < 1 ||
    lesson.frameCount > 10 ||
    lesson.frameCount !== lesson.frames.length
  )
    return false;
  const ids = new Set<string>();
  return lesson.frames.every((frame, index) => {
    if (
      frame.id !== `frame-${index + 1}` ||
      frame.index !== index + 1 ||
      ids.has(frame.id)
    )
      return false;
    ids.add(frame.id);
    if (frame.imageUrl.startsWith("data:image/svg+xml;base64,")) return true;
    try {
      const url = new URL(frame.imageUrl);
      return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
    } catch { return false; }
  });
}

// Stateless guards are exported so their persistence and recovery contracts can
// be verified without mounting the entire chat application.
export {
  boardCacheCandidate,
  choiceLabel,
  isAbortError,
  isReasoningLevel,
  isStoredChatState,
  labelOf,
  messageOf,
  reasoningLabel,
  turnLoadingLabel,
  validateStoredBoardLesson,
};
