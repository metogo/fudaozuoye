// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HomeExamples } from "@/components/home-examples";
import { homeExamples } from "@/lib/browser/home-examples";
import { UiLanguageProvider } from "@/components/ui-language";
import { UI_LOCALE_KEY } from "@/lib/ui-copy";

afterEach(() => { cleanup(); localStorage.clear(); });
it("只显示一个换题按钮，连续换题循环且相邻两次不重复", () => {
  const select = vi.fn();
  const view = render(<HomeExamples disabled={false} value="" onSelect={select}/>);
  expect(select).not.toHaveBeenCalled();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  const count = homeExamples.length * 2 + 1;
  for (let index = 0; index < count; index++) {
    fireEvent.click(screen.getByRole("button", { name: "换一题" }));
    const example = homeExamples[index % homeExamples.length];
    expect(select).toHaveBeenLastCalledWith(example.problem);
    view.rerender(<HomeExamples disabled={false} value={example.problem} onSelect={select}/>);
    expect(screen.queryByText(example.problem)).toBeNull();
  }
  expect(select).toHaveBeenCalledTimes(count);
});
it("未就绪或锁定时不能填入，解除后可选择", () => {
  const select = vi.fn();
  const view = render(<HomeExamples disabled value="" onSelect={select}/>);
  for (const button of screen.getAllByRole("button")) fireEvent.click(button);
  expect(select).not.toHaveBeenCalled();
  view.rerender(<HomeExamples disabled={false} value="" onSelect={select}/>);
  fireEvent.click(screen.getByRole("button", { name: "换一题" }));
  expect(select).toHaveBeenCalledExactlyOnceWith(homeExamples[0].problem);
});
it("默认题之后换下一道，编辑或清空后仍可继续换题且没有额外提示区", () => {
  const select = vi.fn();
  const view = render(<HomeExamples disabled={false} value={homeExamples[0].problem} onSelect={select}/>);
  fireEvent.click(screen.getByRole("button", { name: "换一题" }));
  expect(select).toHaveBeenLastCalledWith(homeExamples[1].problem);
  for (const value of ["修改后的题目", ""]) {
    view.rerender(<HomeExamples disabled={false} value={value} onSelect={select}/>);
    fireEvent.click(screen.getByRole("button", { name: "换一题" }));
    expect(screen.queryByRole("status")).toBeNull();
  }
  expect(select.mock.calls.map(call => call[0])).toEqual([homeExamples[1].problem, homeExamples[2].problem, homeExamples[3].problem]);
});
it("小学初中高中各覆盖语数英，学科交错且题目自包含、标注正确", () => {
  expect(new Set(homeExamples.map(example => example.id)).size).toBe(homeExamples.length);
  for (const stage of ["小学", "初中", "高中"]) {
    expect(new Set(homeExamples.filter(example => example.stage === stage).map(example => example.subject))).toEqual(new Set(["数学", "语文", "英语"]));
  }
  homeExamples.forEach((example, index) => {
    expect(example.problem).toBe(`${example.stage}${example.grade}${example.subject}示例题：${example.question}`);
    expect(example.question).not.toMatch(/如图|见图|下图|根据上文/);
    expect(example.subject).not.toBe(homeExamples[(index + 1) % homeExamples.length].subject);
  });
});
it("英文界面翻译入口，但不篡改数学原题", async () => {
  localStorage.setItem(UI_LOCALE_KEY, "en");
  const select = vi.fn();
  render(<UiLanguageProvider><HomeExamples disabled={false} value="" onSelect={select}/></UiLanguageProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Another" }));
  expect(select).toHaveBeenCalledExactlyOnceWith(homeExamples[0].problem);
});
