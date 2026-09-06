// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/board-learning-content", () => ({ MarkedBoardText: ({ content }: any) => <p>{content}</p>, AnnotationNotes: () => null, BoardSourceTrail: ({ label }: any) => <p>{label}</p> }));
vi.mock("@/components/board-visual-boundary", () => ({ BoardVisualBoundary: () => <div>图示</div> }));
vi.mock("@/components/rich-learning-text", () => ({ RichLearningText: ({ text }: any) => <>{text}</> }));
import { BoardWorkspace } from "@/components/board-workspace";
const scene: any = { id: "s1", role: "derive", title: "列出判别式", tone: "base", medium: "text", purpose: "找到条件", actions: [{ targetId: "text" }], elements: [{ id: "text", type: "text", text: "Δ=b²-4ac" }], evidence: "两个实数根", why: "因为要判断根", selfCheck: "复述判别式", sourceMessageIds: ["m"] };
const props: any = { document: { nodes: [{ id: "n1" }] }, experience: { scenes: [scene], subject: "math", annotations: [] }, sourceMessages: [{ id: "m", text: "原讲解" }], state: { mode: "overview", activeNodeId: null, nodes: [{ nodeId: "n1", revealed: true }] }, onChange: vi.fn() };
describe("BoardWorkspace", () => { beforeEach(() => { Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (fn: any) => { fn(); return 1; } }); Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: vi.fn() }); }); afterEach(cleanup);
 it("呈现教学内容并能切换到主动回忆与恢复原板书", () => { const change = vi.fn(); const { rerender } = render(<div className="board-scroll"><BoardWorkspace {...props} onChange={change}/></div>); expect(screen.getByText("Δ=b²-4ac")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "遮住后复述" })); expect(change).toHaveBeenCalledWith(expect.objectContaining({ mode: "recall", activeNodeId: "n1" })); rerender(<div className="board-scroll"><BoardWorkspace {...props} state={{ mode: "recall", activeNodeId: "n1", nodes: [{ nodeId: "n1", revealed: false }] }} onChange={change}/></div>); expect(screen.getByText("主动回忆")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "查看原板书" })); expect(change).toHaveBeenCalledWith(expect.objectContaining({ mode: "overview" })); });
});
