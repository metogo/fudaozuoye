import { fail, ok } from "@/lib/learning/api";
import { getProviderAdapter } from "@/lib/learning/providers";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "@/lib/learning/request-guards";
import { openSession, toClientState } from "@/lib/learning/server-state";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); assertRateLimit(request); assertContentLength(request, 200_000);
    const body = await request.json();
    const session = openSession(body.stateToken);
    if (!session.originalPassed || session.stage !== "transfer_check") throw new Error("必须先由孩子独立完成原题");
    const adapter = getProviderAdapter(session.provider);
    const transferCheck = await adapter.generateTransferCheck(session);
    if (!transferCheck.prompt.trim() || !transferCheck.answer.trim() || !transferCheck.conceptId) throw new Error("迁移题未绑定有效知识点");
    return ok(session.provider, adapter.modelId, toClientState({ ...session, transferCheck, updatedAt: new Date().toISOString() }));
  } catch (error) { return fail(error); }
}
