// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardVisualFigure } from "@/components/board-visual";

const line = vi.fn(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
const circle = vi.fn(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
const rectangle = vi.fn(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
const arc = vi.fn(() => document.createElementNS("http://www.w3.org/2000/svg", "g"));
vi.mock("roughjs", () => ({ default: { svg: vi.fn(() => ({ line, circle, rectangle, arc })) } }));

describe("板书题意示意图", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("渲染题意、依据、非比例提示，并为各类图元绘制稳定图形和标签", async () => {
    const visual = { kind: "geometry", title: "直角三角形", caption: "两条直角边", evidence: "x₁、x₂ 为直角边", elements: [
      { type: "point", x: 10, y: 10, label: "A" }, { type: "line", x: 10, y: 10, x2: 40, y2: 30, label: "x₁" }, { type: "arrow", x: 40, y: 30, x2: 70, y2: 20, label: "方向" },
      { type: "circle", x: 50, y: 30, radius: 8, label: "O" }, { type: "rect", x: 15, y: 40, width: 12, height: 8, label: "条件" }, { type: "arc", x: 20, y: 20, radius: 5, startAngle: 0, endAngle: 90, label: "90°" },
    ] };
    render(<BoardVisualFigure visual={visual as never}/>);
    expect(screen.getByRole("img", { name: "直角三角形：两条直角边" })).not.toBeNull();
    expect(screen.getByText("不按比例")).not.toBeNull();
    await waitFor(() => expect(line).toHaveBeenCalled());
    expect(circle).toHaveBeenCalledTimes(2);
    expect(rectangle).toHaveBeenCalledTimes(1);
    expect(arc).toHaveBeenCalledTimes(1);
    const svg = screen.getByRole("img");
    expect(svg.querySelectorAll("text")).toHaveLength(6);
  });
});
