import { describe, expect, it } from "vitest";
import { conceptGraphDefinition, evaluatePolynomial, functionBoundingBox, geometryBoundingBox } from "@/lib/learning/board-render";
import type { BoardConceptVisual, BoardFunctionVisual, BoardGeometryVisual } from "@/lib/learning/types";

describe("板书可视化转换", () => {
  it("只从受限节点生成 Mermaid 定义并清理分隔符", () => {
    const visual: BoardConceptVisual = { kind: "concept_graph", title: "关系", evidence: "已知条件", caption: "看清关系", direction: "left-right", nodes: [{ id: "given", label: "条件; #一", role: "given" }, { id: "step", label: "核心关系", role: "step" }], edges: [{ from: "given", to: "step", label: "所以|得到" }] };
    const definition = conceptGraphDefinition(visual);
    expect(definition).toContain("flowchart LR");
    expect(definition).not.toContain("; #");
    expect(definition).not.toContain("所以|得到");
  });

  it("按系数顺序计算多项式并生成有限视窗", () => {
    const visual: BoardFunctionVisual = { kind: "function_plot", title: "函数", evidence: "函数图像", caption: "观察变化", domain: [-2, 2], series: [{ id: "f", label: "二次函数", coefficients: [1, 0, -1], color: "emerald" }] };
    expect(evaluatePolynomial([1, 0, -1], 3)).toBe(8);
    expect(functionBoundingBox(visual).every(Number.isFinite)).toBe(true);
  });

  it("根据语义点位自适应几何视窗", () => {
    const visual: BoardGeometryVisual = { kind: "geometry_model", title: "三角形", evidence: "三角形ABC，∠A=90°", caption: "观察边角", points: [{ id: "A", label: "A" }, { id: "B", label: "B" }, { id: "C", label: "C" }], objects: [{ type: "segment", from: "A", to: "B" }, { type: "right_angle", vertex: "A", from: "B", to: "C" }] };
    expect(geometryBoundingBox(visual)).toEqual([-1, 4, 5, -1]);
  });
});
