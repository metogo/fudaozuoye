// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreparationStep } from "@/components/review-step";

const problem = { text: "已知 x²=4，求 x", childWork: "", gradeBand: "junior", subject: "math", userRevised: false };
const callbacks = () => ({ onChange: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn(), onRetake: vi.fn() });

describe("识别结果确认页", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("识别期间展示可理解的阶段进度并可停止", () => {
    vi.useFakeTimers();
    const cb = callbacks();
    render(<PreparationStep phase="recognizing" problem={null} previewUrl="" demo={false} label="正在识别题干" events={[]} busy={false} {...cb}/>);
    expect(screen.getByLabelText("AI 准备进度").textContent).toContain("识别题目");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("1 秒")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "停止识别" }));
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
  });

  it("确认前允许修改题干、补充作答并查看原图", () => {
    const cb = callbacks();
    render(<PreparationStep phase="review" problem={problem as never} previewUrl="blob:question" demo={false} label="" events={[]} busy={false} {...cb}/>);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "修改后的题目" } });
    expect(cb.onChange).toHaveBeenCalledWith(expect.objectContaining({ text: "修改后的题目", userRevised: true }));
    fireEvent.click(screen.getByRole("button", { name: /需要时补充/ }));
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "查看原图" }));
    expect(screen.getByAltText("裁剪后的题目").getAttribute("src")).toBe("blob:question");
    fireEvent.click(screen.getByRole("button", { name: "确认题目，开始学习" }));
    expect(cb.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("演示或分析中不允许改写识别题干", () => {
    render(<PreparationStep phase="analyzing" problem={problem as never} previewUrl="" demo label="正在准备针对讲解" events={["知识起点"]} busy={false} {...callbacks()}/>);
    expect(screen.getByText("正在准备讲解")).not.toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByRole("button", { name: "停止准备" })).not.toBeNull();
  });
});
