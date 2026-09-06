// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { SelectionAsk } from "@/components/selection-ask";

function Harness({ disabled = false, onAsk = vi.fn() }: { disabled?: boolean; onAsk?: (text: string, range: Range) => void }) {
  const root = useRef<HTMLDivElement>(null);
  return <><div ref={root}>先读 <span>关键条件</span>，再列式。</div><SelectionAsk root={root} disabled={disabled} onAsk={onAsk}/></>;
}

function selectCondition() {
  const text = screen.getByText("关键条件").firstChild!;
  const range = document.createRange();
  range.setStart(text, 0); range.setEnd(text, text.textContent!.length);
  Object.defineProperty(range, "getClientRects", { value: () => [{ left: 100, top: 200, right: 160, bottom: 220, width: 60, height: 20 }] });
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

describe("选中文字后问一问", () => {
  afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); vi.restoreAllMocks(); });

  it("将当前可见选区与问一问入口、拖拽耳朵关联起来", async () => {
    const ask = vi.fn();
    const rect = { left: 0, top: 0, right: 320, bottom: 400, width: 320, height: 400, x: 0, y: 0, toJSON: () => ({}) };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    render(<Harness onAsk={ask}/>);
    selectCondition();
    await screen.findByRole("button", { name: "针对选中文字问一问" });
    expect(screen.getByRole("button", { name: "拖动调整选区起点" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "拖动调整选区终点" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "针对选中文字问一问" }));
    expect(ask).toHaveBeenCalledWith("关键条件", expect.any(Range));
    expect(screen.queryByRole("button", { name: "针对选中文字问一问" })).toBeNull();
  });

  it("禁用状态、交互控件选区及 Escape 不会错误发起提问", async () => {
    const rect = { left: 0, top: 0, right: 320, bottom: 400, width: 320, height: 400, x: 0, y: 0, toJSON: () => ({}) };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    render(<Harness disabled/>);
    selectCondition();
    await new Promise((resolve) => setTimeout(resolve, 140));
    expect(screen.queryByRole("button", { name: "针对选中文字问一问" })).toBeNull();
    cleanup();
    render(<Harness/>);
    selectCondition();
    await screen.findByRole("button", { name: "针对选中文字问一问" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "针对选中文字问一问" })).toBeNull());
  });
  it("拖动选区耳朵时会按命中的文本位置调整范围，并在释放后恢复提问入口", async () => {
    const rect = { left: 0, top: 0, right: 320, bottom: 400, width: 320, height: 400, x: 0, y: 0, toJSON: () => ({}) };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    render(<Harness/>);
    selectCondition();
    const start = await screen.findByRole("button", { name: "拖动调整选区起点" });
    const text = screen.getByText("关键条件").firstChild!;
    Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: text, offset: 1 }) });
    fireEvent.pointerDown(start, { pointerId: 1, clientX: 100, clientY: 200 });
    expect(screen.queryByRole("button", { name: "针对选中文字问一问" })).toBeNull();
    fireEvent.pointerMove(start, { pointerId: 1, clientX: 110, clientY: 205 });
    fireEvent.pointerUp(start, { pointerId: 1 });
    await screen.findByRole("button", { name: "针对选中文字问一问" });
  });
});
