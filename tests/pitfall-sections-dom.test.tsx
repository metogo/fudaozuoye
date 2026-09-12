// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RichLearningText } from "@/components/rich-learning-text";
import { buildLearningClipboardContent } from "@/lib/learning/copy-rich-text";
afterEach(cleanup);
const text = "### 分步推导\n正文不收起。\n\n### 易错题型\n不要漏掉 $x^{2}$。\n\n#### 一个例子\n注意符号。\n\n### 后续结论\n这里仍然可见。";
it("仅易错章节默认收起，嵌套小节在内，后续同级正文不隐藏", () => {
  const { container } = render(<RichLearningText text={text} collapsePitfalls/>);
  const details = container.querySelector("details.learning-pitfalls")!;
  expect(details.hasAttribute("open")).toBe(false);
  expect(details.querySelector("summary")!.textContent).toBe("易错题型");
  expect(details.textContent).toContain("一个例子");
  expect(details.textContent).not.toContain("后续结论");
  expect(details.querySelectorAll(".katex")).toHaveLength(1);
});
it("用户已展开时，流式追加内容不会自动收起", () => {
  const view = render(<RichLearningText text={"### 易错提醒\n第一条。"} collapsePitfalls streaming/>);
  const details = view.container.querySelector("details")!;
  details.open = true;
  view.rerender(<RichLearningText text={"### 易错提醒\n第一条。\n\n第二条。"} collapsePitfalls/>);
  expect(view.container.querySelector("details")).toBe(details);
  expect(details.open).toBe(true); expect(details.textContent).toContain("第二条");
});
it("复制包含收起内容，粘贴不携带折叠控件；导出用的默认渲染不折叠", () => {
  const view = render(<RichLearningText text={text} collapsePitfalls/>);
  const copied = buildLearningClipboardContent(view.container);
  expect(copied.text).toContain("易错题型\n\n不要漏掉");
  expect(copied.html).not.toContain("<details"); expect(copied.html).not.toContain("<summary");
  expect(copied.html).toContain("注意符号");
  view.rerender(<RichLearningText text={text}/>); expect(view.container.querySelector("details")).toBeNull();
});
it("正文提及易错点或代码里的标题不误收起", () => {
  const { container } = render(<RichLearningText text={'这里讲易错题型。\n\n```\n### 易错提醒\n```\n\n### 正常章节\n正文。'} collapsePitfalls/>);
  expect(container.querySelector("details")).toBeNull();
});
