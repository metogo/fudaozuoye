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
  it.each([undefined, null, "", "   "])("未提取到可选作答（%s）不阻断完整题目的识别", (childWork) => {
    const result = { ...problem, recognized: true, childWork };
    if (childWork === undefined) delete (result as { childWork?: unknown }).childWork;
    const parsed = parseProblem(result);
    expect(parsed.childWork).toBe("");
    expect(parsed.text).toBe(problem.text);
    expect(parsed.visualContext).toMatchObject({ related: true, affectsSolving: true, facts: visual.facts, confidence: visual.confidence });
  });

  it.each([0, 42, false, true, [], ["先算一边"], {}, { answer: "先算一边" }])("异常作答结构（%j）不得静默丢弃", (childWork) => {
    expect(() => parseProblem({ ...problem, recognized: true, childWork })).toThrow("学生已有作答格式不合法");
  });

  it("作答缺省时仍检查必需的题干、配图和置信度", () => {
    const result = { ...problem, recognized: true, childWork: null };
    expect(() => parseProblem({ ...result, text: "" })).toThrow("完整题干");
    expect(() => parseProblem({ ...result, visualContext: undefined })).toThrow("题图相关性判断");
    expect(() => parseProblem({ ...result, confidence: 0.3 })).toThrow(NonRepairableValidationError);
  });

  it("只去除作答首尾空白，保留换行、公式和错误答案，不修改输入", () => {
    const childWork = " \n第一步：$6+6=13$\n答：13厘米。\t ";
    const result = Object.freeze({ ...problem, recognized: true, childWork });
    const parsed = parseProblem(result);
    expect(parsed.childWork).toBe("第一步：$6+6=13$\n答：13厘米。");
    expect(result.childWork).toBe(childWork);
    expect(problemEvidenceSources(parsed)).toContainEqual({ type: "child_work", text: parsed.childWork });
  });

  it.each([undefined, null, "", "\n\t　"])("空作答（%s）不产生虚假的学生作答证据", childWork => {
    const parsed = parseProblem({ ...problem, recognized: true, childWork });
    expect(problemEvidenceSources(parsed)).not.toContainEqual(expect.objectContaining({ type: "child_work" }));
    expect(problemEvidenceSources(parsed)).toContainEqual({ type: "problem", text: visual.facts[0].text });
  });

  it.each([
    { label: "学科", fields: { subject: "unknown" }, error: "学科不合法" },
    { label: "学段", fields: { gradeBand: "大学" }, error: "学段不合法" },
    { label: "置信度格式", fields: { confidence: null }, error: "置信度不合法" },
    { label: "置信度上界", fields: { confidence: 1.01 }, error: "置信度不合法" },
    { label: "配图归属矛盾", fields: { visualContext: { related: false, affectsSolving: false, summary: "", facts: [], confidence: 1 } }, error: "题干明确指向配图" },
    { label: "关键题图不清晰", fields: { visualContext: { ...visual, confidence: 0.54 } }, error: "关键条件无法可靠识别" },
  ])("省略作答不会绕过$label校验", ({ fields, error }) => {
    expect(() => parseProblem({ ...problem, recognized: true, childWork: undefined, ...fields })).toThrow(error);
  });

  it("作答为空时仍允许恰好达到最低置信度的题干与题图", () => {
    const result = parseProblem({ ...problem, recognized: true, childWork: null, confidence: 0.55, visualContext: { ...visual, confidence: 0.55 } });
    expect(result).toMatchObject({ childWork: "", confidence: 0.55, visualContext: { confidence: 0.55, facts: visual.facts } });
  });

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
