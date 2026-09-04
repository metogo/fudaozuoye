import { describe, expect, it } from "vitest";
import { needsVisualReview, parseProblemVisualContext, problemEvidenceText, requiresProblemImage } from "@/lib/learning/problem-evidence";
import type { ProblemSnapshot } from "@/lib/learning/types";
import { parseAuditedProblemSolution } from "@/lib/learning/providers/problem-image-analysis";

const base: ProblemSnapshot = {
  text: "如图，一块正方形草地两侧铺路，求整块长方形地的周长。",
  childWork: "",
  subject: "math",
  gradeBand: "primary",
  confidence: 0.98,
  userRevised: false,
};

describe("题图证据", () => {
  it.each([false, true])("后端复核不因非必要图片低分阻断讲解：related=%s", (related) => {
    const visualContext = { related, affectsSolving: false, summary: "辅助插图", confidence: 0.4, facts: [] };
    const audited = parseAuditedProblemSolution({ originalAnswer: "35米和25米", originalExplanation: "两队每天共修60米，甲比乙多10米，分别为35米和25米。", visualContext });
    expect(audited.solution.originalAnswer).toBe("35米和25米");
    expect(audited.visualContext.confidence).toBe(0.4);
  });

  it("普通文字题不因 OCR 置信度偏低而要求确认", () => {
    const problem = { ...base, text: "计算 2+3。", confidence: 0.41 };
    expect(needsVisualReview(problem)).toBe(false);
    expect(problemEvidenceText(problem)).toBe(problem.text);
    expect(problem.confidence).toBe(0.41);
    expect(problem.userRevised).toBe(false);
  });

  it("把相关题图事实并入后续题目证据，但不改写 OCR 题干", () => {
    const problem: ProblemSnapshot = {
      ...base,
      visualContext: {
        related: true,
        affectsSolving: true,
        summary: "草地和道路组成长方形",
        confidence: 0.98,
        facts: [
          { text: "长方形横向总长标为15米", source: "printed_label", confidence: 0.99 },
          { text: "正方形草地边长标为12米", source: "printed_label", confidence: 0.99 },
        ],
      },
    };
    expect(problem.text).not.toContain("15米");
    expect(problemEvidenceText(problem)).toContain("【题图证据】");
    expect(problemEvidenceText(problem)).toContain("正方形草地边长标为12米");
    expect(problemEvidenceText(problem)).not.toContain("草地和道路组成长方形");
    expect(requiresProblemImage(problem)).toBe(true);
  });

  it("视觉摘要只能由可核验事实生成，不能夹带答案或推导", () => {
    const visualContext = parseProblemVisualContext({
      related: true,
      affectsSolving: true,
      summary: "所以答案是54米",
      facts: [{ text: "标注线从外框左边界延伸到正方形右边界，标为15米", source: "printed_label", confidence: 0.99 }],
      confidence: 0.99,
    });
    expect(visualContext?.summary).toBe("标注线从外框左边界延伸到正方形右边界，标为15米");
    expect(visualContext?.summary).not.toContain("54米");
  });

  it("不相关视觉内容不会污染后续证据", () => {
    const visualContext = parseProblemVisualContext({ related: false, affectsSolving: true, summary: "二维码", facts: [{ text: "扫码讲解", source: "printed_label", confidence: 1 }], confidence: 0.99 });
    const problem = { ...base, text: "计算 2+3。", visualContext };
    expect(problemEvidenceText(problem)).toBe("计算 2+3。");
    expect(requiresProblemImage(problem)).toBe(false);
  });

  it.each([
    [0.78, 0.99],
    [0.99, 0.7],
    [0.78, 0.7],
    [0.819, 0.99],
    [0.99, 0.819],
  ])("必要题图相关性为 %s、事实为 %s 时保留人工确认", (confidence, factConfidence) => {
    const problem: ProblemSnapshot = {
      ...base,
      visualContext: {
        related: true,
        affectsSolving: true,
        summary: "尺寸较模糊",
        confidence,
        facts: [{ text: "尺寸疑似为12米", source: "printed_label", confidence: factConfidence }],
      },
    };
    expect(needsVisualReview(problem)).toBe(true);
  });

  it("低置信度的不相关视觉内容不要求确认", () => {
    const problem: ProblemSnapshot = {
      ...base,
      text: "根据材料完成问题。",
      visualContext: { related: false, affectsSolving: false, summary: "", facts: [], confidence: 0.41 },
    };
    expect(needsVisualReview(problem)).toBe(false);
    expect(problemEvidenceText(problem)).toBe(problem.text);
    expect(requiresProblemImage(problem)).toBe(false);
  });

  it("属于题目但不影响求解的插图只随原图复核，不进入解题证据", () => {
    const problem: ProblemSnapshot = {
      ...base,
      text: "阅读短文并概括中心思想。",
      subject: "chinese",
      visualContext: { related: true, affectsSolving: false, summary: "课文旁的情境插图", facts: [], confidence: 0.98 },
    };
    expect(requiresProblemImage(problem)).toBe(true);
    expect(problemEvidenceText(problem)).toBe(problem.text);
  });

  it("辅助插图的相关性和事实置信度偏低也不要求确认", () => {
    const problem: ProblemSnapshot = {
      ...base,
      visualContext: {
        related: true,
        affectsSolving: false,
        summary: "课文旁的情境插图",
        confidence: 0.4,
        facts: [{ text: "插图疑似有一棵树", source: "visual_relation", confidence: 0.5 }],
      },
    };
    expect(needsVisualReview(problem)).toBe(false);
    expect(problemEvidenceText(problem)).toBe(problem.text);
    expect(requiresProblemImage(problem)).toBe(true);
  });

  it.each([
    [0.82, 0.99],
    [0.99, 0.82],
    [0.82, 0.82],
  ])("必要题图相关性为 %s、事实为 %s 时直接继续且保留图文证据", (confidence, factConfidence) => {
    const problem: ProblemSnapshot = {
      ...base,
      confidence: 0.4,
      visualContext: {
        related: true,
        affectsSolving: true,
        summary: "草地边长标为12米",
        confidence,
        facts: [{ text: "草地边长标为12米", source: "printed_label", confidence: factConfidence }],
      },
    };
    expect(needsVisualReview(problem)).toBe(false);
    expect(problemEvidenceText(problem)).toContain("草地边长标为12米");
    expect(requiresProblemImage(problem)).toBe(true);
    expect(problem.confidence).toBe(0.4);
    expect(problem.userRevised).toBe(false);
  });

  it.each([
    ["几何图", "三角形ABC中，AB与AC相等", "visual_relation"],
    ["统计图", "条形图中三月对应的柱高标为42", "printed_label"],
    ["电路图", "灯泡L1与开关S串联", "visual_relation"],
    ["地图装置图", "学校位于图书馆正东方向", "visual_relation"],
  ] as const)("%s 的可核验条件会进入统一题目证据", (_name, fact, source) => {
    const visualContext = parseProblemVisualContext({
      related: true,
      affectsSolving: true,
      summary: "配图提供当前题目的必要条件",
      facts: [{ text: fact, source, confidence: 0.96 }],
      confidence: 0.97,
    });
    const problem = { ...base, text: "根据题目和配图作答。", visualContext };
    expect(problemEvidenceText(problem)).toContain(fact);
    expect(requiresProblemImage(problem)).toBe(true);
    expect(needsVisualReview(problem)).toBe(false);
  });

  it("装饰图和邻题配图不会进入题目证据", () => {
    const visualContext = parseProblemVisualContext({
      related: false,
      affectsSolving: false,
      summary: "页眉卡通图和邻题插图",
      facts: [{ text: "卡通人物旁写着加油", source: "printed_label", confidence: 0.99 }],
      confidence: 0.99,
    });
    const problem = { ...base, text: "计算 24 除以 6。", visualContext };
    expect(problemEvidenceText(problem)).toBe(problem.text);
    expect(requiresProblemImage(problem)).toBe(false);
  });

  it("模糊标注必须确认，手写答案不能伪装成题设来源", () => {
    const blurry = parseProblemVisualContext({
      related: true,
      affectsSolving: true,
      summary: "关键刻度较模糊",
      facts: [{ text: "刻度疑似为8厘米", source: "printed_label", confidence: 0.61 }],
      confidence: 0.72,
    });
    expect(needsVisualReview({ ...base, visualContext: blurry })).toBe(true);
    expect(() => parseProblemVisualContext({
      related: true,
      affectsSolving: true,
      summary: "学生写了一个答案",
      facts: [{ text: "手写答案为54米", source: "handwriting", confidence: 0.99 }],
      confidence: 0.99,
    })).toThrow("题图事实来源不合法");
  });
});
