// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeachingScene } from "@/components/teaching-scene";

const create = vi.fn();
const suspendUpdate = vi.fn();
const unsuspendUpdate = vi.fn();
const freeBoard = vi.fn();
vi.mock("jsxgraph", () => ({ default: { JSXGraph: { initBoard: vi.fn(() => ({ create, suspendUpdate, unsuspendUpdate })), freeBoard } } }));

describe("可执行教学场景", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  it("把可信场景图元映射为 JSXGraph 原语，并在渲染后隐藏兜底图", async () => {
    const scene = { template: "general", stageIds: ["one", "two"], shapes: [
      { kind: "label", x: 10, y: 20, text: "A", color: "ink" }, { kind: "path", points: [[0, 0], [10, 10]], closed: false, arrow: true, color: "primary" },
      { kind: "path", points: [[0, 0], [10, 0], [5, 8]], closed: true, color: "accent" }, { kind: "circle", x: 20, y: 30, radius: 5, color: "outline" },
      { kind: "line", x1: 0, y1: 0, x2: 10, y2: 20, color: "primary", width: 4 }, { kind: "rect", x: 20, y: 30, width: 10, height: 8, color: "outline", dashed: true },
    ] };
    render(<TeachingScene scene={scene as never} fallbackUrl="/fallback.png" alt="题目示意"/>);
    const root = screen.getByRole("img", { name: "题目示意" });
    expect(root.getAttribute("data-teaching-template")).toBe("general");
    await waitFor(() => expect(create).toHaveBeenCalledTimes(6));
    expect(create.mock.calls.map(([kind]) => kind)).toEqual(["text", "curve", "polygon", "circle", "segment", "polygon"]);
    expect(suspendUpdate).toHaveBeenCalled();
    expect(unsuspendUpdate).toHaveBeenCalled();
    expect(root.querySelector("img")?.hidden).toBe(true);
  });

  it("组件卸载时释放画板资源", async () => {
    const view = render(<TeachingScene scene={{ template: "general", stageIds: [], shapes: [] } as never} fallbackUrl="/fallback.png" alt="题目示意"/>);
    await waitFor(() => expect(suspendUpdate).toHaveBeenCalled());
    view.unmount();
    expect(freeBoard).toHaveBeenCalled();
  });
});
