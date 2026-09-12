// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichLearningText } from "@/components/rich-learning-text";
import { parseJsonObject } from "@/lib/learning/providers/model-support";
import { splitEvidence } from "@/lib/learning/evidence-segments";
import { prepareMathForDisplay } from "@/lib/learning/math-quality";
import { buildLearningClipboardContent } from "@/lib/learning/copy-rich-text";
import { selectionSnapshot } from "@/lib/learning/selection-snapshot";

const formulas = [
  String.raw`\frac{3\sqrt{3}}{2}`,
  String.raw`\frac{1}{\frac{2}{3}+\sqrt{5}}`,
  String.raw`\sqrt[3]{a^{2}+b_{1}}`,
  String.raw`\sin B+\sin C=2\sin A\cos C`,
  String.raw`\angle ACB=90^{\circ}`,
  String.raw`\vec{F}=m\vec{a}`,
  String.raw`v=\frac{180\,\mathrm{km}}{3\,\mathrm{h}}`,
  String.raw`\mathrm{2H_2+O_2\rightarrow2H_2O}`,
  String.raw`\begin{cases}x+y=6\\x-y=2\end{cases}`,
  String.raw`\begin{aligned}a&=1;\\b&=2\end{aligned}`,
];

describe("公式从模型 JSON 到证据、显示与复制的回归", () => {
  it.each([
    String.raw`\frac{a}{b}^{2}`,
    String.raw`\frac{a}{b}+\frac{c}{d}`,
    String.raw`\sin A + \cos B = 1`,
  ])("遍历切分阈值也不拆开裸公式：%s", formula => {
    const source = `条件为${formula}。下一句。`;
    for (let size = 1; size <= source.length; size++) {
      expect(splitEvidence(source, size).some(segment => segment.includes(formula)), `切分阈值 ${size}`).toBe(true);
    }
  });
  it.each(formulas)("逐字保留公式 %s", (formula) => {
    const text = `条件：$${formula}$。`;
    // A doubled TeX backslash is also a valid JSON escape: its intent cannot
    // be guessed in malformed JSON. Exercise row breaks with canonical JSON.
    const inputs = [JSON.stringify({ text })];
    if (!formula.includes("\\\\")) inputs.push(`{"text":"${text}"}`);
    for (const json of inputs) {
      const value = parseJsonObject(json).text as string;
      expect(value).toBe(text);
      const evidence = splitEvidence(value, 8);
      expect(evidence.some(item => item.includes(`$${formula}$`))).toBe(true);
      const article = document.createElement("article");
      article.innerHTML = renderToStaticMarkup(createElement(RichLearningText, { text: evidence.join("") }));
      expect(article.querySelector(".learning-math-error")).toBeNull();
      expect(article.querySelector("annotation")?.textContent).toBe(formula);
      const copied = buildLearningClipboardContent(article);
      expect(copied.text.trim()).not.toBe("");
      expect(copied.text).not.toMatch(/(?<![A-Za-z\\])(?:rac|oot)\{/);
      document.body.append(article);
      const range = document.createRange();
      range.selectNodeContents(article);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      const quote = selectionSnapshot(article)!.text;
      const preview = document.createElement("div");
      preview.innerHTML = renderToStaticMarkup(createElement(RichLearningText, { text: quote, compact: true }));
      expect(preview.querySelector("annotation")?.textContent).toBe(formula);
      expect(preview.querySelector(".learning-math-error")).toBeNull();
      window.getSelection()!.removeAllRanges();
      article.remove();
    }
  });

  it("截图中的裸嵌套分式和多项根式经过解析后全部可渲染", () => {
    const value = parseJsonObject(String.raw`{"text":"面积为 \frac{3\sqrt{3}}{2}，A. 3\sqrt{3} B. 2\sqrt{3} C. 3 D. \sqrt{3}"}`);
    const article = document.createElement("article");
    article.innerHTML = renderToStaticMarkup(createElement(RichLearningText, { text: value.text as string }));
    expect(article.querySelector(".learning-math-error")).toBeNull();
    expect([...article.querySelectorAll("annotation")].some(node => node.textContent === String.raw`\frac{3\sqrt{3}}{2}`)).toBe(true);
    expect(article.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(4);
    const copied = buildLearningClipboardContent(article);
    expect(copied.text).toContain("((3√(3)) / (2))");
  });

  it.each(["$", "$$", "\\(", "\\["])("长公式和内部换行不被 %s 分片拆开", opening => {
    const closing = opening === "\\(" ? "\\)" : opening === "\\[" ? "\\]" : opening;
    const math = opening + Array.from({ length: 60 }, (_, i) => `a_{${i}}`).join("+\n") + closing;
    const segments = splitEvidence(`已知${math}。求值。`);
    expect(segments.some(text => text.includes(math))).toBe(true);
    expect(segments.join("")).toBe(`已知${math}。求值。`);
  });

  it("裸嵌套分式不截断，普通文科材料继续按句切分", () => {
    const formula = String.raw`\frac{3\sqrt{3}}{2}`;
    expect(splitEvidence(`面积${formula}。`, 8).some(text => text.includes(formula))).toBe(true);
    expect(splitEvidence("甲说。乙说；丙说。", 220)).toEqual(["甲说。", "乙说；", "丙说。"]);
  });

  it("旧损坏内容明确提示但不擅改条件，代码例子不误判", () => {
    const text = "面积为 rac{3 oot{3}{}}{2}";
    expect(prepareMathForDisplay(text).issues.join("")).toContain("原文疑似损坏");
    expect(() => parseJsonObject(JSON.stringify({ text }))).toThrow("公式转义损坏");
    expect(prepareMathForDisplay("代码 `rac{3}`").issues).toEqual([]);
    expect(() => splitEvidence("$\\frac{1}{2}")).toThrow("结构不完整");
  });

  it("标准定界符内的换行不会让整条公式退化成源码", () => {
    const text = "条件：\\(\\frac{3\\sqrt{3}}{2}\n+1\\)。";
    const article = document.createElement("article");
    article.innerHTML = renderToStaticMarkup(createElement(RichLearningText, { text }));
    expect(article.querySelector("annotation")?.textContent).toBe("\\frac{3\\sqrt{3}}{2}\n+1");
    expect(article.querySelector(".learning-math-error")).toBeNull();
  });
});
