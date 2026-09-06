// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardMathVisual } from "@/components/board-math-visual";

const create = vi.fn(); const zoomIn = vi.fn(); const zoomOut = vi.fn(); const freeBoard = vi.fn(); const initBoard = vi.fn(() => ({ create, zoomIn, zoomOut }));
vi.mock("jsxgraph", () => ({ default: { JSXGraph: { initBoard, freeBoard } } }));

describe("板书数学图形", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  it("用多项式和定义域绘制函数，缩放操作只作用于当前画板", async () => {
    const visual = { kind: "function_plot", title: "函数图像", evidence: "y=x²", caption: "抛物线", domain: [-2, 2], series: [{ id: "f", label: "y=x²", coefficients: [1, 0, 0], color: "emerald" }] };
    render(<BoardMathVisual visual={visual as never}/>);
    await waitFor(() => expect(create).toHaveBeenCalledWith("functiongraph", expect.any(Array), expect.objectContaining({ name: "y=x²" })));
    fireEvent.click(screen.getByRole("button", { name: "放大图形" })); fireEvent.click(screen.getByRole("button", { name: "缩小图形" }));
    expect(zoomIn).toHaveBeenCalled(); expect(zoomOut).toHaveBeenCalled();
  });
  it("绘制几何点、边、角、圆及对应标签", async () => {
    const visual = { kind: "geometry_model", title: "直角三角形", evidence: "两条直角边", caption: "勾股", points: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], objects: [{ type: "segment", from: "a", to: "b", label: "x" }, { type: "arrow", from: "b", to: "c" }, { type: "right_angle", from: "b", vertex: "a", to: "c" }, { type: "angle", from: "a", vertex: "b", to: "c", label: "θ" }, { type: "circle", center: "a", through: "b", label: "圆" }] };
    render(<BoardMathVisual visual={visual as never}/>);
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls.map(([kind]) => kind)).toEqual(expect.arrayContaining(["point", "segment", "arrow", "angle", "circle", "text"]));
  });
  it("渲染器加载失败时保留可继续阅读的兜底信息", async () => {
    initBoard.mockImplementationOnce(() => { throw new Error("failed"); });
    render(<BoardMathVisual visual={{ kind: "function_plot", title: "函数", evidence: "题干", caption: "图", domain: [0, 1], series: [] } as never}/>);
    expect((await screen.findByRole("status")).textContent).toContain("图形暂时无法加载");
  });
});
