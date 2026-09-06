import { describe, expect, it } from "vitest";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { fail, ok, parseSession, requestId } from "@/lib/learning/api";
import { ServiceError } from "@/lib/learning/errors";

const sample = () => analyzeMock(recognizeMock("math", "primary"), "doubao");

describe("会话 API 边界", () => {
  it("兼容旧会话缺失的可选流程字段，并补上待看答案入口", () => {
    const session: any = sample();
    const root = session.nodes.find((node: any) => node.id === session.rootNodeId);
    session.flow = { ...session.flow, stage: "original_attempt", activeGate: { id: "g", kind: "original_answer", title: "原题", nodeId: root.id }, boardSuggestion: undefined, suggestedQuestions: undefined, solutionRecallPassed: undefined };
    delete session.reasoningLevel;
    const parsed = parseSession(session);
    expect(parsed.reasoningLevel).toBe("light");
    expect(parsed.flow.boardSuggestion).toBeNull();
    expect(parsed.flow.suggestedQuestions).toEqual([]);
    expect(parsed.flow.activeGate?.options?.map(option => option.id)).toContain("full_solution");
  });

  it("拒绝缺少根、无效强度、超量数据与断裂步骤填空", () => {
    const base: any = sample();
    expect(() => parseSession({})).toThrow("结构不合法");
    expect(() => parseSession({ ...base, rootNodeId: "none" })).toThrow("缺少原题节点");
    expect(() => parseSession({ ...base, reasoningLevel: "turbo" })).toThrow("推理强度不合法");
    expect(() => parseSession({ ...base, evidence: Array.from({ length: 257 }) })).toThrow("数据量不合法");
    expect(() => parseSession({ ...base, flow: { ...base.flow, stage: "guided_reasoning", activeGate: { id: "g", kind: "step_answer", title: "填空", nodeId: base.rootNodeId, options: [] } } })).toThrow("步骤填空数据不完整");
  });

  it("成功与失败信封保留可读错误和可重试语义", async () => {
    const success = await ok("doubao", "model", { value: 1 }, "req-fixed").json() as any;
    const retry = await fail(new ServiceError("忙", 503, "PROVIDER_BUSY", true)).json() as any;
    const invalid = await fail("bad").json() as any;
    expect(success).toMatchObject({ requestId: "req-fixed", data: { value: 1 }, error: null });
    expect(retry.error).toMatchObject({ code: "PROVIDER_BUSY", retryable: true });
    expect(invalid.error).toMatchObject({ code: "INVALID_REQUEST", retryable: false });
    expect(requestId()).toMatch(/^req-/);
  });
});
