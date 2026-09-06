// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyableLearningText } from "@/components/copyable-learning-text";
import { buildLearningClipboardContent, writeLearningClipboard } from "@/lib/learning/copy-rich-text";

vi.mock("@/components/lazy-rich-learning-text", () => ({ RichLearningText: ({ text, trailing }: { text: string; trailing?: ReactNode }) => <p>{text}{trailing}</p> }));
vi.mock("@/lib/learning/copy-rich-text", () => ({ buildLearningClipboardContent: vi.fn(), writeLearningClipboard: vi.fn() }));

describe("讲解复制按钮", () => {
  afterEach(() => { cleanup(); vi.resetAllMocks(); });

  it("完整讲解可复制，成功后反馈复制格式", async () => {
    vi.mocked(buildLearningClipboardContent).mockReturnValue({ html: "<p>重点</p>", text: "重点" });
    vi.mocked(writeLearningClipboard).mockResolvedValue("rich");
    render(<CopyableLearningText text="重点" status="complete"/>);
    const button = screen.getByRole("button", { name: "复制讲解" });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("已复制文本"));
    expect(buildLearningClipboardContent).toHaveBeenCalledTimes(1);
  });

  it("复制失败向用户保留可行动的错误，流式内容不展示复制入口", async () => {
    vi.mocked(buildLearningClipboardContent).mockReturnValue({ html: "", text: "重点" });
    vi.mocked(writeLearningClipboard).mockRejectedValue(new Error("剪贴板被拒绝"));
    const view = render(<CopyableLearningText text="重点"/>);
    fireEvent.click(screen.getByRole("button", { name: "复制讲解" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("复制失败：剪贴板被拒绝"));
    view.rerender(<CopyableLearningText text="正在输出" status="streaming"/>);
    expect(screen.queryByRole("button", { name: "复制讲解" })).toBeNull();
  });
});
