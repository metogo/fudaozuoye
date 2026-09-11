// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bindParagraphSelection } from "@/lib/learning/paragraph-selection";
import { selectionSnapshot } from "@/lib/learning/selection-snapshot";
let dispose: () => void;
let area: HTMLElement;
function pointer(target: Element, type: string, x = 20, y = 20) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 }); target.dispatchEvent(event);
}
function click(target: Element) { target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })); }
beforeEach(() => {
  document.body.innerHTML = '<div id="area"><article class="chat-message"><div class="copyable-learning-text__prose"><p>第一段<strong>条件</strong></p><p>第二段</p><p><a href="#">链接</a></p></div></article><div id="blank">空白</div></div>';
  area = document.querySelector('#area')!; dispose = bindParagraphSelection(area, vi.fn());
});
afterEach(() => { dispose(); window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); vi.restoreAllMocks(); });
it('单击嵌套正文选中整段，再点击另一段切换，空白取消', () => {
  const first = area.querySelector('strong')!; pointer(first, 'pointerdown'); click(first);
  expect(selectionSnapshot(area)?.text).toBe('第一段条件');
  const second = area.querySelectorAll('p')[1]; pointer(second, 'pointerdown'); click(second);
  expect(selectionSnapshot(area)?.text).toBe('第二段');
  const blank = area.querySelector('#blank')!; pointer(blank, 'pointerdown'); click(blank);
  expect(selectionSnapshot(area)).toBeNull();
});
it.each(['move', 'scroll', 'cancel', 'long', 'link'])('%s 不触发整段选择', mode => {
  const target = area.querySelector(mode === 'link' ? 'a' : 'p')!;
  const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
  pointer(target, 'pointerdown');
  if (mode === 'move') pointer(target, 'pointermove', 20, 45);
  if (mode === 'scroll') area.dispatchEvent(new Event('scroll'));
  if (mode === 'cancel') pointer(target, 'pointercancel');
  if (mode === 'long') clock.mockReturnValue(700);
  click(target); expect(selectionSnapshot(area)).toBeNull();
});
it('卸载后不再响应点击', () => {
  dispose(); const target = area.querySelector('p')!; pointer(target, 'pointerdown'); click(target);
  expect(selectionSnapshot(area)).toBeNull();
});
