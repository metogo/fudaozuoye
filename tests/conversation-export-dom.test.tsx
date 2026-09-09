// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationExport } from "@/components/conversation-export";

describe("导出对话预览", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn() });
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("保存窗口失败会留在预览中给出可行动的替代说明，取消会关闭预览", async () => {
    const close = vi.fn();
    vi.stubGlobal("print", vi.fn(() => { throw new Error("blocked"); }));
    render(<ConversationExport messages={[]} session={null} onClose={close}/>);
    const save = await screen.findByRole("button", { name: "保存为 PDF" });
    fireEvent.click(save);
    expect(screen.getByRole("status").textContent).toContain("未能打开保存窗口");
    fireEvent.keyDown(document.querySelector("dialog")!, { key: "Escape" });
    fireEvent(document.querySelector("dialog")!, new Event("cancel", { cancelable: true }));
    expect(close).toHaveBeenCalled();
  });
});
