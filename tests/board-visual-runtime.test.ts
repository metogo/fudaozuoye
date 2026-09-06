import { describe, expect, it } from "vitest";
import { isUsefulBoardVisual } from "@/lib/learning/board-visual-runtime";

const base = { title: "关系", evidence: "题干条件", caption: "先找关系" };

describe("板书语义图形运行时校验", () => {
  it.each([
    { ...base, kind: "formula_chain", steps: [{ id: "a", expression: "a+b", explanation: "列式" }, { id: "b", expression: "=3", explanation: "求值" }] },
    { ...base, kind: "concept_graph", direction: "top-down", nodes: [{ id: "a", label: "已知", role: "given" }, { id: "b", label: "关系", role: "relation" }], edges: [{ from: "a", to: "b" }] },
    { ...base, kind: "evidence_chain", links: [{ id: "a", quote: "已知", meaning: "条件" }, { id: "b", quote: "所以", meaning: "结论" }] },
    { ...base, kind: "geometry_model", points: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], objects: [{ type: "segment", from: "a", to: "b" }, { type: "right_angle", vertex: "a", from: "b", to: "c" }, { type: "circle", center: "a", radius: 3 }] },
    { ...base, kind: "function_plot", series: [{ id: "f", label: "y=x", coefficients: [1, 0], color: "emerald" }], domain: [-1, 1] },
    { ...base, kind: "timeline", events: [{ id: "a", time: "先", event: "观察" }, { id: "b", time: "后", event: "计算" }] },
    { ...base, kind: "process_flow", steps: [{ id: "a", label: "读题", evidence: "条件" }, { id: "b", label: "列式", evidence: "关系" }] },
    { ...base, kind: "comparison_matrix", columns: ["左", "右"], rows: [{ id: "a", aspect: "条件", left: "x", right: "y" }] },
  ])("接受可直接辅助理解的 $kind 图形", (visual) => expect(isUsefulBoardVisual(visual)).toBe(true));

  it.each([
    null,
    { ...base, kind: "formula_chain", steps: [{ id: "same", expression: "x", explanation: "a" }, { id: "same", expression: "y", explanation: "b" }] },
    { ...base, kind: "concept_graph", direction: "diagonal", nodes: [{ id: "a", label: "A", role: "given" }, { id: "b", label: "B", role: "step" }], edges: [{ from: "a", to: "b" }] },
    { ...base, kind: "geometry_model", points: [{ id: "a", label: "A" }, { id: "b", label: "B" }], objects: [{ type: "segment", from: "a", to: "missing" }] },
    { ...base, kind: "function_plot", series: [{ id: "f", label: "f", coefficients: [1], color: "blue" }], domain: [1, 1] },
    { ...base, kind: "comparison_matrix", columns: ["仅一列"], rows: [{ id: "a", aspect: "a", left: "b", right: "c" }] },
  ])("拒绝不完整、矛盾或无法解释的图形", (visual) => expect(isUsefulBoardVisual(visual)).toBe(false));
});
