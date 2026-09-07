import { beforeEach, expect, it, vi } from "vitest";
import { generateExplanationConnection } from "@/lib/learning/providers/knowledge-connection";
import { getProviderConfig } from "@/lib/learning/providers/config";
import { requestModelText } from "@/lib/learning/providers/provider-text-request";
import type { LearningSession } from "@/lib/learning/types";
import { connection, source, evidence } from "./fixtures/knowledge-connection";
vi.mock("@/lib/learning/providers/config", () => ({ getProviderConfig: vi.fn() }));
vi.mock("@/lib/learning/providers/provider-text-request", () => ({ requestModelText: vi.fn() }));
const session = { provider: "doubao", mode: "live", modelId: "test-model", reasoningLevel: "light", problem: { text: evidence, subject: "math", gradeBand: "primary" }, problemGuide: { firstQuestion: "你能先算出每天走多远吗？" }, flow: { activeGate: null }, nodes: [], edges: [] } as unknown as LearningSession;
const draft = { ...connection, relevant: true, anchorId: "p1", evidenceId: "e1" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getProviderConfig).mockReturnValue({ id: "doubao", modelId: "test-model", mock: false, apiKey: "test-only", protocol: "chat-completions", baseUrl: "http://test.invalid", label: "test" });
});
it("普通会话直接判断语义；只显示独立审校后的内容，不把草稿当成最终结果", async () => {
  const reason = "这道题里，每小时走的距离相同，把这样的几份加起来，就可以联系到乘法的意义。";
  vi.mocked(requestModelText).mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ safe: true, issues: [], result: { ...draft, reason } }));
  const signal = new AbortController().signal;
  expect((await generateExplanationConnection(session, source, signal))?.reason).toBe(reason);
  expect(requestModelText).toHaveBeenCalledTimes(2);
  expect(JSON.parse(vi.mocked(requestModelText).mock.calls[0][2]).explanationSegments).toEqual([{ id: "p1", text: source }]);
  expect(vi.mocked(requestModelText).mock.calls[1][1]).toContain("独立的教学内容审校");
  expect(vi.mocked(requestModelText).mock.calls[1][0].signal).toBe(signal);
});
it("审校失败不会回退展示未审校草稿", async () => {
  vi.mocked(requestModelText).mockResolvedValueOnce(JSON.stringify(draft)).mockRejectedValueOnce(new Error("审校超时"));
  await expect(generateExplanationConnection(session, source, new AbortController().signal)).rejects.toThrow("审校超时");
});
it("审校发现不适合展示时不提供草稿，缺少审校结论不能放行", async () => {
  vi.mocked(requestModelText).mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ safe: false, issues: ["会提前透露答案"], result: null }));
  expect(await generateExplanationConnection(session, source, new AbortController().signal)).toBeNull();
  vi.mocked(requestModelText).mockResolvedValueOnce(JSON.stringify(draft)).mockResolvedValueOnce(JSON.stringify({ result: draft }));
  await expect(generateExplanationConnection(session, source, new AbortController().signal)).rejects.toThrow("未完成内容审校");
});
it("无需补充时停止，不再发起审校；模型配置变更不偷偷切模型", async () => {
  vi.mocked(requestModelText).mockResolvedValue(JSON.stringify({ relevant: false }));
  expect(await generateExplanationConnection(session, source, new AbortController().signal)).toBeNull();
  expect(requestModelText).toHaveBeenCalledTimes(1);
  await expect(generateExplanationConnection({ ...session, modelId: "other-model" }, source, new AbortController().signal)).rejects.toThrow("配置已变化");
  expect(requestModelText).toHaveBeenCalledTimes(1);
});
