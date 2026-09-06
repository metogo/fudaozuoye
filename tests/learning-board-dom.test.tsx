// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/board-workspace", () => ({ BoardWorkspace: () => <div>板书内容</div> }));
vi.mock("@/components/board-visual", () => ({ BoardVisualFigure: () => <div>旧图示</div> }));
vi.mock("@/components/rich-learning-text", () => ({ RichLearningText: ({ text }: any) => <>{text}</> }));
import { LearningBoard } from "@/components/learning-board";

const props: any = { experience: { title: "判别式板书", returnLabel: "回到判别式", quality: { status: "safe_fallback", reason: "缺少充分依据" }, scenes: [], legacyVisual: { kind: "relation" } }, document: {}, workspaceState: {}, sourceMessages: [], messages: [{ id: "u", role: "user", kind: "user", text: "为什么", surface: "board", status: "complete" }, { id: "a", role: "assistant", kind: "assistant", text: "因为判别式", surface: "board", status: "complete" }], busy: false, loadingLabel: "", notice: "网络短暂中断", retryLabel: "重试", onWorkspaceChange: vi.fn(), onAsk: vi.fn(), onRegenerate: vi.fn(), onClose: vi.fn(), onRetry: vi.fn() };
describe("LearningBoard", () => {
 beforeEach(() => { Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { observe() {} disconnect() {} } }); Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", { configurable: true, value: () => ({ height: 50 }) }); });
 afterEach(cleanup);
 it("打开问答面板后可以提问、重试并通过 Escape 返回", () => { const p = { ...props, onAsk: vi.fn(), onRetry: vi.fn(), onClose: vi.fn() }; render(<LearningBoard {...p}/>); fireEvent.click(screen.getByRole("button", { name: /板书问答/ })); expect(screen.getByText("因为判别式")).not.toBeNull(); const input = screen.getByLabelText("围绕当前板书提问"); fireEvent.change(input, { target: { value: "为什么非负" } }); fireEvent.submit(input.closest("form")!); expect(p.onAsk).toHaveBeenCalledWith("为什么非负"); fireEvent.click(screen.getByRole("button", { name: "重试" })); expect(p.onRetry).toHaveBeenCalled(); fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(p.onClose).toHaveBeenCalled(); });
 it("安全降级提示允许重新生成完整板书", () => { const regenerate = vi.fn(); render(<LearningBoard {...props} onRegenerate={regenerate}/>); fireEvent.click(screen.getByRole("button", { name: "重试完整板书" })); expect(regenerate).toHaveBeenCalled(); });
 it("忙碌完成后提示未读回答，展开面板可查看流式状态", () => { const { rerender } = render(<LearningBoard {...props} busy loadingLabel="正在回答" notice="" retryLabel=""/>); rerender(<LearningBoard {...props} busy={false} loadingLabel="" notice="" retryLabel=""/>); expect(screen.getByLabelText("有新的板书回答")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: /板书问答/ })); expect(screen.getByText("因为判别式")).not.toBeNull(); });
 it("等待模型时保留板书上下文，并且只展示最近的问答", () => {
   const messages = Array.from({ length: 8 }, (_, index) => ({ id: `m${index}`, role: "user", kind: "user", text: `内容${index}`, surface: "board", status: "complete" }));
   render(<LearningBoard {...props} messages={messages} busy loadingLabel="正在整理理由" notice="" retryLabel=""/>);
   fireEvent.click(screen.getByRole("button", { name: /板书问答/ }));
   expect(screen.getAllByRole("status").some((item) => item.textContent?.includes("正在整理理由"))).toBe(true);
   expect(screen.queryByText("内容0")).toBeNull();
   expect(screen.getByText("内容7")).not.toBeNull();
 });
});
