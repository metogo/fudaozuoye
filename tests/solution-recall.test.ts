import { describe, expect, it } from "vitest";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { createGroundedRecallCheck, parseGroundedRecallCheck, solutionRecallCheck } from "@/lib/learning/solution-recall";
import { openSession, toClientState } from "@/lib/learning/server-state";

const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
const solution = "## 推导\n由韦达定理，两根和为6，积为k，因此两根平方和为36-2k。\n由平方和为24，得到36-2k=24。";

describe("针对实际讲解的关键步骤检查", () => {
  it("回退也引用具体讲解，不再退回通用题意问题", () => {
    const check = createGroundedRecallCheck(session, solution);
    expect(check.prompt).toContain("36-2k");
    expect(check.prompt).not.toContain(session.problemGuide.firstQuestion);
    expect(check.prompt).not.toContain("不用重做整题");
  });
  it("回退优先选具体算式而不是解题提纲", () => {
    const check = createGroundedRecallCheck(session, `利用韦达定理得到两根之和、两根之积与系数的关系；\n由两根平方和为24，代入得到 $24=6^2-2k$。`);
    expect(check.prompt).toContain("$24=6^2-2k$");
    expect(check.prompt).not.toContain("与系数的关系；");
  });
  it("接受有来源的具体问题并稳定复用", () => {
    const check = parseGroundedRecallCheck({ sourceQuote: "由平方和为24，得到36-2k=24。", question: "为什么两根平方和可以写成36-2k？", answer: "平方和等于两根和的平方减去两倍的积。", explanation: "应说出平方和恒等式和韦达定理，不能只报k的值。" }, session, solution);
    expect(solutionRecallCheck({ ...session, solutionRecallCheck: check })).toBe(check);
  });
  it("拒绝串题引用和通用套话", () => {
    const value = { sourceQuote: "由平方和为24，得到36-2k=24。", question: "题目要求哪个量或结论，哪条条件最接近它？", answer: "平方和等于两根和的平方减去两倍的积。", explanation: "需要说明此处为什么使用韦达定理。" };
    expect(() => parseGroundedRecallCheck(value, session, solution)).toThrow();
    expect(() => parseGroundedRecallCheck({ ...value, sourceQuote: "一辆车3小时行驶180千米", question: "为什么先求汽车行驶的速度？" }, session, solution)).toThrow();
  });
  it("参考答案只保留在签名会话，客户端不暴露", () => {
    const check = createGroundedRecallCheck(session, solution);
    const client = toClientState({ ...session, solutionRecallCheck: check });
    expect(client.session.solutionRecallCheck?.answer).toBe("");
    expect(client.session.solutionRecallCheck?.explanation).toBe("");
    expect(openSession(client.stateToken).solutionRecallCheck?.answer).toBe(check.answer);
  });
});
