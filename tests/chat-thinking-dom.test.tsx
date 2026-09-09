// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatThinking } from "@/components/chat-thinking";
import { CommaCompanion } from "@/components/comma-companion";
import { UiLanguageProvider } from "@/components/ui-language";
import { UI_LOCALE_KEY } from "@/lib/ui-copy";

describe("思考状态与小逗号形象", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.removeItem(UI_LOCALE_KEY); });

  it("把模型阶段转译为稳定、可访问的思考提示", () => {
    render(<ChatThinking active label="正在读题"/>);
    expect(screen.getByRole("status", { name: "小逗号正在思考" }).textContent).toContain("正在读懂这道题");
    expect(screen.getByText("识别题目条件，整理问题要求。")).not.toBeNull();
    expect(screen.queryByLabelText("学习寄语")).toBeNull();
    expect(document.querySelector(".chat-thinking-border")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(document.querySelector(".comma-companion")?.getAttribute("data-state")).toBe("thinking");
  });

  it("等待时间不会伪造阶段进度，只有真实标签变化才更新提示", () => {
    vi.useFakeTimers();
    const view = render(<ChatThinking active label="正在读题"/>);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("正在读懂这道题")).not.toBeNull();
    expect(screen.queryByText("正在梳理解题思路")).toBeNull();
    view.rerender(<ChatThinking active label="正在准备讲解"/>);
    expect(screen.getByText("正在梳理解题思路")).not.toBeNull();
  });

  it("英文界面显示英文等待提示，不夹带中文寄语", async () => {
    localStorage.setItem(UI_LOCALE_KEY, "en");
    render(<UiLanguageProvider><ChatThinking active label="正在读题"/></UiLanguageProvider>);
    expect(await screen.findByRole("status", { name: "Comma is thinking" })).not.toBeNull();
    expect(screen.getByText("Reading your question")).not.toBeNull();
    expect(screen.queryByText("小逗号正在思考")).toBeNull();
  });

  it("未激活时不占位，快速开始下一次等待不会被旧退场计时器移除", () => {
    vi.useFakeTimers();
    const view = render(<ChatThinking active={false} label=""/>);
    expect(document.querySelector(".chat-thinking")).toBeNull();
    view.rerender(<ChatThinking active label="正在读题"/>);
    view.rerender(<ChatThinking active={false} label=""/>);
    view.rerender(<ChatThinking active label="正在准备讲解"/>);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText("正在梳理解题思路")).not.toBeNull();
    expect(document.querySelector(".chat-thinking")?.getAttribute("aria-hidden")).toBe("false");
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
