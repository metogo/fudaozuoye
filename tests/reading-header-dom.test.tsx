// @vitest-environment jsdom
import { useRef } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useReadingHeader } from "@/components/use-reading-header";
function Harness({ enabled = true, identity = "one" }) {
  const area = useRef<HTMLDivElement>(null), header = useRef<HTMLElement>(null);
  useReadingHeader(area, header, enabled, identity);
  return <main><header ref={header}><button>工具栏</button></header><div ref={area} data-testid="scroll"><textarea/></div></main>;
}
afterEach(cleanup);
function setup() {
  const view = render(<Harness/>), area = view.getByTestId("scroll"), header = view.container.querySelector("header")!;
  Object.defineProperties(area, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } });
  const scroll = (top: number, manual = true) => { if (manual) fireEvent.wheel(area); area.scrollTop = top; fireEvent.scroll(area); };
  return { ...view, area, header, scroll };
}
it("向下隐藏、向上出现，小幅抖动不闪烁，顶部与回弹始终可见", () => {
  const { header, scroll } = setup();
  scroll(140); expect(header.dataset.readingHidden).toBe("true"); expect(header.inert).toBe(true);
  scroll(137); expect(header.dataset.readingHidden).toBe("true");
  scroll(120); expect(header.dataset.readingHidden).toBe("false");
  scroll(170); expect(header.dataset.readingHidden).toBe("true");
  scroll(-10); expect(header.dataset.readingHidden).toBe("false"); expect(header.inert).toBe(false);
});
it("模型自动滚动不隐藏，切换新题或回首页恢复，清理监听", () => {
  const { header, scroll, rerender } = setup();
  scroll(200, false); expect(header.dataset.readingHidden).toBe("false");
  scroll(250); expect(header.dataset.readingHidden).toBe("true");
  rerender(<Harness identity="two"/>); expect(header.dataset.readingHidden).toBe("false");
  scroll(350); expect(header.dataset.readingHidden).toBe("true");
  rerender(<Harness enabled={false}/>); scroll(500); expect(header.dataset.readingHidden).toBe("false");
});
it("键盘正在使用工具栏时不隐藏，正文键盘阅读也支持", () => {
  const { header, area, scroll } = setup();
  header.querySelector("button")!.focus(); scroll(140); expect(header.dataset.readingHidden).toBe("false");
  header.querySelector("button")!.blur(); fireEvent.keyDown(area, { key: "PageDown" }); scroll(300, false);
  expect(header.dataset.readingHidden).toBe("true");
});
