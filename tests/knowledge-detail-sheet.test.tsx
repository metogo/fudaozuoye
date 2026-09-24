// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KnowledgeDetailSheet } from "@/components/knowledge-detail-sheet";

let available = 700;
let resize: () => void;
const disconnect = vi.fn();
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}
beforeEach(() => {
  available = 700;
  disconnect.mockClear();
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains("knowledge-detail-slot") ? 350 : this.classList.contains("knowledge-detail-sheet") ? Number.parseFloat(this.style.height) || 350 : available;
    return { x: 0, y: available - height, top: available - height, bottom: available, left: 0, right: 390, width: 390, height, toJSON() {} };
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const onClose = vi.fn();
  const view = render(<div><KnowledgeDetailSheet title="三角形面积" onClose={onClose}><div data-testid="reading">公式与讲解<input aria-label="练习答案" defaultValue="未提交的答案"/></div></KnowledgeDetailSheet></div>);
  const panel = screen.getByRole("region", { name: "三角形面积的知识说明" });
  const handle = screen.getByRole("button", { name: "展开知识卡片" });
  return { ...view, onClose, panel, handle };
}
function drag(handle: HTMLElement, from: number, to: number, pointerType = "touch") {
  fireEvent.pointerDown(handle, { clientY: from, pointerId: 1, button: 0, pointerType });
  fireEvent.pointerMove(handle, { clientY: to, pointerId: 1, pointerType });
  fireEvent.pointerUp(handle, { clientY: to, pointerId: 1, pointerType });
  fireEvent.click(handle, { detail: 1 });
}
it.each(["touch", "mouse", "pen"])("%s 上拉展开，下拉回半屏，拖动后的 click 不反向切换", pointerType => {
  const { handle, panel, onClose } = setup();
  expect(panel.style.height).toBe("350px");
  drag(handle, 550, 250, pointerType);
  expect(handle.getAttribute("aria-expanded")).toBe("true");
  expect(panel.style.height).toBe("676px");
  drag(handle, 250, 550, pointerType);
  expect(panel.style.height).toBe("350px");
  expect(onClose).not.toHaveBeenCalled();
});
it("轻点和键盘可切换；向上和向下方向键明确控制高度", () => {
  const { handle, panel } = setup();
  fireEvent.click(handle);
  expect(panel.style.height).toBe("676px");
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  expect(panel.style.height).toBe("350px");
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  expect(panel.style.height).toBe("676px");
  fireEvent.click(handle);
  expect(panel.style.height).toBe("350px");
});
it("边界有阻尼，拉过头不会让面板和关闭按钮飞出屏幕", () => {
  const { handle, panel } = setup();
  fireEvent.pointerDown(handle, { clientY: 400 });
  fireEvent.pointerMove(handle, { clientY: -2000 });
  expect(Number.parseFloat(panel.style.height)).toBe(688);
  fireEvent.pointerMove(handle, { clientY: 2000 });
  expect(Number.parseFloat(panel.style.height)).toBe(330);
});
it.each(["pointerCancel", "lostPointerCapture"] as const)("%s 恢复原高度而不是关闭", event => {
  const { handle, panel, onClose } = setup();
  fireEvent.pointerDown(handle, { clientY: 550 });
  fireEvent.pointerMove(handle, { clientY: 250 });
  fireEvent[event](handle);
  expect(panel.style.height).toBe("350px");
  expect(panel.dataset.dragging).toBe("false");
  expect(onClose).not.toHaveBeenCalled();
});
it("正文滚动不触发拖动，切换高度保留阅读位置和练习输入", () => {
  const { handle, panel } = setup();
  const reading = screen.getByTestId("reading");
  const body = reading.parentElement!;
  body.scrollTop = 120;
  fireEvent.pointerDown(reading, { clientY: 500 });
  fireEvent.pointerMove(reading, { clientY: 200 });
  fireEvent.scroll(body);
  expect(panel.style.height).toBe("350px");
  fireEvent.click(handle);
  expect(body.scrollTop).toBe(120);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("未提交的答案");
});
it("第二根手指和鼠标右键不会启动或接管拖动", () => {
  const { handle, panel } = setup();
  fireEvent.pointerDown(handle, { clientY: 550, isPrimary: false, pointerId: 2 });
  fireEvent.pointerMove(handle, { clientY: 200, pointerId: 2 });
  expect(panel.dataset.dragging).toBe("false");
  fireEvent.pointerDown(handle, { clientY: 550, button: 2 });
  fireEvent.pointerMove(handle, { clientY: 200 });
  expect(panel.style.height).toBe("350px");
});
it("旋转或窗口缩放重新约束展开高度，取消旧手势并移除监听", () => {
  const { handle, panel, unmount } = setup();
  fireEvent.click(handle);
  available = 500;
  act(() => resize());
  expect(panel.style.height).toBe("476px");
  fireEvent.pointerDown(handle, { clientY: 200 });
  fireEvent.pointerMove(handle, { clientY: 350 });
  fireEvent.resize(window);
  expect(panel.dataset.dragging).toBe("false");
  expect(panel.style.height).toBe("476px");
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
it("关闭入口在两种高度均保留", () => {
  const { handle, onClose } = setup();
  fireEvent.click(handle);
  fireEvent.click(screen.getByRole("button", { name: "关闭知识卡片" }));
  expect(onClose).toHaveBeenCalledOnce();
});
it("换知识节点后回到半屏且不会继承旧节点的正文滚动", () => {
  const { handle, rerender } = setup();
  fireEvent.click(handle);
  rerender(<div><KnowledgeDetailSheet key="next-node" title="正弦定理" onClose={() => {}}><p>新的知识说明</p></KnowledgeDetailSheet></div>);
  expect(screen.getByRole("button", { name: "展开知识卡片" }).getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("三角形面积")).toBeNull();
  expect(screen.getByText("新的知识说明").parentElement!.scrollTop).toBe(0);
});
