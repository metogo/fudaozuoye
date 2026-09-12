// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LearningChat } from "@/components/learning-chat";
import type { ImageCropper } from "@/components/image-cropper";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { EducationChatApp } from "@/components/education-chat-app";
import { readSseResponse } from "@/lib/learning/client-sse";
import { removeQuestionImage } from "@/lib/browser/question-image-store";

let chat: ComponentProps<typeof LearningChat>;
let crop: ComponentProps<typeof ImageCropper>;
const { record } = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/components/use-question-entry-reporting", () => ({ useQuestionEntryReporting: () => record }));
vi.mock("@/components/learning-chat", () => ({ LearningChat: (props: typeof chat) => { chat = props; return null; } }));
vi.mock("@/components/image-cropper", () => ({ ImageCropper: (props: typeof crop) => { crop = props; return null; } }));
vi.mock("@/lib/learning/client-sse", () => ({ readSseResponse: vi.fn() }));
vi.mock("@/lib/browser/question-image-store", () => ({ saveQuestionImage: vi.fn().mockResolvedValue(undefined), loadQuestionImage: vi.fn().mockResolvedValue(null), removeQuestionImage: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

async function setup() {
  const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
  session.problem.text = "面积 rac{3 oot{3}{}}{2}";
  const messages = [{ id: "original", role: "user", kind: "user", text: "原题", imageAssetId: "saved-original", status: "complete" }, { id: "explanation", role: "assistant", kind: "assistant", text: "旧讲解", status: "complete" }];
  sessionStorage.setItem("education-chat-session-v3", JSON.stringify({ session, stateToken: "x".repeat(48), messages }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reasoningLevels: [{ id: "light", label: "轻度", available: true }] }))));
  render(<EducationChatApp/>);
  await waitFor(() => expect(chat.ready && chat.session).toBeTruthy());
  return session;
}

it("重新识别打开及取消裁剪均保留原题、讲解、学习关卡和持久化照片", async () => {
  const session = await setup();
  await act(async () => chat.onFile(new File(["original"], "photo.png", { type: "image/png" }), true));
  await waitFor(() => expect(crop).toBeTruthy());
  expect(chat.session?.requestId).toBe(session.requestId);
  expect(chat.messages.map(m => m.text)).toContain("旧讲解");
  await act(async () => crop.onCancel());
  expect(chat.session?.flow).toEqual(session.flow);
  expect(chat.messages).toHaveLength(2);
  expect(removeQuestionImage).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
});

it("确认可用裁剪才开始替换；识别失败仍保留新照片供重试且不重复计数", async () => {
  await setup();
  vi.mocked(readSseResponse).mockRejectedValue(new Error("识别暂不可用"));
  await act(async () => chat.onFile(new File(["original"], "photo.png", { type: "image/png" }), true));
  await waitFor(() => expect(crop).toBeTruthy());
  await act(async () => crop.onConfirm(new Blob(["decoded"], { type: "image/png" }), "blob:http://localhost/repaired"));
  expect(chat.session).toBeNull();
  expect(chat.messages).toHaveLength(1);
  expect(chat.messages[0]).toMatchObject({ imageUrl: "blob:http://localhost/repaired", status: "error" });
  expect(chat.retryLabel).toBe("重新识别");
  expect(chat.busy).toBe(false);
  expect(record).not.toHaveBeenCalled();
});
