// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
let explode = false;
vi.mock("@/components/board-scene-visual", () => ({ BoardSceneVisual: ({ visual }: any) => { if (explode) throw new Error("draw failed"); return <div>图示 {visual.title}</div>; } }));
import { BoardVisualBoundary } from "@/components/board-visual-boundary";
const visual: any = { kind: "formula_chain", title: "公式", evidence: "条件", caption: "说明", steps: [{ id: "s", expression: "a=b", explanation: "列式" }] };
describe("BoardVisualBoundary", () => { afterEach(() => { explode = false; vi.restoreAllMocks(); });
 it("正常渲染，失败后显示正文降级，并在切换 visual 后恢复", () => { const spy = vi.spyOn(console, "error").mockImplementation(() => undefined); const view = render(<BoardVisualBoundary visual={visual} fallbackText="文字"/>); expect(screen.getByText("图示 公式")).not.toBeNull(); explode = true; view.rerender(<BoardVisualBoundary visual={{ ...visual }} fallbackText="文字"/>); expect(screen.getByRole("status").textContent).toContain("图示暂时无法显示"); explode = false; view.rerender(<BoardVisualBoundary visual={{ ...visual, title: "新公式" }} fallbackText="文字"/>); expect(screen.getByText("图示 新公式")).not.toBeNull(); spy.mockRestore(); });
});
