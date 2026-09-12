// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RichLearningText } from "@/components/rich-learning-text";
afterEach(cleanup);

it("结论后的 Markdown 下划线不会把整段答案变成大标题，分问换行且保留公式", () => {
  const { container } = render(<RichLearningText text={'### 结论\n\n(1) 实数 $k$ 的范围是 $k \\le 9$；(2) $k=6$；(3) 斜边为 $2\\sqrt{6}$。\n---\n\n### 易错提醒\n取正根。'} collapsePitfalls/>);
  expect([...container.querySelectorAll("h2,h3")].map((n) => n.textContent)).toEqual(["结论"]);
  expect(container.querySelectorAll("p br")).toHaveLength(2);
  expect(container.querySelectorAll(".katex")).toHaveLength(4);
  expect(container.querySelector("details")?.textContent).toContain("取正根");
});

it.each(["（1）力的单位是牛顿；（2）方向向右。", "(1) 选 A；(2) 证据是原文。", "(1) 反应生成水；(2) 注意条件。"])("各学科结论中的显式大标题回落正文：%s", (answer) => {
  const { container } = render(<RichLearningText text={`### 结论\n\n## ${answer}`}/>);
  expect(container.querySelector("h2")).toBeNull();
  expect(container.querySelectorAll("p br")).toHaveLength(1);
});

it("流式补全和换题不残留结论状态，其他章节及代码保持原样", () => {
  const view = render(<RichLearningText text={'### 结论\n\n(1) $x=2$；(2)'} streaming/>);
  view.rerender(<RichLearningText text={'### 结论\n\n(1) $x=2$；(2) $y=3$\n---'}/>);
  expect(view.container.querySelector("h2")).toBeNull();
  view.rerender(<RichLearningText text={'## (1) 阅读材料\n\n```text\n(1) 第一项；(2) 第二项\n```\n\n### 结论\n答案。\n\n### 下一章节\n\n## (2) 正常标题'}/>);
  expect(view.container.querySelectorAll("h2")).toHaveLength(2);
  expect(view.container.querySelector("code")?.textContent).toContain("第一项；(2)");
});
