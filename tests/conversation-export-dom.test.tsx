// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationDocument, ConversationExport } from "@/components/conversation-export";
import type { ConversationExportSnapshot } from "@/lib/learning/conversation-export";

const snapshot = {
  exportedAt: "2026-09-06T12:34:56.000Z",
  filename: "专注作业-对话记录-20260906",
  problem: { text: "求 $x^2=4$", childWork: "我先想到开方" },
  messages: [{
    id: "m1", role: "assistant" as const, kind: "assistant" as const, text: "重点是 **两边开方**。", createdAt: "2026-09-06T12:35:00.000Z", scopeLabel: "关键线索", status: "complete" as const,
    imageUrl: "data:image/png;base64,abc", surface: "chat" as const,
    reference: { scopeLabel: "原题", sourceSummary: "x² = 4" }, suggestions: [{ text: "为什么有正负？", scopeLabel: "关键线索" }],
  }],
  task: { title: "完成一个关键空", prompt: "填入正确符号", stepBlank: { before: "x", after: "4", hint: "想想开方" }, revealedAnswer: "= ±2" },
} satisfies ConversationExportSnapshot;

describe("对话 PDF 导出", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("按可阅读顺序呈现原题、引用、完整对话和当前学习任务", () => {
    render(<ConversationDocument snapshot={snapshot}/>);
    expect(screen.getByRole("article", { name: "完整对话导出内容" }).textContent).toContain("把思路，留在纸上。");
    expect(screen.getByText("原题")).not.toBeNull();
    expect(screen.getByText("已有作答")).not.toBeNull();
    expect(screen.getByText("猜你想问")).not.toBeNull();
    expect(screen.getByText("= ±2")).not.toBeNull();
    expect(screen.getByAltText("本条记录中的题目或作答图片").getAttribute("src")).toMatch(/^data:image/);
  });

  it("打开预览后等待资源，保存时调用系统打印并可关闭", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
    HTMLDialogElement.prototype.close = vi.fn();
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
    const print = vi.fn();
    Object.defineProperty(window, "print", { configurable: true, value: print });
    const onClose = vi.fn();
    render(<ConversationExport messages={snapshot.messages as never} session={null} onClose={onClose}/>);
    await waitFor(() => expect(screen.getByRole("button", { name: "保存为 PDF" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "保存为 PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "关闭导出预览" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
