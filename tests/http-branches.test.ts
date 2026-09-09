import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/learning/errors";
import { postBoardCache } from "@/lib/learning/http/board-cache";
import { postExpand } from "@/lib/learning/http/expand";
import { getProviders } from "@/lib/learning/http/providers";
import { postTransfer } from "@/lib/learning/http/transfer";
import { restoreBoardLesson } from "@/lib/learning/board-cache";
import { mergeExpansion } from "@/lib/learning/graph";
import { getSessionProviderAdapter } from "@/lib/learning/providers";
import { createInstantBoardLesson } from "@/lib/learning/providers/board";
import { listProviderAvailability } from "@/lib/learning/providers/config";
import { openSession, toClientState } from "@/lib/learning/server-state";

vi.mock("@/lib/learning/request-guards", () => ({
  assertSameOrigin: vi.fn(), assertRateLimit: vi.fn(), assertContentLength: vi.fn(),
}));
vi.mock("@/lib/learning/server-state", () => ({
  openSession: vi.fn(), toClientState: vi.fn(), consentRateIdentity: vi.fn(() => "consent-test"),
}));
vi.mock("@/lib/learning/board-cache", () => ({ restoreBoardLesson: vi.fn() }));
vi.mock("@/lib/learning/providers/board", () => ({ createInstantBoardLesson: vi.fn() }));
vi.mock("@/lib/learning/providers", () => ({ getSessionProviderAdapter: vi.fn() }));
vi.mock("@/lib/learning/graph", () => ({ mergeExpansion: vi.fn() }));
vi.mock("@/lib/learning/providers/config", () => ({ listProviderAvailability: vi.fn() }));

const request = (path: string, body: Record<string, unknown>) => new Request(`http://localhost${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("低频学习接口的成功、兜底与错误分支", () => {
  afterEach(() => vi.resetAllMocks());

  it("优先恢复安全的缓存板书，且携带已同意用户的限流身份", async () => {
    const session = { flow: { focus: "当前步骤" } };
    const lesson = { title: "已恢复板书" };
    vi.mocked(openSession).mockReturnValue(session as never);
    vi.mocked(restoreBoardLesson).mockReturnValue(lesson as never);
    const response = await postBoardCache(request("/api/learning/board-cache", { stateToken: "sealed", lesson: { layout: "steps" } }));
    expect(await response.json()).toEqual({ schemaVersion: "1.0", data: { lesson }, error: null });
    expect(createInstantBoardLesson).not.toHaveBeenCalled();
  });

  it("缓存不可用时按当前会话重新建立瞬时板书", async () => {
    const session = { flow: { focus: "判别式" } };
    const lesson = { title: "重建板书" };
    vi.mocked(openSession).mockReturnValue(session as never);
    vi.mocked(restoreBoardLesson).mockReturnValue(null);
    vi.mocked(createInstantBoardLesson).mockReturnValue(lesson as never);
    const response = await postBoardCache(request("/api/learning/board-cache", { stateToken: "sealed", lesson: null }));
    expect(await response.json()).toEqual({ schemaVersion: "1.0", data: { lesson }, error: null });
    expect(createInstantBoardLesson).toHaveBeenCalledWith(session, "判别式", expect.objectContaining({ layout: "steps" }));
  });

  it("把业务错误和未知错误分别转成安全的缓存错误响应", async () => {
    vi.mocked(openSession).mockImplementationOnce(() => { throw new ServiceError("凭证失效", 401, "INVALID_TOKEN"); });
    const serviceResponse = await postBoardCache(request("/api/learning/board-cache", { stateToken: "sealed" }));
    expect(serviceResponse.status).toBe(401);
    expect(await serviceResponse.json()).toMatchObject({ error: { code: "INVALID_TOKEN", retryable: false } });
    vi.mocked(openSession).mockImplementationOnce(() => { throw new Error("格式不正确"); });
    const invalidResponse = await postBoardCache(request("/api/learning/board-cache", { stateToken: "sealed" }));
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toMatchObject({ error: { code: "INVALID_BOARD_CACHE", message: "格式不正确" } });
  });

  it("按当前节点流式返回下钻图谱和完成信息", async () => {
    const session = { currentNodeId: "root", provider: "doubao" };
    const expanded = { currentNodeId: "root", nodes: ["child"], edges: ["edge"] };
    vi.mocked(openSession).mockReturnValue(session as never);
    vi.mocked(mergeExpansion).mockReturnValue(expanded as never);
    vi.mocked(toClientState).mockReturnValue({ session: expanded, stateToken: "next-token" } as never);
    const expandNode = vi.fn(async (_session, _node, phase) => { phase("reasoning", "正在连接前置知识"); return { nodes: [{ id: "child" }], edges: [{ from: "root", to: "child" }] }; });
    vi.mocked(getSessionProviderAdapter).mockReturnValue({ expandNode, modelId: "model-1", mode: "mock" } as never);
    const response = await postExpand(request("/api/learning/expand", { stateToken: "sealed", targetNodeId: "root" }));
    const stream = await response.text();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(stream).toContain("正在检查这个知识点");
    expect(stream).toContain("正在连接前置知识");
    expect(stream).toContain('"stateToken":"next-token"');
    expect(stream).toContain('"modelId":"model-1"');
  });

  it("拒绝非当前节点的下钻请求，且不调用模型", async () => {
    vi.mocked(openSession).mockReturnValue({ currentNodeId: "root" } as never);
    const response = await postExpand(request("/api/learning/expand", { stateToken: "sealed", targetNodeId: "other" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { message: "只能拆解当前学习节点" } });
    expect(getSessionProviderAdapter).not.toHaveBeenCalled();
  });

  it("仅在原题独立完成后生成绑定知识点的迁移题", async () => {
    const session = { originalPassed: true, stage: "transfer_check", provider: "doubao" };
    vi.mocked(openSession).mockReturnValue(session as never);
    vi.mocked(toClientState).mockReturnValue({ session: "safe", stateToken: "updated" } as never);
    const generateTransferCheck = vi.fn().mockResolvedValue({ prompt: "换一道题", answer: "答案", conceptId: "quadratic" });
    vi.mocked(getSessionProviderAdapter).mockReturnValue({ generateTransferCheck, modelId: "model-1" } as never);
    const response = await postTransfer(request("/api/learning/transfer", { stateToken: "sealed" }));
    expect(await response.json()).toMatchObject({ provider: "doubao", modelId: "model-1", data: { stateToken: "updated" } });
    expect(generateTransferCheck).toHaveBeenCalledWith(session);
  });

  it("阻止提前迁移题和模型返回的无效迁移题", async () => {
    vi.mocked(openSession).mockReturnValue({ originalPassed: false, stage: "learning" } as never);
    expect((await postTransfer(request("/api/learning/transfer", { stateToken: "sealed" }))).status).toBe(400);
    vi.mocked(openSession).mockReturnValue({ originalPassed: true, stage: "transfer_check" } as never);
    vi.mocked(getSessionProviderAdapter).mockReturnValue({ generateTransferCheck: vi.fn().mockResolvedValue({ prompt: " ", answer: "", conceptId: "" }) } as never);
    const response = await postTransfer(request("/api/learning/transfer", { stateToken: "sealed" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { message: "迁移题未绑定有效知识点" } });
  });

  it("迁移题生成服务异常时保持标准错误信封，而不泄露内部状态", async () => {
    vi.mocked(openSession).mockReturnValue({ originalPassed: true, stage: "transfer_check", provider: "doubao" } as never);
    vi.mocked(getSessionProviderAdapter).mockReturnValue({ generateTransferCheck: vi.fn().mockRejectedValue(new ServiceError("模型暂忙", 503, "PROVIDER_BUSY", true)) } as never);
    const response = await postTransfer(request("/api/learning/transfer", { stateToken: "sealed" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "PROVIDER_BUSY", retryable: true, message: "模型暂忙" } });
  });

  it("列出运行时可用模型配置", async () => {
    vi.mocked(listProviderAvailability).mockReturnValue([{ id: "doubao", available: true }] as never);
    expect(await getProviders().json()).toEqual({ schemaVersion: "1.0", capabilities: { knowledgeMapStream: 1 }, providers: [{ id: "doubao", available: true }] });
  });
});
