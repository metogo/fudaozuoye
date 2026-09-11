// @vitest-environment jsdom
import { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useQuoteScrollDismiss } from "@/components/use-quote-scroll-dismiss";
function Harness({ dismiss }: { dismiss: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  useQuoteScrollDismiss(true, form, dismiss);
  return <><div data-testid="page">正文</div><form ref={form}><div data-testid="quote">引用</div></form></>;
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
