import { isSupportedSubjectBand } from "@/lib/learning/curriculum";
import { getProviderAdapter, isProviderId } from "@/lib/learning/providers";
import { assertContentLength, assertImageFile, assertRateLimit, assertSameOrigin } from "@/lib/learning/request-guards";
import { consentRateIdentity, hasValidConsent, toClientState } from "@/lib/learning/server-state";
import type { GradeBand, ProblemSnapshot, Subject } from "@/lib/learning/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subjects = new Set<Subject>(["math", "physics", "chemistry"]);
const bands = new Set<GradeBand>(["primary", "junior", "senior"]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertContentLength(request, 7 * 1024 * 1024);
    if (!hasValidConsent(request)) return new Response("请先完成监护人告知与同意", { status: 403 });
    assertRateLimit(request, 30, consentRateIdentity(request) ?? undefined);
    const form = await request.formData();
    const provider = form.get("provider");
    const stage = form.get("stage");
    if (!isProviderId(provider) || (stage !== "recognize" && stage !== "full")) return new Response("模型或分析阶段不合法", { status: 400 });
    const adapter = getProviderAdapter(provider);

    if (stage === "recognize") {
      const file = form.get("image");
      if (!(file instanceof File)) return new Response("请先选择一道题的照片", { status: 400 });
      await assertImageFile(file);
      return sse(async (send) => {
        send("phase", { key: "recognizing", label: "正在识别题干与孩子作答" });
        const imageDataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
        const problem = await adapter.recognizeProblem(imageDataUrl);
        send("recognized", problem);
        send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
      });
    }

    const raw = form.get("problem");
    if (typeof raw !== "string" || raw.length > 24_000) return new Response("缺少已确认的题目", { status: 400 });
    const problem = parseProblemSnapshot(JSON.parse(raw));
    return sse(async (send) => {
      send("phase", { key: "mapping", label: "正在生成直接前置知识路径" });
      const session = await adapter.analyzeProblem(problem, (key, label) => send("phase", { key, label }));
      send("graph", toClientState(session));
      send("complete", { provider, modelId: adapter.modelId, mode: adapter.mode });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析请求失败";
    return new Response(message, { status: message.includes("过大") ? 413 : message.includes("频繁") ? 429 : 400 });
  }
}

function parseProblemSnapshot(value: unknown): ProblemSnapshot {
  if (!value || typeof value !== "object") throw new Error("题目确认信息不完整");
  const item = value as Partial<ProblemSnapshot>;
  if (typeof item.text !== "string" || item.text.trim().length < 3 || item.text.length > 8_000 || typeof item.childWork !== "string" || item.childWork.length > 8_000 || !subjects.has(item.subject as Subject) || !bands.has(item.gradeBand as GradeBand) || !isSupportedSubjectBand(item.subject as Subject, item.gradeBand as GradeBand)) throw new Error("题目确认信息不合法");
  return { text: item.text.trim(), childWork: item.childWork.trim(), subject: item.subject as Subject, gradeBand: item.gradeBand as GradeBand, confidence: typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : 0, userRevised: item.userRevised === true };
}

function sse(run: (send: (event: string, data: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const keepalive = setInterval(() => controller.enqueue(encoder.encode(": keepalive\n\n")), 15_000);
      try { await run(send); }
      catch (error) { send("error", { code: "ANALYZE_FAILED", message: error instanceof Error ? error.message : "分析失败", retryable: true }); }
      finally { clearInterval(keepalive); controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" } });
}
