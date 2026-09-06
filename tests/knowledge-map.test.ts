import { describe, expect, it } from "vitest";
import { arrangeConcepts, parseKnowledgeMap, parseKnowledgeDetail, parseMapPositions, visibleConceptIds, type ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
import { knowledgeEvidenceSegments, resolveKnowledgeEvidence } from "@/lib/learning/providers/knowledge-map";
import type { LearningSession } from "@/lib/learning/types";

const source = "一元二次方程有两个实数根，求k的范围。";
export function mapFixture(): ProblemKnowledgeMap {
  return { version: 1, rootId: "core", nodes: [
    { id: "core", title: "根与系数的关系", summary: "观察根存在的条件。", application: "先判断根是否存在。", evidence: "有两个实数根" },
    { id: "delta", title: "判别式", summary: "$\\Delta=b^2-4ac$", application: "由实数根得到非负条件。", evidence: "两个实数根" },
    { id: "ineq", title: "一元一次不等式", summary: "乘除负数时不等号反向。", application: "用于解出参数范围。", evidence: "求k的范围" },
    { id: "number", title: "实数运算", summary: "实数的四则运算。", application: "支撑判别式代入与不等式计算。", evidence: "" },
  ], edges: [
    { from: "core", to: "delta", kind: "prerequisite", reason: "判别式判断是否存在实数根。" },
    { from: "core", to: "ineq", kind: "application", reason: "将非负条件转化为参数范围。" },
    { from: "delta", to: "number", kind: "prerequisite", reason: "代入系数要计算平方与乘积。" },
    { from: "ineq", to: "number", kind: "prerequisite", reason: "移项后需要计算。" },
  ] };
}
describe("本题知识图谱", () => {
  it("模型只选编号，由程序回填原文，保留上下标及公式", () => {
    const session = { problem: { text: "x₁²+x₂²=24；有两个实数根。" }, problemGuide: { goal: "求范围", keyClue: "两个实数根", approach: "判别式" } } as LearningSession;
    const segments = knowledgeEvidenceSegments(session);
    const result = resolveKnowledgeEvidence({ nodes: [{ id: "core", evidenceId: segments[0].id }] }, session);
    expect(result.nodes[0].evidence).toBe("x₁²+x₂²=24；");
    expect(() => resolveKnowledgeEvidence({ nodes: [{ evidenceId: "invented" }] }, session)).toThrow("不存在");
  });
  it("接受有共享基础的有向无环图", () => expect(parseKnowledgeMap(mapFixture(), source).nodes).toHaveLength(4));
  it("首屏只需知识结构，但仍核验关系和原题依据", () => {
    const map = { ...mapFixture(), overviewOnly: true };
    map.nodes.forEach(n => { n.summary = ""; n.application = ""; });
    expect(parseKnowledgeMap(map, source).overviewOnly).toBe(true);
    expect(() => parseKnowledgeMap(map, "另一题")).toThrow("原文");
    expect(() => parseKnowledgeMap({ ...map, overviewOnly: false }, source)).toThrow("不完整");
  });
  it("节点详情要求两项有效说明且限制长度", () => {
    expect(parseKnowledgeDetail({ summary: " 定义 ", application: "用途" })).toEqual({ summary: "定义", application: "用途" });
    expect(() => parseKnowledgeDetail({ summary: "", application: "用途" })).toThrow();
    expect(() => parseKnowledgeDetail({ summary: "字".repeat(701), application: "用途" })).toThrow();
  });
  it("不接受其他题的证据", () => expect(() => parseKnowledgeMap(mapFixture(), "长方形面积是多少")).toThrow("原文"));
  it("要求每个直接知识点有本题依据", () => { const m = mapFixture(); m.nodes[1].evidence = ""; expect(() => parseKnowledgeMap(m, source)).toThrow("依据"); });
  it("拒绝循环与孤立节点", () => { const m = mapFixture(); m.edges.push({ from: "number", to: "delta", kind: "prerequisite", reason: "错误循环" }); expect(() => parseKnowledgeMap(m, source)).toThrow("循环"); m.edges = []; expect(() => parseKnowledgeMap(m, source)).toThrow("未关联"); });
  it("拒绝重复、缺失端点与原型键", () => { const m = mapFixture(); m.edges.push(m.edges[0]); expect(() => parseKnowledgeMap(m, source)).toThrow("重复"); m.edges.pop(); m.edges[0].to = "missing"; expect(() => parseKnowledgeMap(m, source)).toThrow("不合法"); m.nodes[0].id = "__proto__"; expect(() => parseKnowledgeMap(m, source)).toThrow("编号"); });
  it("展开与收起尊重共享路径", () => { const m = mapFixture(); expect([...visibleConceptIds(m, new Set(["core"]))]).toEqual(["core", "delta", "ineq"]); expect(visibleConceptIds(m, new Set(["core", "ineq"])).has("number")).toBe(true); expect(visibleConceptIds(m, new Set()).size).toBe(1); });
  it("共享基础位于所有父节点下方", () => { const p = arrangeConcepts(mapFixture()); expect(p.number.y).toBeGreaterThan(p.delta.y); expect(p.delta.y).toBeGreaterThan(p.core.y); expect(p.delta.x).not.toBe(p.ineq.x); });
  it("布局恢复只接受有限、合理坐标，不修改关系", () => { const m = mapFixture(); const original = JSON.stringify(m); const p = parseMapPositions({ core: { x: 91, y: 25 }, delta: { x: Infinity, y: 2 }, number: { x: 1e9, y: 2 } }, m); expect(p.core).toEqual({ x: 91, y: 25 }); expect(p.delta).toEqual(arrangeConcepts(m).delta); expect(p.number).toEqual(arrangeConcepts(m).number); expect(JSON.stringify(m)).toBe(original); });
});
