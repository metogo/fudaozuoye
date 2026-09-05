import { isSupportedSubjectBand } from "../curriculum";
import { getProviderAdapter, isProviderId } from "../providers";
import { isBuiltInMockProblem } from "../mock-engine";
import { assertContentLength, assertImageFile, assertRateLimit, assertSameOrigin } from "../request-guards";
import { consentRateIdentity, hasValidConsent, toClientState } from "../server-state";
import { parseProblemVisualContext } from "../problem-evidence";
import { DEMO_CUSTOM_INPUT_UNSUPPORTED_MESSAGE } from "../providers/mock-adapter";
import { subjects as supportedSubjects, type GradeBand, type ProblemSnapshot, type ReasoningLevel, type Subject } from "../types";
import { sse } from "./sse";

const subjects = new Set<Subject>(supportedSubjects);
const bands = new Set<GradeBand>(["primary", "junior", "senior"]);
const reasoningLevels = new Set<ReasoningLevel>(["light", "medium", "high"]);

export async function postAnalyze(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertContentLength(request, 7 * 1024 * 1024);
    if (!hasValidConsent(request)) return new Response("请先完成监护人告知与同意", { status: 403 });
    assertRateLimit(request, 30, consentRateIdentity(request) ?? undefined);
    const form = await request.formData();
    const requestedProvider = form.get("provider");
    const requestedReasoningLevel = form.get("reasoningLevel");
    const stage = form.get("stage");
    if (!isProviderId(requestedProvider) || !reasoningLevels.has(requestedReasoningLevel as ReasoningLevel) || (stage !== "recognize" && stage !== "recognize_text" && stage !== "full")) return new Response("推理强度或分析阶段不合法", { status: 400 });
    const reasoningLevel = requestedReasoningLevel as ReasoningLevel;
    const provider = "doubao" as const;
    const adapter = getProviderAdapter(provider, reasoningLevel, request.signal);

    if (stage === "recognize") return recognize(form, provider, adapter);
    if (stage === "recognize_text") return recognizeText(form, provider, adapter);
    const raw = form.get("problem");
    if (typeof raw !== "string" || raw.length > 24_000) return new Response("缺少已确认的题目", { status: 400 });
    const problem = parseProblemSnapshot(JSON.parse(raw));
    if (adapter.mode === "demo" && !isBuiltInMockProblem(problem)) return new Response(DEMO_CUSTOM_INPUT_UNSUPPORTED_MESSAGE, { status: 400 });
    return sse(async (send) => {
      const startedAt = Date.now();
      send("phase", { key: "mapping", label: "正在理解题目要解决什么" });
      const session = await adapter.prepareChatSession(problem, (key, label) => send("phase", { key, label }));
      send("perf.phase", { key: "session_ready", elapsedMs: Date.now() - startedAt });
      send("graph", toClientState(session));
      send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析请求失败";
    return new Response(message, { status: message.includes("过大") ? 413 : message.includes("频繁") ? 429 : 400 });
  }
}

function recognizeText(form: FormData, provider: "doubao" | "openai" | "xai", adapter: ReturnType<typeof getProviderAdapter>): Response {
  const raw = form.get("text");
  if (typeof raw !== "string" || raw.trim().length < 3 || raw.length > 8_000) return new Response("请输入一道完整的题目", { status: 400 });
  return sse(async (send) => {
    const startedAt = Date.now();
    send("phase", { key: "recognizing", label: "正在读懂你发来的题目" });
    send("recognized", await adapter.recognizeTextProblem(raw.trim()));
    send("perf.phase", { key: "text_recognized", elapsedMs: Date.now() - startedAt });
    send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
  });
}

async function recognize(form: FormData, provider: "doubao" | "openai" | "xai", adapter: ReturnType<typeof getProviderAdapter>): Promise<Response> {
  const file = form.get("image");
  if (!(file instanceof File)) return new Response("请先选择一道题的照片", { status: 400 });
  await assertImageFile(file);
  if (adapter.mode === "demo") return new Response(DEMO_CUSTOM_INPUT_UNSUPPORTED_MESSAGE, { status: 400 });
  return sse(async (send) => {
    const startedAt = Date.now();
    send("phase", { key: "recognizing", label: "正在识别题干与你的作答" });
    const imageDataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    send("recognized", await adapter.recognizeProblem(imageDataUrl));
    send("perf.phase", { key: "image_recognized", elapsedMs: Date.now() - startedAt });
    send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
  });
}

function parseProblemSnapshot(value: unknown): ProblemSnapshot {
  if (!value || typeof value !== "object") throw new Error("题目确认信息不完整");
  const item = value as Partial<ProblemSnapshot>;
  if (typeof item.text !== "string" || item.text.trim().length < 3 || item.text.length > 8_000 || typeof item.childWork !== "string" || item.childWork.length > 8_000 || !subjects.has(item.subject as Subject) || !bands.has(item.gradeBand as GradeBand) || !isSupportedSubjectBand(item.subject as Subject, item.gradeBand as GradeBand)) throw new Error("题目确认信息不合法");
  const gradeBand = item.gradeBand as GradeBand;
  return {
    text: item.text.trim(),
    childWork: item.childWork.trim(),
    subject: item.subject as Subject,
    gradeBand,
    learnerBand: gradeBand,
    confidence: typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : 0,
    userRevised: item.userRevised === true,
    visualContext: parseProblemVisualContext(item.visualContext),
  };
}
