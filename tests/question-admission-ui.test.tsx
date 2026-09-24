// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import type { ComponentProps } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LearningChat } from "@/components/learning-chat";
import type { ImageCropper } from "@/components/image-cropper";
import { EducationChatApp } from "@/components/education-chat-app";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";

let chat: ComponentProps<typeof LearningChat>;
let crop: ComponentProps<typeof ImageCropper>;
vi.mock("@/components/learning-chat", () => ({ LearningChat: (props: typeof chat) => { chat = props; return <p role="alert">{props.notice}</p>; } }));
vi.mock("@/components/image-cropper", () => ({ ImageCropper: (props: typeof crop) => { crop = props; return null; } }));
vi.mock("@/components/use-question-entry-reporting", () => ({ useQuestionEntryReporting: () => vi.fn() }));
vi.mock("@/lib/browser/question-image-store", () => ({ saveQuestionImage: vi.fn(), loadQuestionImage: vi.fn(), removeQuestionImage: vi.fn() }));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/consent")
    ? Response.json({ reasoningLevels: [{ id: "light", label: "轻度", available: true }] })
    : Response.json({ error: { code: "DAILY_QUESTION_LIMIT", message: "今天已经开启了 30 道题，明天北京时间 0 点后继续。当前题目仍可继续追问。" } }, { status: 429 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });

it("第 31 道文字题留在首页，不添加消息、不触发识别，返回拒绝结果以保留输入", async () => {
  render(<EducationChatApp/>);
  await waitFor(() => expect(chat?.ready).toBe(true));
  await act(async () => { expect(await chat.onSend("这是一道新题")).toBe(false); });
  expect(chat.messages).toHaveLength(0); expect(chat.session).toBeNull();
  expect(chat.notice).toContain("30 道题"); expect(chat.busy).toBe(false);
  expect(vi.mocked(fetch).mock.calls.map(call => String(call[0]))).toEqual(["/api/consent", "/api/learning/question-entry"]);
});
it("第 31 道图片被拦截时仍保留上一题的讲解、会话和输入能力", async () => {
  const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
  const message = { id: "old", role: "assistant", kind: "assistant", text: "保留这道题的讲解", status: "complete", createdAt: new Date().toISOString() };
  sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken: "x".repeat(48), messages: [message] }));
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  render(<EducationChatApp/>);
  await waitFor(() => expect(chat?.session?.requestId).toBe(session.requestId));
  act(() => chat.onFile(new File(["test"], "test.png", { type: "image/png" }), true));
  await waitFor(() => expect(crop).toBeTruthy());
  await act(async () => { await crop.onConfirm(new NodeBlob(["test"]) as unknown as Blob, "blob:quota-test"); });
  expect(chat.session?.requestId).toBe(session.requestId);
  expect(chat.messages[0].text).toBe(message.text); expect(chat.busy).toBe(false);
  expect(chat.notice).toContain("30 道题"); expect(revoke).toHaveBeenCalledWith("blob:quota-test");
  revoke.mockRestore();
});
