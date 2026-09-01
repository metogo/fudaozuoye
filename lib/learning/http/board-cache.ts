import { restoreBoardLesson } from "../board-cache";
import { ServiceError } from "../errors";
import { assertContentLength, assertRateLimit, assertSameOrigin } from "../request-guards";
import { openSession } from "../server-state";

export async function postBoardCache(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    assertRateLimit(request, 30);
    assertContentLength(request, 240_000);
    const body = await request.json() as Record<string, unknown>;
    const session = openSession(body.stateToken);
    const lesson = restoreBoardLesson(session, body.lesson);
    if (!lesson) throw new Error("保存的板书没有通过可靠性复检");
    return Response.json({ schemaVersion: "1.0", data: { lesson }, error: null });
  } catch (error) {
    const serviceError = error instanceof ServiceError ? error : null;
    return Response.json({
      schemaVersion: "1.0",
      data: null,
      error: { code: serviceError?.code ?? "INVALID_BOARD_CACHE", message: error instanceof Error ? error.message : "板书缓存复检失败", retryable: serviceError?.retryable ?? false },
    }, { status: serviceError?.status ?? 400 });
  }
}
