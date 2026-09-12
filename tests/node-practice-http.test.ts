import { beforeEach, expect, it, vi } from "vitest";
import { postNodePractice } from "@/lib/learning/http/node-practice";
import { getSessionProviderAdapter } from "@/lib/learning/providers";
import { openSession } from "@/lib/learning/server-state";
vi.mock("@/lib/learning/providers", () => ({ getSessionProviderAdapter: vi.fn() }));
vi.mock("@/lib/learning/server-state", () => ({ openSession: vi.fn(), consentRateIdentity: () => "test" }));
vi.mock("@/lib/learning/request-guards", () => ({ assertSameOrigin: vi.fn(), assertRateLimit: vi.fn(), assertContentLength: vi.fn() }));
const node = { id: "core", title: "效率", evidence: "6天完成" };
const map = { version: 1, overviewOnly: true, rootId: "core", nodes: [node], edges: [] };
const session = { problem: { text: "6天完成" }, flow: { activeGate: { id: "original-gate" } } };
const practice = { question: "时间减半，效率如何变化？", options: ["翻倍", "减半", "不变"], correctIndex: 0, explanation: "总量不变。", connection: "用于理解原题中的效率。" };
const request = (changes = {}) => new Request("http://localhost/api/learning/node-practice", { method: "POST", body: JSON.stringify({ stateToken: "sealed", map, nodeId: "core", partial: true, previous: [], ...changes }) });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(openSession).mockReturnValue(session as never); });
it("绑定签名原题与节点，不改学习关卡，图谱未结束也能练习", async () => {
  const generateNodePractice = vi.fn().mockResolvedValue(practice);
  vi.mocked(getSessionProviderAdapter).mockReturnValue({ generateNodePractice } as never);
  const before = JSON.stringify(session);
  const response = await postNodePractice(request());
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ practice });
  expect(openSession).toHaveBeenCalledWith("sealed"); expect(JSON.stringify(session)).toBe(before);
  expect(generateNodePractice.mock.calls[0][1].id).toBe("core");
});
it("跨题证据、缺失节点、过量历史在调用模型前拒绝", async () => {
  for (const changes of [{ nodeId: "other" }, { map: { ...map, nodes: [{ ...node, evidence: "另一道题" }] } }, { previous: Array(6).fill("old") }]) expect((await postNodePractice(request(changes))).status).toBe(400);
  expect(getSessionProviderAdapter).not.toHaveBeenCalled();
});
it("凭证、模型能力或生成失败均只返回局部错误", async () => {
  vi.mocked(getSessionProviderAdapter).mockReturnValue({} as never);
  expect((await postNodePractice(request())).status).toBe(400);
  vi.mocked(getSessionProviderAdapter).mockReturnValue({ generateNodePractice: vi.fn().mockRejectedValue(new Error("failed")) } as never);
  expect((await (await postNodePractice(request())).json()).data).toBeNull();
  vi.mocked(openSession).mockImplementation(() => { throw new Error("bad state"); });
  expect((await postNodePractice(request())).status).toBe(400);
});
