import { describe, expect, it } from "vitest";
import { assertCurriculumCatalog, curriculumCatalog, isCurriculumAncestor, listConcepts } from "@/lib/learning/curriculum";
import { knowledgeNodeFromBlueprint, parseKnowledgeBlueprints } from "@/lib/learning/providers/blueprint";

const validNode = {
  conceptId: "math.rate.unit-rate",
  evidence: "3小时行驶180千米",
  evidenceSource: "problem" as const,
  simplification: "题目给出“3小时行驶180千米”，先掌握单位量才能知道每小时实际行驶多少。",
  teaching: {
    explanation: "题目给出3小时行驶180千米；单位量就是把总路程平均到1小时，得到每小时路程。",
    example: "若2小时行驶40千米，先算1小时行驶20千米。",
    parentPrompt: "180千米对应3小时，怎样先找到1小时？",
    expectedSignal: "孩子能说出用总路程除以小时数，并解释所得量的单位。",
    misconception: "把5小时误当作已知份数，直接用180除以5。",
    alternateExplanation: "把180千米画成3个相同线段，每段就是1小时的路程。",
  },
  check: {
    prompt: "小车2小时行驶50千米，平均每小时行驶多少千米？",
    type: "choice",
    choices: ["25千米", "48千米", "100千米"],
    answer: "25千米",
    explanation: "50除以2得到每1小时的路程，能单独验证单位量这个概念。",
  },
};

describe("课程目录治理", () => {
  it("覆盖常见数理化概念且所有前置严格更简单", () => {
    expect(() => assertCurriculumCatalog()).not.toThrow();
    expect(curriculumCatalog.filter((item) => item.subject === "math").length).toBeGreaterThanOrEqual(40);
    expect(curriculumCatalog.filter((item) => item.subject === "physics").length).toBeGreaterThanOrEqual(25);
    expect(curriculumCatalog.filter((item) => item.subject === "chemistry").length).toBeGreaterThanOrEqual(25);
    expect(listConcepts("math", "primary").some((item) => item.id === "math.function.logarithmic")).toBe(false);
  });

  it("课程目录拒绝重复、原子冲突与不合法前置关系，并安全终止循环搜索", () => {
    const original = structuredClone(curriculumCatalog);
    try {
      curriculumCatalog.push({ ...curriculumCatalog[0] });
      expect(() => assertCurriculumCatalog()).toThrow("重复概念");
      curriculumCatalog.splice(0, curriculumCatalog.length, ...structuredClone(original));
      curriculumCatalog[0].atomic = !curriculumCatalog[0].atomic;
      expect(() => assertCurriculumCatalog()).toThrow("原子标记");
      curriculumCatalog.splice(0, curriculumCatalog.length, ...structuredClone(original));
      curriculumCatalog[0].prerequisites = ["missing-concept"];
      curriculumCatalog[0].atomic = false;
      expect(() => assertCurriculumCatalog()).toThrow("不存在的前置");
      curriculumCatalog.splice(0, curriculumCatalog.length, ...structuredClone(original));
      const parent = curriculumCatalog.find(item => item.subject !== curriculumCatalog[0].subject)!;
      curriculumCatalog[0].prerequisites = [parent.id]; curriculumCatalog[0].atomic = false;
      expect(() => assertCurriculumCatalog()).toThrow("跨学科");
      curriculumCatalog.splice(0, curriculumCatalog.length, ...structuredClone(original));
      const child = curriculumCatalog.find(item => item.prerequisites.length > 0)!;
      const prerequisite = curriculumCatalog.find(item => item.id === child.prerequisites[0])!;
      prerequisite.difficulty = child.difficulty;
      expect(() => assertCurriculumCatalog()).toThrow("没有严格简化");
      expect(isCurriculumAncestor("不存在", child.id)).toBe(false);
    } finally { curriculumCatalog.splice(0, curriculumCatalog.length, ...original); }
  });
});

describe("题目相关节点蓝图", () => {
  it("把模型内容映射到课程目录权威字段", () => {
    const [blueprint] = parseKnowledgeBlueprints({ nodes: [validNode] }, {
      allowedConceptIds: ["math.rate.unit-rate"],
      evidenceSources: [{ type: "problem", text: "一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？" }],
      min: 1,
      max: 1,
    });
    const node = knowledgeNodeFromBlueprint(blueprint);
    expect(node.title).toBe("单位量");
    expect(node.diagnosticEvidence).toBe("3小时行驶180千米");
    expect(node.check.prompt).toContain("2小时");
  });

  it("拒绝无原文依据、重复概念和答案不在选项中的节点", () => {
    const options = {
      allowedConceptIds: ["math.rate.unit-rate"],
      evidenceSources: [{ type: "problem" as const, text: "一辆车3小时行驶180千米" }],
      min: 1,
      max: 2,
    };
    expect(() => parseKnowledgeBlueprints({ nodes: [{ ...validNode, evidence: "题目没有这句话", simplification: "题目没有这句话，所以先学单位量。" }] }, options)).toThrow(/证据不是/);
    expect(() => parseKnowledgeBlueprints({ nodes: [validNode, validNode] }, options)).toThrow(/重复返回知识点/);
    expect(() => parseKnowledgeBlueprints({ nodes: [{ ...validNode, check: { ...validNode.check, answer: "不存在的选项" } }] }, options)).toThrow(/答案不在选项/);
    expect(() => parseKnowledgeBlueprints({ nodes: [{ ...validNode, evidence: "3小时行驶180千米并证明孩子完全不懂", simplification: "3小时行驶180千米并证明孩子完全不懂，所以先学单位量。" }] }, options)).toThrow(/证据不是/);
    expect(() => parseKnowledgeBlueprints({ nodes: [{ ...validNode, evidence: "多少", simplification: "题目问多少，所以先学单位量才能求每小时。" }] }, { ...options, evidenceSources: [{ type: "problem", text: "每小时多少千米" }] })).toThrow(/过于笼统/);
  });

  it("初始直接前置拒绝把课程上下游概念并列", async () => {
    const { parseKnowledgeSelections } = await import("@/lib/learning/providers/blueprint");
    expect(() => parseKnowledgeSelections({ selections: [
      { conceptId: "math.rate.unit-rate", evidence: "照这样的速度", simplification: "“照这样的速度”要先理解单位量。" },
      { conceptId: "math.ratio.proportional", evidence: "照这样的速度", simplification: "“照这样的速度”对应正比例关系。" },
    ] }, {
      allowedConceptIds: ["math.rate.unit-rate", "math.ratio.proportional"],
      evidenceSources: [{ type: "problem", text: "照这样的速度，5小时行驶多少千米？" }],
      min: 1,
      max: 4,
      rejectAncestorPairs: true,
    })).toThrow(/上下游概念/);
  });

  it("任一候选无依据时拒绝整批并进入同模型修复", async () => {
    const { parseKnowledgeSelections } = await import("@/lib/learning/providers/blueprint");
    const valid = { conceptId: validNode.conceptId, evidence: validNode.evidence, simplification: validNode.simplification };
    expect(() => parseKnowledgeSelections({ selections: [valid, { ...valid, conceptId: "math.arithmetic.multiplication", evidence: "不存在的句子", simplification: "不存在的句子需要先理解乘法的意义。" }] }, {
      allowedConceptIds: ["math.rate.unit-rate", "math.arithmetic.multiplication"],
      evidenceSources: [{ type: "problem", text: "一辆车3小时行驶180千米" }],
      min: 1,
      max: 2,
    })).toThrow(/证据不是/);
  });

  it("安全移除重复干扰项，并在不足两个选项时转为简答题", () => {
    const [blueprint] = parseKnowledgeBlueprints({ nodes: [{ ...validNode, check: { ...validNode.check, choices: ["25千米", "25千米", "100千米"] } }] }, {
      allowedConceptIds: ["math.rate.unit-rate"],
      evidenceSources: [{ type: "problem", text: "一辆车3小时行驶180千米" }],
      min: 1,
      max: 1,
    });
    expect(blueprint.check.choices).toEqual(["25千米", "100千米"]);
    const [shortText] = parseKnowledgeBlueprints({ nodes: [{ ...validNode, check: { ...validNode.check, choices: ["25千米", "25千米"] } }] }, {
      allowedConceptIds: ["math.rate.unit-rate"], evidenceSources: [{ type: "problem", text: "一辆车3小时行驶180千米" }], min: 1, max: 1,
    });
    expect(shortText.check.type).toBe("short_text");
    expect(shortText.check.choices).toBeUndefined();
  });

  it("把格式等价的选择题答案收敛为页面实际提供的选项", () => {
    const [blueprint] = parseKnowledgeBlueprints({ nodes: [{
      ...validNode,
      check: { ...validNode.check, choices: ["20Ω", "2Ω", "200Ω"], answer: "20 Ω" },
    }] }, {
      allowedConceptIds: ["math.rate.unit-rate"],
      evidenceSources: [{ type: "problem", text: "一辆车3小时行驶180千米" }],
      min: 1,
      max: 1,
    });
    expect(blueprint.check.answer).toBe("20Ω");
  });

  it("选择题去重保留正负号，不能把标准答案静默翻转", () => {
    const [blueprint] = parseKnowledgeBlueprints({ nodes: [{
      ...validNode,
      check: { ...validNode.check, choices: ["$-1$", "$1$", "$2$"], answer: "$1$" },
    }] }, {
      allowedConceptIds: ["math.rate.unit-rate"],
      evidenceSources: [{ type: "problem", text: "一辆车3小时行驶180千米" }],
      min: 1,
      max: 1,
    });

    expect(blueprint.check.choices).toEqual(["$-1$", "$1$", "$2$"]);
    expect(blueprint.check.answer).toBe("$1$");
  });
});
