import { afterEach, describe, expect, it, vi } from "vitest";
import { writeLearningClipboard } from "../lib/learning/copy-rich-text";

const content = { html: "<h2>解题步骤</h2><p>面积</p>", text: "解题步骤\n\n面积" };

afterEach(() => vi.unstubAllGlobals());

describe("学习回复剪贴板", () => {
  it("同时提供富文本和纯文本", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    const ClipboardItemMock = vi.fn(function (this: { data: unknown }, data: unknown) { this.data = data; });
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    expect(await writeLearningClipboard(content)).toBe("rich");
    const data = ClipboardItemMock.mock.calls[0][0] as Record<string, Blob>;
    expect(await data["text/html"].text()).toBe(content.html);
    expect(await data["text/plain"].text()).toBe(content.text);
    expect(write).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("富文本不支持时明确返回纯文本结果", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("ClipboardItem", undefined);
    expect(await writeLearningClipboard(content)).toBe("plain");
    expect(writeText).toHaveBeenCalledWith(content.text);
  });

  it("富文本写入被拒绝后尝试纯文本", async () => {
    vi.stubGlobal("ClipboardItem", class {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn().mockRejectedValue(new Error("unsupported")), writeText } });
    expect(await writeLearningClipboard(content)).toBe("plain");
    expect(writeText).toHaveBeenCalledWith(content.text);
  });

  it("权限拒绝不能报告成功", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    await expect(writeLearningClipboard(content)).rejects.toThrow("denied");
  });

  it("剪贴板缺失时返回失败", async () => {
    vi.stubGlobal("navigator", {});
    await expect(writeLearningClipboard(content)).rejects.toThrow("无法访问剪贴板");
  });
});
