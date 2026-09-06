// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({ default: () => ({ visual }: { visual: { kind: string } }) => <div data-dynamic-visual={visual.kind}/> }));
import { BoardSceneVisual } from "@/components/board-scene-visual";

const base = { title: "关系", caption: "理解关系", evidence: "来自题干" };

describe("学科语义板书图形", () => {
  afterEach(cleanup);
  it.each([
    [{ ...base, kind: "formula_chain", steps: [{ id: "a", expression: "a=b", explanation: "列式" }, { id: "b", expression: "b=c", explanation: "推导" }] }, "公式脉络", "a=b"],
    [{ ...base, kind: "concept_graph", direction: "top-down", nodes: [], edges: [] }, "关系图", "concept_graph"],
    [{ ...base, kind: "geometry_model", points: [], objects: [] }, "可交互几何", "geometry_model"],
    [{ ...base, kind: "function_plot", series: [], domain: [0, 1] }, "函数图像", "function_plot"],
    [{ ...base, kind: "evidence_chain", links: [{ id: "a", quote: "条件", meaning: "结论" }, { id: "b", quote: "条件2", meaning: "结论2" }] }, "证据链", "条件"],
    [{ ...base, kind: "timeline", events: [{ id: "a", time: "先", event: "观察" }, { id: "b", time: "后", event: "结论" }] }, "时间线", "观察"],
    [{ ...base, kind: "process_flow", steps: [{ id: "a", label: "读取", evidence: "题干" }, { id: "b", label: "计算", evidence: "关系" }] }, "过程链", "读取"],
    [{ ...base, kind: "comparison_matrix", columns: ["左", "右"], rows: [{ id: "a", aspect: "条件", left: "x", right: "y" }] }, "对比矩阵", "条件"],
  ])("用恰当可读布局呈现 %s", (visual, label, content) => {
    render(<BoardSceneVisual visual={visual as never} purpose="看懂已知条件" primary={visual.kind === "formula_chain"}/>);
    expect(screen.getByText(label)).not.toBeNull();
    if (content.includes("_")) expect(document.querySelector(`[data-dynamic-visual="${content}"]`)).not.toBeNull();
    else expect(screen.getByText(content)).not.toBeNull();
    expect(screen.getByText("题目依据")).not.toBeNull();
  });
});
