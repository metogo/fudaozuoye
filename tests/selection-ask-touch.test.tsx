// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SelectionAsk } from "@/components/selection-ask";

function Harness({ ask, disabled = false }: { ask: (text: string, range: Range) => void; disabled?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  return <><div ref={root} data-testid="body"><article className="chat-message"><div className="copyable-learning-text__prose"><p>先找条件，再列式。</p></div></article></div><SelectionAsk root={root} disabled={disabled} onAsk={ask}/></>;
}
const finger = { identifier: 7, clientX: 100, clientY: 130 };
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 600 } as DOMRect);
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [{ left: 30, right: 300, top: 180, bottom: 220, width: 270, height: 40 }] });
});
afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); vi.restoreAllMocks(); vi.useRealTimers(); });
function select() {
  const range = document.createRange(); range.selectNodeContents(screen.getByText("先找条件，再列式。"));
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  fireEvent(document, new Event("selectionchange"));
  act(() => vi.advanceTimersByTime(125));
  return screen.getByRole("button", { name: "针对选中文字问一问" });
}

it.each([false, true])("触摸按钮后原生选区被收起仍能打开正确引用，先有 pointerdown=%s", pointer => {
  const ask = vi.fn(); render(<Harness ask={ask}/>); const button = select();
  if (pointer) fireEvent.pointerDown(button, { pointerType: "touch", pointerId: 1 });
  fireEvent.touchStart(button, { touches: [finger] });
  window.getSelection()!.removeAllRanges(); fireEvent(document, new Event("selectionchange"));
  act(() => vi.advanceTimersByTime(150));
  expect(screen.queryByRole("button", { name: "针对选中文字问一问" })).not.toBeNull();
  fireEvent.touchEnd(button, { touches: [], changedTouches: [finger] });
  expect(ask).toHaveBeenCalledWith("先找条件，再列式。", expect.any(Range));
  expect(ask).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "针对选中文字问一问" })).toBeNull();
  fireEvent.click(button); expect(ask).toHaveBeenCalledTimes(1);
});

it.each(["move", "end-move", "cancel", "scroll", "multi", "long", "disabled"])("触摸 %s 后不会提交缓存的旧引用", mode => {
  const ask = vi.fn(); const view = render(<Harness ask={ask}/>); const button = select();
  fireEvent.touchStart(button, { touches: [finger] });
  window.getSelection()!.removeAllRanges();
  if (mode === "move") fireEvent.touchMove(button, { touches: [{ ...finger, clientY: 170 }] });
  if (mode === "cancel") fireEvent.touchCancel(button);
  if (mode === "scroll") fireEvent.scroll(screen.getByTestId("body"));
  if (mode === "multi") fireEvent.touchStart(document.body, { touches: [finger, { ...finger, identifier: 8 }] });
  if (mode === "long") act(() => vi.advanceTimersByTime(600));
  if (mode === "disabled") view.rerender(<Harness ask={ask} disabled/>);
  fireEvent.touchEnd(button, { touches: [], changedTouches: [{ ...finger, clientY: mode === "end-move" ? 170 : 130 }] });
  act(() => vi.advanceTimersByTime(150));
  expect(ask).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "针对选中文字问一问" })).toBeNull();
});

it("鼠标和键盘 click 仍读取最新选区，触摸完成后可再次选择提问", () => {
  const ask = vi.fn(); render(<Harness ask={ask}/>); const button = select();
  fireEvent.touchStart(button, { touches: [finger] });
  fireEvent.touchEnd(button, { touches: [], changedTouches: [finger] });
  const next = select(); fireEvent.click(next, { detail: 0 });
  expect(ask).toHaveBeenCalledTimes(2);
});

it("滑动取消后即使原生选区还在，迟到的合成 click 也不会打开引用框", () => {
  const ask = vi.fn(); render(<Harness ask={ask}/>); const button = select();
  fireEvent.touchStart(button, { touches: [finger] });
  fireEvent.touchMove(button, { touches: [{ ...finger, clientY: 180 }] });
  fireEvent.touchEnd(button, { touches: [], changedTouches: [finger] });
  fireEvent.click(button, { detail: 1 });
  expect(ask).not.toHaveBeenCalled();
});

it("按下按钮前已清空选区，不会复用上一次引用", () => {
  const ask = vi.fn(); render(<Harness ask={ask}/>); const button = select();
  window.getSelection()!.removeAllRanges();
  fireEvent.touchStart(button, { touches: [finger] });
  fireEvent.touchEnd(button, { touches: [], changedTouches: [finger] });
  expect(ask).not.toHaveBeenCalled();
});
