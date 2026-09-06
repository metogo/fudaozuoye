// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardErrorBoundary } from "@/components/board-error-boundary";

function Broken(): ReactElement { throw new Error("画布崩溃"); }

describe("板书错误边界", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("正常状态直接呈现子内容", () => {
    render(<BoardErrorBoundary onClose={vi.fn()}><p>正常板书</p></BoardErrorBoundary>);
    expect(screen.getByText("正常板书")).not.toBeNull();
  });

  it("失败时保留学习主线入口，重试后恢复边界状态", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const close = vi.fn();
    const view = render(<BoardErrorBoundary onClose={close}><Broken/></BoardErrorBoundary>);
    expect(screen.getByRole("alert").textContent).toContain("板书暂时没有加载出来");
    fireEvent.click(screen.getByRole("button", { name: "回到主线" }));
    expect(close).toHaveBeenCalledTimes(1);
    view.rerender(<BoardErrorBoundary onClose={close}><p>恢复的板书</p></BoardErrorBoundary>);
    fireEvent.click(screen.getByRole("button", { name: "重试板书" }));
    expect(screen.getByText("恢复的板书")).not.toBeNull();
    expect(error).toHaveBeenCalled();
  });
});
