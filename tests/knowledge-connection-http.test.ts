import { beforeEach, expect, it, vi } from "vitest";
import { postKnowledgeConnection } from "@/lib/learning/http/knowledge-connection";
import { generateExplanationConnection } from "@/lib/learning/providers/knowledge-connection";
import { openSession } from "@/lib/learning/server-state";
import { connection, source } from "./fixtures/knowledge-connection";
vi.mock("@/lib/learning/providers/knowledge-connection", () => ({ generateExplanationConnection: vi.fn() }));
vi.mock("@/lib/learning/server-state", () => ({ openSession: vi.fn(), consentRateIdentity: () => "test-connection" }));
vi.mock("@/lib/learning/request-guards", () => ({ assertSameOrigin: vi.fn(), assertRateLimit: vi.fn(), assertContentLength: vi.fn() }));
const session = { nodes: [], edges: [], problem: { text: "已签名原题" }, flow: { activeGate: { id: "original-gate" } } };
const request = (extra = {}) => new Request("http://localhost/api/learning/knowledge-connection", { method: "POST", body: JSON.stringify({ stateToken: "signed", messageId: "m", source, ...extra }) });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(openSession).mockReturnValue(session as never); });
it("普通零知识节点会话也调用模型语义分析，不回写任务或完成状态", async () => {
  vi.mocked(generateExplanationConnection).mockResolvedValue(connection);
  const before = JSON.stringify(session);
  const response = await postKnowledgeConnection(request({ problem: { text: "不能使用客户端伪造题目" } }));
  expect(await response.json()).toEqual({ messageId: "m", connection });
  expect(generateExplanationConnection).toHaveBeenCalledWith(session, source, expect.any(AbortSignal));
  expect(JSON.stringify(session)).toBe(before);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("模型可明确决定不展示，不生成假关系", async () => {
  vi.mocked(generateExplanationConnection).mockResolvedValue(null);
  expect(await (await postKnowledgeConnection(request())).json()).toEqual({ messageId: "m", connection: null });
});
it("失败是这个独立请求的失败，不变更学习会话", async () => {
  const before = JSON.stringify(session);
  vi.mocked(generateExplanationConnection).mockRejectedValue(new Error("整理超时"));
  const body = await (await postKnowledgeConnection(request())).json();
  expect(body.error.message).toBe("整理超时");
  expect(JSON.stringify(session)).toBe(before);
});
it("凭证损坏、缺少消息绑定或输入过大不调用模型", async () => {
  await postKnowledgeConnection(request({ messageId: "" }));
  await postKnowledgeConnection(request({ source: "x".repeat(60001) }));
  vi.mocked(openSession).mockImplementation(() => { throw new Error("bad token"); });
  await postKnowledgeConnection(request());
  expect(generateExplanationConnection).not.toHaveBeenCalled();
});
