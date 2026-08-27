import { fail } from "../api";
import { mergeExpansion } from "../graph";
import { getProviderAdapter } from "../providers";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "../request-guards";
import { openSession, toClientState } from "../server-state";
import { sse } from "./sse";

export async function postExpand(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertRateLimit(request);
    assertContentLength(request, 200_000);
    const body = await request.json();
    const session = openSession(body.stateToken);
    if (typeof body.targetNodeId !== "string" || body.targetNodeId !== session.currentNodeId) throw new Error("只能拆解当前学习节点");
    const adapter = getProviderAdapter(session.provider);
    return sse(async (send) => {
      send("phase", { key: "locating", label: "正在检查这个知识点还缺哪些更简单的前置" });
      const expansion = await adapter.expandNode(session, body.targetNodeId, (key, label) => send("phase", { key, label }));
      send("graph", toClientState(mergeExpansion(session, body.targetNodeId, expansion.nodes, expansion.edges)));
      send("complete", { provider: session.provider, modelId: adapter.modelId, mode: adapter.mode });
    });
  } catch (error) {
    return fail(error);
  }
}
