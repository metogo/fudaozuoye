// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RepairOriginalQuestion } from "@/components/repair-original-question";
import type { ChatMessage, ProblemSnapshot } from "@/lib/learning/types";
import { loadQuestionImage } from "@/lib/browser/question-image-store";

vi.mock("@/components/ui-language", () => ({ useUiText: () => (text: string) => text }));
vi.mock("@/lib/browser/question-image-store", () => ({ loadQuestionImage: vi.fn() }));
const props = () => ({ message: { id: "original", imageUrl: "blob:http://localhost/original" } as ChatMessage, problem: { text: "面积 rac{3 oot{3}{}}{2}" } as ProblemSnapshot, busy: false, onFile: vi.fn() });
const confirmRepair = () => { fireEvent.click(screen.getByRole("button", { name: "用原图重新识别" })); fireEvent.click(screen.getByRole("button", { name: "确认重新识别" })); };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("正常公式不增加恢复入口", () => {
  render(<RepairOriginalQuestion {...props()} problem={{ text: String.raw`面积 $\frac{3\sqrt{3}}{2}$` } as ProblemSnapshot}/>);
  expect(screen.queryByRole("button")).toBeNull();
});
it("用户取消时不读取、不重置", () => {
  const p = props(); vi.stubGlobal("fetch", vi.fn());
  render(<RepairOriginalQuestion {...p}/>); fireEvent.click(screen.getByRole("button"));
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(fetch).not.toHaveBeenCalled(); expect(p.onFile).not.toHaveBeenCalled();
});
it("获取完整原图后只申请裁剪，重置延后到用户确认裁剪", async () => {
  const p = props();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["original"], { type: "image/png" }) }));
  render(<RepairOriginalQuestion {...p}/>); confirmRepair();
  await waitFor(() => expect(p.onFile).toHaveBeenCalledOnce());
  expect(p.onFile.mock.calls[0][1]).toBe(true);
  expect(p.onFile.mock.calls[0][0]).toMatchObject({ type: "image/png", size: 8 });
});
it("读取失败不会清空旧题，可再次操作", async () => {
  const p = props();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("读取失败")));
  render(<RepairOriginalQuestion {...p}/>); confirmRepair();
  await screen.findByRole("alert");
  expect(p.onFile).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "确认重新识别" }).hasAttribute("disabled")).toBe(false);
});
it("重复点击只读取一次；切换题目后旧读取结果不重置新题", async () => {
  const p = props();
  let finish!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
  const view = render(<RepairOriginalQuestion {...p}/>);
  confirmRepair(); fireEvent.click(screen.getByRole("button", { name: "正在读取原图…" }));
  expect(fetch).toHaveBeenCalledOnce(); view.unmount();
  finish({ ok: true, blob: async () => new Blob(["original"], { type: "image/png" }) });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(p.onFile).not.toHaveBeenCalled();
});

it.each(["expired", "http", "empty", "wrong-mime"])("预览 %s 时使用持久化原图，不要求重新上传", async mode => {
  const p = props(); p.message.imageAssetId = "saved-photo";
  vi.stubGlobal("fetch", mode === "expired" ? vi.fn().mockRejectedValue(new Error("revoked")) : vi.fn().mockResolvedValue({ ok: mode !== "http", blob: async () => new Blob(mode === "empty" ? [] : ["preview"], { type: mode === "wrong-mime" ? "text/html" : "image/png" }) }));
  vi.mocked(loadQuestionImage).mockResolvedValue(new Blob(["persisted"], { type: "image/png" }));
  render(<RepairOriginalQuestion {...p}/>); confirmRepair();
  await waitFor(() => expect(p.onFile).toHaveBeenCalledOnce());
  expect(loadQuestionImage).toHaveBeenCalledWith("saved-photo");
  expect(p.onFile.mock.calls[0][0].size).toBe(9);
});

it("持久化原图缺失时保留旧对话并报告错误", async () => {
  const p = props(); p.message = { id: "original", imageAssetId: "missing" } as ChatMessage;
  vi.mocked(loadQuestionImage).mockResolvedValue(null);
  render(<RepairOriginalQuestion {...p}/>); confirmRepair();
  expect((await screen.findByRole("alert")).textContent).toContain("当前对话未改动");
  expect(p.onFile).not.toHaveBeenCalled();
});

it("主讲解进行中不允许重置", () => {
  render(<RepairOriginalQuestion {...props()} busy/>);
  expect(screen.getByRole("button", { name: "用原图重新识别" }).hasAttribute("disabled")).toBe(true);
});
