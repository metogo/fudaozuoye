import { describe, expect, it } from "vitest";
import type { ProblemSnapshot } from "@/lib/learning/types";
import {
  NonRepairableValidationError,
  edgeReason,
  evidenceCandidates,
  expansionEvidenceSources,
  isRecoverableReasonGroundingError,
  normalizeBlueprintDetail,
  parseBoardSuggestion,
  parseProblem,
  parseProblemSolution,
  parseTextProblem,
  pendingChatSession,
  problemEvidenceSources,
  rootOnlySession,
} from "@/lib/learning/providers/provider-validation";

const visual = {
  related: true,
  affectsSolving: true,
  summary: "图中标有边长 6 厘米",
  facts: [{ text: "AB 标为 6 厘米", source: "printed_label" as const, confidence: 0.99 }],
  confidence: 0.98,
};

const problem: ProblemSnapshot = {
  text: "如图，已知 AB=6 厘米，求周长。",
  childWork: " 先算一边 ",
  subject: "math" as const,
  gradeBand: "junior" as const,
  confidence: 0.9,
  userRevised: false,
  visualContext: visual,
};

describe("模型返回的题目与会话契约", () => {
  it("接受规范化的分类、嵌套答案和结构化板书建议", () => {
    const recognized = parseProblem({
      recognized: true,
      text: "  如图，已知 AB=6 厘米，求周长。 ",
      childWork: " 先算一边 ",
      subject: "数学",
      gradeBand: "middle school",
      confidence: "0.91",
      visualContext: visual,
    });
    expect(recognized).toMatchObject({ subject: "math", gradeBand: "junior", confidence: 0.91, childWork: "先算一边" });
    expect(parseProblemSolution({ result: { standardAnswer: ["12", "厘米"], reasoning: ["两条边相等", "相加"] } })).toEqual({ originalAnswer: "12；厘米", originalExplanation: "两条边相等；相加" });
    expect(parseBoardSuggestion({ recommended: true, reason: "需要把两条边的对应关系连起来看", layout: "relation" })).toEqual({ recommended: true, reason: "需要把两条边的对应关系连起来看", layout: "relation" });
  });

  it("把不可恢复的识别失败与可修复的结构错误明确区分", () => {
    expect(() => parseProblem({ recognized: false, failureReason: "画面反光" })).toThrow(NonRepairableValidationError);
    expect(() => parseProblem({ recognized: true, text: "ab", childWork: "", subject: "math", gradeBand: "junior", confidence: 0.9, visualContext: visual })).toThrow("没有识别到完整题干");
    expect(() => parseProblem({ recognized: true, text: problem.text, childWork: "", subject: "math", gradeBand: "junior", confidence: 0.54, visualContext: visual })).toThrow("置信度过低");
    expect(() => parseTextProblem({ recognized: true, subject: "unknown", gradeBand: "junior", confidence: 0.9 }, "计算 2+3")).toThrow("分类结果结构不合法");
    expect(parseTextProblem({ recognized: true, subject: "物理", gradeBand: "高中", confidence: 1 }, "  求速度  ")).toMatchObject({ text: "求速度", subject: "physics", gradeBand: "senior", userRevised: true });
    expect(isRecoverableReasonGroundingError(new Error("简化理由没有联系已引用的真实原文"))).toBe(true);
    expect(isRecoverableReasonGroundingError(new Error("其它错误"))).toBe(false);
  });

  it("只从真实来源构建证据、可退回原题会话，并保留父节点依据", () => {
    const sources = problemEvidenceSources(problem);
    expect(sources).toEqual(expect.arrayContaining([{ type: "problem", text: problem.text }, { type: "problem", text: "AB 标为 6 厘米" }, { type: "child_work", text: " 先算一边 " }]));
    expect(evidenceCandidates([{ type: "problem", text: "条件甲，条件乙；条件甲。" }])).toEqual([
      { type: "problem", text: "条件甲，条件乙；条件甲。" },
      { type: "problem", text: "条件甲" },
      { type: "problem", text: "条件乙" },
    ]);
    const session = pendingChatSession(problem, "doubao", "light", "model", "live");
    const root = session.nodes[0];
    const child = { ...root, id: "child", kind: "concept" as const, title: "边长对应", simplification: "AB 标为 6 厘米，要先看对应边。", teaching: { ...root.teaching, explanation: "AB 标为 6 厘米，对应边相等。" } };
    const expanded = { ...session, nodes: [root, child], edges: [{ from: child.id, to: root.id, reason: "需要先看对应边" }], currentNodeId: child.id };
    expect(expansionEvidenceSources(problem, child).map((item) => item.type)).toEqual(expect.arrayContaining(["problem", "child_work", "parent"]));
    expect(rootOnlySession(expanded).nodes).toEqual([root]);
    expect(edgeReason(child, undefined, "原题")).toContain("边长对应是理解原题所需的直接前置");
  });

  it("能展开兼容的教学详情，拒绝歧义详情和不合规建议", () => {
    expect(normalizeBlueprintDetail({ teaching: "说明", example: "例子", check: { prompt: "问" } }, "math.x")).toMatchObject({ teaching: { explanation: "说明" } });
    expect(() => normalizeBlueprintDetail({ items: [
      { conceptId: "math.x", teaching: { explanation: "一" }, check: {} },
      { conceptId: "math.x", teaching: { explanation: "二" }, check: {} },
    ] }, "math.x")).toThrow("多个教学节点");
    expect(() => normalizeBlueprintDetail({ conceptId: "math.y", teaching: { explanation: "一" }, check: {} }, "math.x")).toThrow("错误的课程概念");
    expect(() => parseBoardSuggestion({ recommended: true, reason: "短", layout: "wrong" })).toThrow("结构不合法");
  });
});
