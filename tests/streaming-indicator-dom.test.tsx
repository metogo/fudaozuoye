// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STREAMING_SILENCE_MS, StreamingIndicator } from "@/components/streaming-indicator";

describe("流式输出指示器", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("准确说明准备、输出与完成状态", () => {
    const view = render(<StreamingIndicator status="starting"/>);
    expect(screen.getByRole("img", { name: "正在准备" }).getAttribute("data-phase")).toBe("starting");
    view.rerender(<StreamingIndicator status="finishing" compact/>);
    const indicator = screen.getByRole("img", { name: "输出完成" });
    expect(indicator.querySelector("svg")).not.toBeNull();
    expect(indicator.className).toContain("compact");
  });

  it("连续输出静默后显示仍在继续提示，状态变更会清理计时器", () => {
    vi.useFakeTimers();
    const view = render(<StreamingIndicator status="streaming"/>);
    const indicator = screen.getByRole("img", { name: "正在输出" });
    expect(indicator.getAttribute("data-waiting")).toBe("false");
    act(() => vi.advanceTimersByTime(STREAMING_SILENCE_MS));
    expect(indicator.getAttribute("data-waiting")).toBe("true");
    view.rerender(<StreamingIndicator status="finishing"/>);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole("img", { name: "输出完成" }).getAttribute("data-waiting")).toBe("false");
  });
});
