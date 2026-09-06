import { describe, expect, it } from "vitest";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { boardPlanSchema, boardPlanVisibleText, parseBoardPlan } from "@/lib/learning/providers/board-plan";
import { createNativeBoardBlocks, createNativeBoardFallbackPlan } from "@/lib/learning/board-native-fallback";
import type { BoardBlock, LearningSession } from "@/lib/learning/types";

const blocks: BoardBlock[] = [
  { id: "b1", label: "先看条件", content: "先把原题中给出的条件逐项对应起来。", tone: "plain" },
  { id: "b2", label: "再看关系", content: "再用题目给出的关系完成下一步判断。", tone: "key" },
];

function current(evidence: string): LearningSession {
  const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
  session.problem.text = evidence;
  return session;
}

function plan(visual: Record<string, unknown>) {
  return {
    learningGoal: "把题目中的条件和关系看清楚。",
    sourceMessageIds: [],
    scenes: [
      { intent: "extract", sourceMessageIds: [], visual },
      { intent: "derive", sourceMessageIds: [], visual: { kind: "none", title: "", evidence: "", caption: "" } },
    ],
  };
}

function common(kind: string, evidence: string) {
  return { kind, title: "条件关系", evidence, caption: "只整理题目明确给出的信息。" };
}

describe("板书受限语义图解析", () => {
  it("Schema 可按场景选择是否允许图形字段", () => {
    const withVisual = boardPlanSchema();
    const withoutVisual = boardPlanSchema({ includeVisuals: false });
    expect(((withVisual.properties as any).scenes.items.required as string[])).toContain("visual");
    expect(((withoutVisual.properties as any).scenes.items.required as string[])).not.toContain("visual");
  });

  it("解析公式链，并在可见文本中保留公式和说明", () => {
    const evidence = "已知 $x+1=3$，需要解出未知数。";
    const result = parseBoardPlan(plan({ ...common("formula_chain", evidence), steps: [
      { id: "s1", expression: "$x+1=3$", explanation: "先保留已知等式" },
      { id: "s2", expression: "$x=2$", explanation: "两边同时减去1" },
    ] }), current(evidence), blocks, []);
    expect(result.scenes[0].visual?.kind).toBe("formula_chain");
    expect(boardPlanVisibleText(result)).toContain("x=2");
  });

  it("解析由原题支持的关系图与中性连线", () => {
    const evidence = "总量和份数对应，单位量由总量除以份数得到。";
    const result = parseBoardPlan(plan({ ...common("concept_graph", evidence), direction: "left-right", nodes: [
      { id: "total", label: "总量", role: "given" }, { id: "part", label: "份数", role: "given" }, { id: "unit", label: "单位量", role: "relation" },
    ], edges: [{ from: "total", to: "unit", label: "对应" }, { from: "part", to: "unit", label: "对应" }] }), current(evidence), blocks, []);
    expect(result.scenes[0].visual).toMatchObject({ kind: "concept_graph", direction: "left-right" });
  });

  it("解析逐字引用材料的证据链、过程链和时间线", () => {
    const evidence = "1898年改革开始。1900年相关措施停止。先观察光照，再记录植物生长。";
    const source = current(evidence);
    const chain = parseBoardPlan(plan({ ...common("evidence_chain", evidence), links: [
      { id: "l1", quote: "1898年改革开始", meaning: "确定开始时间" }, { id: "l2", quote: "1900年相关措施停止", meaning: "确定结束时间" },
    ] }), source, blocks, []);
    const process = parseBoardPlan(plan({ ...common("process_flow", evidence), steps: [
      { id: "p1", label: "观察光照", evidence: "先观察光照" }, { id: "p2", label: "记录生长", evidence: "记录植物生长" },
    ] }), source, blocks, []);
    const timeline = parseBoardPlan(plan({ ...common("timeline", evidence), events: [
      { id: "t1", time: "1898年", event: "1898年改革开始" }, { id: "t2", time: "1900年", event: "1900年相关措施停止" },
    ] }), source, blocks, []);
    expect(chain.scenes[0].visual?.kind).toBe("evidence_chain");
    expect(process.scenes[0].visual?.kind).toBe("process_flow");
    expect(timeline.scenes[0].visual?.kind).toBe("timeline");
  });

  it("解析受原题约束的对比矩阵", () => {
    const evidence = "甲方案成本较低，乙方案成本较高。";
    const result = parseBoardPlan(plan({ ...common("comparison_matrix", evidence), columns: ["甲方案", "乙方案"], rows: [
      { id: "r1", aspect: "成本", left: "甲方案成本较低", right: "乙方案成本较高" },
    ] }), current(evidence), blocks, []);
    expect(result.scenes[0].visual).toMatchObject({ kind: "comparison_matrix", columns: ["甲方案", "乙方案"] });
  });

  it("解析有明确直角依据的几何模型", () => {
    const evidence = "在△ABC中，∠A=90°。";
    const result = parseBoardPlan(plan({ ...common("geometry_model", evidence), points: [
      { id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" },
    ], objects: [
      { type: "segment", from: "a", to: "b" }, { type: "segment", from: "a", to: "c" }, { type: "right_angle", vertex: "a", from: "b", to: "c" },
    ] }), current(evidence), blocks, []);
    expect(result.scenes[0].visual?.kind).toBe("geometry_model");
  });

  it("解析与原题多项式及定义域一致的函数图", () => {
    const evidence = "f=x^2，定义域为[-2,2]。";
    const result = parseBoardPlan(plan({ ...common("function_plot", evidence), domain: [-2, 2], series: [
      { id: "f", label: "f", coefficients: [1, 0, 0], color: "emerald" },
    ] }), current(evidence), blocks, []);
    expect(result.scenes[0].visual).toMatchObject({ kind: "function_plot", domain: [-2, 2] });
  });

  it("新版板书会按当前学科蓝图复核每个教学动作", () => {
    const session = current("总量180千米，3小时行驶完，求每小时行驶多少千米。");
    const nativeBlocks = createNativeBoardBlocks(session, { kind: "problem" });
    const fallback = createNativeBoardFallbackPlan(session, nativeBlocks);
    const input = {
      ...fallback,
      scenes: fallback.scenes.map((scene) => ({
        intent: scene.intent, role: scene.role, move: scene.move,
        purpose: scene.purpose, evidence: scene.evidence, why: scene.why,
        selfCheck: scene.selfCheck, sourceMessageIds: [],
        visual: { kind: "none", title: "", evidence: "", caption: "" },
      })),
    };
    const parsed = parseBoardPlan(input, session, nativeBlocks, []);
    expect(parsed.scenes).toHaveLength(nativeBlocks.length);
    expect(parsed.scenes.map((scene) => scene.role)).toEqual(expect.arrayContaining(["orient", "reason"]));
    expect(() => parseBoardPlan({ ...input, discipline: "physics" }, session, nativeBlocks, [])).toThrow("板书学科必须与当前题目一致");
  });
});
