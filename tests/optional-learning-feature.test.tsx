// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createOptionalLearningFeature, optionalFeatureTimeoutMs } from "@/components/optional-learning-feature";
import { UiLanguageProvider } from "@/components/ui-language";
import { UI_LOCALE_KEY } from "@/lib/ui-copy";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

it.each(["小实验", "知识图谱", "对话导出", "划词提问"])("%s加载失败后重新请求资源，正文和输入不重置", async label => {
  const load = vi.fn<() => Promise<{ default: () => React.ReactNode }>>()
    .mockRejectedValueOnce(new Error("network down"))
    .mockResolvedValueOnce({ default: () => <p>功能恢复</p> });
  const Feature = createOptionalLearningFeature(load, label);
  render(<><p>原题正文</p><input aria-label="学习输入" defaultValue="未发送的思路"/><Feature/></>);
  expect(await screen.findByText(`${label}暂时不可用`)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: `重试${label}` }));
  expect(await screen.findByText("功能恢复")).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(2);
  expect((screen.getByLabelText("学习输入") as HTMLInputElement).value).toBe("未发送的思路");
  expect(screen.getByText("原题正文")).toBeTruthy();
});

it("等待有上限，迟到的旧结果不覆盖重试的新结果，不自动循环请求", async () => {
  vi.useFakeTimers();
  let finishOld!: (value: { default: () => React.ReactNode }) => void;
  const load = vi.fn<() => Promise<{ default: () => React.ReactNode }>>()
    .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce({ default: () => <p>新的实验</p> });
  const Feature = createOptionalLearningFeature(load, "小实验");
  await act(async () => { render(<Feature/>); });
  await act(async () => { await vi.advanceTimersByTimeAsync(optionalFeatureTimeoutMs + 1); });
  expect(screen.getByText("小实验暂时不可用")).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重试小实验" })); });
  expect(screen.getByText("新的实验")).toBeTruthy();
  await act(async () => { finishOld({ default: () => <p>过时的实验</p> }); });
  expect(screen.queryByText("过时的实验")).toBeNull();
});

it("渲染异常局部处理，切换题目不继承失败状态", async () => {
  let broken = true;
  const View = () => { if (broken) throw new Error("bad visual"); return <p>新题功能</p>; };
  const Feature = createOptionalLearningFeature(async () => ({ default: View }), "知识图谱");
  const view = render(<Feature key="first"/>);
  expect(await screen.findByText("知识图谱暂时不可用")).toBeTruthy();
  broken = false;
  view.rerender(<Feature key="second"/>);
  expect(await screen.findByText("新题功能")).toBeTruthy();
});

it("英文错误说明与局部重试不改变教学正文", async () => {
  localStorage.setItem(UI_LOCALE_KEY, "en");
  const Feature = createOptionalLearningFeature(async () => { throw new Error("offline"); }, "小实验");
  render(<UiLanguageProvider><p>中文题目</p><Feature/></UiLanguageProvider>);
  expect(await screen.findByRole("button", { name: "Retry Mini-experiment" })).toBeTruthy();
  expect(screen.getByText("中文题目")).toBeTruthy();
});
