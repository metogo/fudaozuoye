// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLearningClipboardContent, learningPlainText, writeLearningClipboard } from "@/lib/learning/copy-rich-text";

function source(html: string) {
  const element = document.createElement("article");
  element.innerHTML = html;
  document.body.append(element);
  return element;
}

describe("讲解复制内容", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("把段落、清单、代码、公式和分隔线转成可读的纯文本", () => {
    const element = source('<h2>重点</h2><p>先看 <strong>条件</strong><br>再计算</p><ol start="3"><li>列式</li><li>求解<ul><li>验算</li></ul></li></ol><pre>a = 1\n b = 2</pre><span class="katex"><math><msup><mi>x</mi><mn>2</mn></msup></math></span><hr><button>不要复制</button>');
    const text = learningPlainText(element);
    expect(text).toContain("重点");
    expect(text).toContain("3. 列式");
    expect(text).toContain("  • 验算");
    expect(text).toContain("a = 1\n b = 2");
    expect(text).toContain("x²");
    expect(text).toContain("---");
    expect(text).not.toContain("不要复制");
  });

  it("富文本导出剔除交互控件，公式只保留线性可读文本与内联样式", () => {
    const element = source('<p class="intro" id="p" tabindex="0">结果 <span class="katex"><math><mfrac><mn>1</mn><mn>2</mn></mfrac></math></span></p><input value="hidden"><span data-copy-exclude>排除</span>');
    const content = buildLearningClipboardContent(element);
    expect(content.html).toContain("((1) / (2))");
    expect(content.html).not.toContain("katex");
    expect(content.html).not.toContain("input");
    expect(content.html).not.toContain("排除");
    expect(content.html).toContain("font-family:");
  });

  it("优先使用富文本剪贴板，失败时明确降级为纯文本", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write, writeText } });
    class Item { constructor(readonly value: unknown) {} }
    Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: Item });
    await expect(writeLearningClipboard({ html: "<p>x</p>", text: "x" })).resolves.toBe("rich");
    write.mockRejectedValueOnce(new Error("denied"));
    await expect(writeLearningClipboard({ html: "<p>x</p>", text: "x" })).resolves.toBe("plain");
    expect(writeText).toHaveBeenCalledWith("x");
  });

  it("没有任一剪贴板能力时返回明确错误", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: undefined });
    await expect(writeLearningClipboard({ html: "", text: "x" })).rejects.toThrow("当前浏览器不支持复制");
  });
});
