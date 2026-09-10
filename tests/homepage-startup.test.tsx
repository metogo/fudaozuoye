// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EducationChatApp } from "@/components/education-chat-app";

vi.mock("@/lib/learning/home-companion-motion", () => ({ animateHomeCompanion: vi.fn() }));
vi.mock("@/components/use-question-entry-reporting", () => ({ useQuestionEntryReporting: () => vi.fn() }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); sessionStorage.clear(); });

it("初始 HTML 已包含首页，不等待浏览器脚本和服务响应才展示", () => {
  const html = renderToString(<EducationChatApp/>);
  expect(html).toContain("home-welcome");
  expect(html).toContain("陪你一起解题。");
  expect(html).toContain("拍照发题");
  expect(html).toContain("从相册选择题目");
  expect(html).toContain('fetchPriority="high"');
  expect(html).not.toContain("正在准备学习空间");
  expect(html).not.toContain("katex-mathml");
});

it("首页先展示，但发题仍等待服务就绪；输入草稿不会被就绪更新重置", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  let resolveConsent!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("/consent")
    ? new Promise<Response>(resolve => { resolveConsent = resolve; })
    : Promise.resolve(new Response(JSON.stringify({ total: 10000 })))));
  render(<EducationChatApp/>);
  expect(screen.getByRole("heading", { name: "Hey，小逗号陪你一起解题。" })).toBeTruthy();
  expect((screen.getByLabelText("拍照发题") as HTMLInputElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "保留这段题目草稿" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { resolveConsent(new Response(JSON.stringify({ reasoningLevels: [{ id: "light", label: "轻度", available: true }] }))); });
  expect((screen.getByLabelText("拍照发题") as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("保留这段题目草稿");
});
