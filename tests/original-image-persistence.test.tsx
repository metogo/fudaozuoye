// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/learning/types";
vi.mock("@/lib/browser/question-image-store", () => ({ loadQuestionImage: vi.fn(), saveQuestionImage: vi.fn(), removeQuestionImage: vi.fn() }));
import { loadQuestionImage, saveQuestionImage, removeQuestionImage } from "@/lib/browser/question-image-store";
import { IMAGE_RESTORE_NOTICE, IMAGE_SAVE_NOTICE, useOriginalImagePersistence } from "@/components/original-image-persistence";

const original: ChatMessage = { id: "photo", role: "user", kind: "user", text: "这道题我不会，想把它学懂。", createdAt: "2026-09-10", imageAssetId: "asset-one" };
beforeEach(() => {
  vi.mocked(loadQuestionImage).mockReset();
  vi.mocked(saveQuestionImage).mockReset().mockResolvedValue();
  vi.mocked(removeQuestionImage).mockReset().mockResolvedValue();
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:restored"), revokeObjectURL: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("原图刷新恢复生命周期", () => {
  it("恢复到同一条消息并保留后续讲解，不把对象URL写成永久地址", async () => {
    vi.mocked(loadQuestionImage).mockResolvedValue(new Blob(["photo"]));
    const setMessages = vi.fn(), notice = vi.fn(), previews = { current: [] as string[] };
    const { result } = renderHook(() => useOriginalImagePersistence(setMessages, notice, previews));
    await act(() => result.current.restore(original));
    const later = { ...original, id: "later", text: "后续讲解" };
    expect(setMessages.mock.calls[0][0]([original, later])).toEqual([{ ...original, imageUrl: "blob:restored" }, later]);
    expect(previews.current).toEqual(["blob:restored"]);
    expect(notice).not.toHaveBeenCalled();
  });
  it.each(["reset", "unmount"])("%s 后旧的异步恢复不能重新挂回原图", async action => {
    let resolve!: (value: Blob) => void;
    vi.mocked(loadQuestionImage).mockReturnValue(new Promise(r => { resolve = r; }));
    const setMessages = vi.fn(), notice = vi.fn(), previews = { current: [] as string[] };
    const { result, unmount } = renderHook(() => useOriginalImagePersistence(setMessages, notice, previews));
    const recovery = result.current.restore(original);
    if (action === "reset") result.current.clear(original); else unmount();
    await act(async () => { resolve(new Blob()); await recovery; });
    expect(setMessages).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("存储与恢复失败有明确提示，不影响现有消息", async () => {
    vi.mocked(saveQuestionImage).mockRejectedValue(new Error("quota"));
    vi.mocked(loadQuestionImage).mockResolvedValue(null);
    const setMessages = vi.fn(), notice = vi.fn();
    const { result } = renderHook(() => useOriginalImagePersistence(setMessages, notice, { current: [] }));
    await act(async () => { result.current.retain(new Blob()); });
    expect(notice).toHaveBeenCalledWith(IMAGE_SAVE_NOTICE);
    await act(() => result.current.restore(original));
    expect(notice).toHaveBeenCalledWith(IMAGE_RESTORE_NOTICE);
    expect(setMessages).not.toHaveBeenCalled();
  });
});
