import { fail } from "../api";
import { getSessionProviderAdapter } from "../providers";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "../request-guards";
import { openSession, toClientState } from "../server-state";
import { sse } from "./sse";

function normalizedPrompt(value: string) {
  return value.replace(/[\s，。！？；：、“”‘’（）()]/g, "").toLowerCase();
}

export async function postSimilarCheck(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertRateLimit(request);
    assertContentLength(request, 200_000);
    const body = await request.json() as Record<string, unknown>;
    const session = openSession(body.stateToken);
    if (typeof body.nodeId !== "string" || body.nodeId !== session.currentNodeId) throw new Error("只能更换当前知识点的练习题");
    if (session.stage !== "diagnosing" && session.stage !== "learning") throw new Error("当前学习阶段不能更换练习题");
    const node = session.nodes.find((item) => item.id === body.nodeId);
    if (!node || node.kind !== "concept" || node.state === "mastered" || node.state === "parent_confirmed" || node.state === "needs_help") throw new Error("当前知识点不能更换练习题");
    const adapter = getSessionProviderAdapter(session);
    return sse(async (send) => {
      send("phase", { key: "generating", label: `正在生成“${node.title}”的同知识点新题` });
      const check = await adapter.generateSimilarCheck(session, node.id);
      if (check.conceptId !== node.conceptId || !check.id.startsWith("similar-") || !check.prompt.trim() || !check.answer.trim()) throw new Error("新练习题没有可靠绑定当前知识点");
      if (normalizedPrompt(check.prompt) === normalizedPrompt(node.check.prompt)) throw new Error("模型返回了重复题目，请重新换一道");
      const next = {
        ...session,
        nodes: session.nodes.map((item) => item.id === node.id ? { ...item, check } : item),
        updatedAt: new Date().toISOString(),
      };
      send("graph", toClientState(next));
      send("complete", { provider: session.provider, modelId: adapter.modelId, source: adapter.mode === "live" ? "model_generated" : "fixed_demo" });
    });
  } catch (error) {
    return fail(error);
  }
}
