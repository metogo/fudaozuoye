// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatThinking } from "@/components/chat-thinking";
import { CommaCompanion } from "@/components/comma-companion";

describe("思考状态与小逗号形象", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("把模型阶段转译为稳定、可访问的思考提示", () => {
    render(<ChatThinking active label="正在读题"/>);
    expect(screen.getByRole("status", { name: "小逗号正在思考" }).textContent).toContain("正在读懂这道题");
    expect(screen.getByText("识别题目条件，整理问题要求。")).not.toBeNull();
    expect(screen.getByLabelText("学习寄语")).not.toBeNull();
    expect(document.querySelector(".comma-companion")?.getAttribute("data-state")).toBe("thinking");
  });

  it("阶段变化会更新文案，结束时保留短暂退场再卸载", async () => {
    const view = render(<ChatThinking active label="正在准备讲解"/>);
    expect(screen.getByText("正在梳理解题思路")).not.toBeNull();
    view.rerender(<ChatThinking active={false} label=""/>);
    await waitFor(() => expect(document.querySelector("[data-exiting]")?.getAttribute("aria-hidden")).toBe("true"));
    await waitFor(() => expect(screen.queryByRole("status", { name: "小逗号正在思考" })).toBeNull(), { timeout: 500 });
  });

  it("完成思考后小逗号短暂呈现庆祝姿态，随后回到待命", () => {
    vi.useFakeTimers();
    const view = render(<CommaCompanion thinking canCelebrate/>);
    const companion = screen.getByRole("img", { name: "专注作业" });
    expect(companion.getAttribute("data-state")).toBe("thinking");
    view.rerender(<CommaCompanion thinking={false} canCelebrate/>);
    expect(companion.getAttribute("data-state")).toBe("ready");
    act(() => vi.advanceTimersByTime(1601));
    expect(companion.getAttribute("data-state")).toBe("idle");
  });
});
