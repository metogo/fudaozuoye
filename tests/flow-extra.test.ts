import { describe, expect, it } from "vitest";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { answerGate, assertFlowState, createInitialFlow, flowScopeLabel, needsHelpGate, postSolutionGate, removeRepeatedSolutionAction, solutionReviewGate, understandingGate } from "@/lib/learning/flow";

const session = () => analyzeMock(recognizeMock("math", "primary"), "doubao");

describe("学习流程状态机边界", () => {
  it("不同关卡提供与阶段相符的操作，完整讲解后去掉重复入口", () => {
    expect(understandingGate().options.map(option => option.id)).toEqual(["continue", "try", "not_understood", "view_board", "view_illustration", "full_solution"]);
    expect(answerGate("transfer_answer", "练习", "请作答").options).toBeUndefined();
    expect(answerGate("node_answer", "检查", "请作答").options?.map(option => option.id)).toContain("full_solution");
    expect(postSolutionGate().options?.map(option => option.id)).toContain("retry_original");
    expect(solutionReviewGate().options).toHaveLength(3);
    expect(needsHelpGate("需要帮助").options?.map(option => option.id)).not.toContain("continue");
    const flow = { ...createInitialFlow(), viewedSolution: true, activeGate: understandingGate() };
    expect(removeRepeatedSolutionAction(flow).activeGate?.options?.map(option => option.id)).not.toContain("full_solution");
    expect(removeRepeatedSolutionAction(createInitialFlow())).toEqual(createInitialFlow());
  });

  it("焦点名称精确映射到原题分区或知识点", () => {
    const current = session();
    expect(flowScopeLabel(current, { kind: "problem", section: "goal" })).toBe("题目目标");
    expect(flowScopeLabel(current, { kind: "problem", section: "keyClue" })).toBe("关键线索");
    expect(flowScopeLabel(current, { kind: "problem", section: "approach" })).toBe("解题方向");
    const node = current.nodes.find(item => item.kind === "concept")!;
    expect(flowScopeLabel(current, { kind: "node", nodeId: node.id })).toContain(node.title);
    expect(flowScopeLabel(current, { kind: "node", nodeId: "gone" })).toBe("当前知识点");
  });

  it("拒绝被篡改的关卡、选择项和阶段组合", () => {
    const current = session();
    const base = createInitialFlow();
    expect(() => assertFlowState(base, current.nodes)).not.toThrow();
    expect(() => assertFlowState({ ...base, remediationCount: -1 }, current.nodes)).toThrow("结构不合法");
    expect(() => assertFlowState({ ...base, suggestedQuestions: [{ id: "bad", text: "短", scopeLabel: "x", sourceSummary: "短" }] }, current.nodes)).toThrow("猜你想问");
    expect(() => assertFlowState({ ...base, focus: { kind: "node", nodeId: "missing" } }, current.nodes)).toThrow("焦点不存在");
    expect(() => assertFlowState({ ...base, stage: "original_attempt", activeGate: null }, current.nodes)).toThrow("任务缺失");
    expect(() => assertFlowState({ ...base, activeGate: { ...understandingGate(), options: [{ id: "unknown", label: "x", emphasis: "primary" }] } }, current.nodes)).toThrow("操作不合法");
  });

  it("验证完整讲解、关键回忆与选择题回填状态", () => {
    const current = session();
    const node = current.nodes.find(item => item.kind === "concept")!;
    const review = { ...createInitialFlow(), stage: "solution_recall" as const, viewedSolution: true, activeGate: solutionReviewGate() };
    expect(() => assertFlowState(review, current.nodes)).not.toThrow();
    expect(() => assertFlowState({ ...review, solutionRecallPassed: true }, current.nodes)).toThrow("阅读状态不一致");
    const original = { ...createInitialFlow(), stage: "original_attempt" as const, activeGate: answerGate("original_answer", "原题", "作答", node.id, node.check.choices) };
    expect(() => assertFlowState(original, current.nodes)).not.toThrow();
    expect(() => assertFlowState({ ...original, activeGate: answerGate("original_answer", "原题", "作答", node.id, ["错", "选项"]) }, current.nodes)).toThrow("选项与题目不一致");
  });
});
