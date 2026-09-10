import { afterEach, describe, expect, it, vi } from "vitest";
import { loadQuestionImage, removeQuestionImage, saveQuestionImage } from "@/lib/browser/question-image-store";

function database({ fail = false, stalled = false, blocked = false } = {}) {
  const data = new Map<string, unknown>();
  const close = vi.fn();
  const request: { result?: unknown; onsuccess?: () => void; onblocked?: () => void } = {};
  const db = { close, transaction() {
    let aborted = false;
    let commit = () => {};
    const result: { result?: unknown } = {};
    const tx = { oncomplete: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined, onabort: undefined as (() => void) | undefined,
      abort() { aborted = true; tx.onabort?.(); },
      objectStore() { return {
        put(blob: Blob, id: string) { commit = () => { data.set(id, blob); result.result = id; }; return result; },
        get(id: string) { commit = () => { result.result = data.get(id); }; return result; },
        delete(id: string) { commit = () => { data.delete(id); }; return result; },
      }; },
    };
    if (!stalled) queueMicrotask(() => { if (aborted) return; if (fail) tx.onerror?.(); else { commit(); tx.oncomplete?.(); } });
    return tx;
  } };
  vi.stubGlobal("indexedDB", { open: () => {
    queueMicrotask(() => { request.result = db; if (blocked) request.onblocked?.(); else request.onsuccess?.(); });
    return request;
  } });
  return { data, close, request };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("原图本地二进制存储", () => {
  it("提交成功才返回，按独立ID读取原始Blob，删除后不再可恢复", async () => {
    const { close } = database();
    const photo = new Blob(["original bytes"], { type: "image/png" });
    await saveQuestionImage("one", photo);
    await saveQuestionImage("two", new Blob(["second"]));
    expect(await (await loadQuestionImage("one"))!.text()).toBe("original bytes");
    await removeQuestionImage("one");
    expect(await loadQuestionImage("one")).toBeNull();
    expect(await (await loadQuestionImage("two"))!.text()).toBe("second");
    expect(close).toHaveBeenCalledTimes(6);
  });
  it("重置等待尚未提交的写入，不让旧照片随后重新出现", async () => {
    const { data } = database();
    const write = saveQuestionImage("race", new Blob(["photo"]));
    const remove = removeQuestionImage("race");
    await Promise.all([write, remove]);
    expect(data.has("race")).toBe(false);
  });
  it("容量/事务失败必须抛出，不冒充保存成功", async () => {
    const { data, close } = database({ fail: true });
    await expect(saveQuestionImage("failed", new Blob())).rejects.toThrow("存储失败");
    expect(data.size).toBe(0);
    expect(close).toHaveBeenCalled();
  });
  it("超时中止事务并关闭连接", async () => {
    vi.useFakeTimers();
    const { close, data } = database({ stalled: true });
    const save = saveQuestionImage("timeout", new Blob());
    const rejection = expect(save).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(4001);
    await rejection;
    expect(data.size).toBe(0);
    expect(close).toHaveBeenCalled();
  });
  it("阻塞失败后晚到的连接被关闭，损坏数据不当成有效照片", async () => {
    const blocked = database({ blocked: true });
    await expect(loadQuestionImage("blocked")).rejects.toThrow("占用");
    blocked.request.onsuccess?.();
    expect(blocked.close).toHaveBeenCalled();
    const { data } = database();
    data.set("corrupt", "not an image");
    await expect(loadQuestionImage("corrupt")).rejects.toThrow("损坏");
  });
  it("浏览器禁用存储时明确失败", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(saveQuestionImage("disabled", new Blob())).rejects.toBeInstanceOf(Error);
  });
});
