// @vitest-environment jsdom
import { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useQuoteScrollDismiss } from "@/components/use-quote-scroll-dismiss";
function Harness({ dismiss }: { dismiss: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  useQuoteScrollDismiss(true, form, dismiss);
  return <><div data-testid="page">正文</div><form ref={form}><div data-testid="quote">引用</div><textarea aria-label="追问"/></form></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it.each([-20, 20])("上下滚轮都关闭，方向 %s，内部滚动不关闭", deltaY => {
  const dismiss = vi.fn(); const view = render(<Harness dismiss={dismiss}/>);
  fireEvent.wheel(screen.getByTestId('quote'), { deltaY }); expect(dismiss).not.toHaveBeenCalled();
  fireEvent.wheel(screen.getByTestId('page'), { deltaY }); expect(dismiss).toHaveBeenCalledOnce();
  view.unmount(); fireEvent.scroll(window); expect(dismiss).toHaveBeenCalledOnce();
});
it.each([-30, 30])("手机上下滑动意图关闭，包括页面边界 %s", offset => {
  const dismiss = vi.fn(); render(<Harness dismiss={dismiss}/>);
  const page = screen.getByTestId('page');
  fireEvent.touchStart(page, { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(page, { touches: [{ clientY: 104 }] }); expect(dismiss).not.toHaveBeenCalled();
  fireEvent.touchMove(page, { touches: [{ clientY: 100 + offset }] }); expect(dismiss).toHaveBeenCalledOnce();
});
it("聚焦后键盘引起的滚动即使先于 viewport resize，也不会瞬间关闭引用框", () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
  const dismiss = vi.fn(); render(<Harness dismiss={dismiss}/>);
  fireEvent.focusIn(screen.getByRole('textbox', { name: '追问' }));
  fireEvent.scroll(window);
  expect(dismiss).not.toHaveBeenCalled();
  clock.mockReturnValue(1600); fireEvent.scroll(window);
  expect(dismiss).toHaveBeenCalledOnce();
});
it("键盘展开期间用户主动滑动仍立即关闭，不会被聚焦保护吞掉", () => {
  const dismiss = vi.fn(); render(<Harness dismiss={dismiss}/>);
  fireEvent.focusIn(screen.getByRole('textbox', { name: '追问' }));
  fireEvent.touchStart(screen.getByTestId('page'), { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(screen.getByTestId('page'), { touches: [{ clientY: 130 }] });
  expect(dismiss).toHaveBeenCalledOnce();
});
