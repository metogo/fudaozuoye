import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RichLearningText } from "@/components/rich-learning-text";
import { prepareMathForDisplay, mathOutputInstruction } from "@/lib/learning/math-quality";
import { prepareLearningMarkdown } from "@/lib/learning/presentation";
import { tutorSystemPrompt } from "@/lib/learning/providers/tutor";
import { solutionSystemPrompt } from "@/lib/learning/providers/model-support";
import { ConversationDocument } from "@/components/conversation-export";
import { conversationExportSnapshot } from "@/lib/learning/conversation-export";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";

export const mathSamples = [
  String.raw`$x_{1}^{2}+x_{2}^{2}=(x_{1}+x_{2})^{2}-2x_{1}x_{2}$`,
  String.raw`$-4k\geq-36$，两边除以负数后得到 $k\leq9$。`,
  String.raw`$\frac{-b\pm\sqrt{b^{2}-4ac}}{2a}$`,
  String.raw`$\frac{1}{\frac{2}{3}+\sqrt{5}}$`,
  String.raw`$\sqrt{24}=2\sqrt{6}$`,
  String.raw`$v=\frac{s}{t}=\frac{180\,\mathrm{km}}{3\,\mathrm{h}}=60\,\mathrm{km/h}$`,
  String.raw`$\mathrm{2H_2+O_2\rightarrow2H_2O}$`,
  String.raw`$$
\begin{aligned}x_{1}^{2}+x_{2}^{2}&=(x_{1}+x_{2})^{2}-2x_{1}x_{2}\\&=36-2k=24\end{aligned}
$$`,
  String.raw`$\begin{cases}x+y=6\\x^2+y^2=24\end{cases}$`,
  String.raw`应满足 \geq 0。另一个条件是 \frac{1}{\sqrt{2}}。`,
  "普通文字、3、≥ 0、x1 不应被猜测改写。",
  String.raw`$a_{1}+a_{2}+a_{3}+a_{4}+a_{5}+a_{6}+a_{7}+a_{8}+a_{9}+a_{10}+a_{11}+a_{12}=S$`,
];

describe("公式格式治理", () => {
  it.each(mathSamples)("保留公式结构并形成完整可聚焦单元：%s", (source) => {
    const html = renderToStaticMarkup(<RichLearningText text={source}/>);
    expect(html).not.toContain("learning-math-error");
    if (source.includes("\\") || source.includes("$")) {
      expect(html).toContain('class="learning-math');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('encoding="application/x-tex"');
    }
  });
  it("嵌在中文中的裸关系式和嵌套根式整体规范化", () => {
    expect(prepareLearningMarkdown(String.raw`应满足 \geq 0。`)).toBe(String.raw`应满足 $\geq 0$。`);
    expect(prepareLearningMarkdown(String.raw`代入 \frac{1}{\sqrt{2}}。`)).toBe(String.raw`代入 $\frac{1}{\sqrt{2}}$。`);
  });
  it("只提示混用下标，不擅自修正 x1", () => {
    const source = String.raw`$x_{1}+x_{2}$，随后写成 $(x1+x2)^2$。`;
    const result = prepareMathForDisplay(source);
    expect(result.content).toBe(source);
    expect(result.issues).toHaveLength(1);
    expect(prepareMathForDisplay(String.raw`$x_{1}+x_{2}$` ).issues).toEqual([]);
    expect(prepareMathForDisplay("`$x_1+x1$`").issues).toEqual([]);
  });
  it.each(["$\\frac{1}{", "$$\n\\begin{aligned}x&=", "\\(x^{", "\\[x+"])("流式残缺片段不闪出半截公式：%s", (source) => {
    const result = prepareMathForDisplay(`推导：${source}`, true);
    expect(result.content).toBe("推导：（公式正在补全…）");
    expect(result.issues).toEqual([]);
    expect(prepareMathForDisplay(source).issues).toHaveLength(1);
  });
  it("语法错误保留原表达式，不展示解析器报错堆栈", () => {
    const html = renderToStaticMarkup(<RichLearningText text={String.raw`$\frac{1}{$ 后续解释仍然可读。`}/>);
    expect(html).toContain("公式格式需核对");
    expect(html).toContain("\\frac{1}{");
    expect(html).toContain("后续解释仍然可读");
    expect(html).not.toContain("ParseError");
  });
  it("长公式独立成单元，不改写公式及复制来源", () => {
    const source = String.raw`$a_{1}+a_{2}+a_{3}+a_{4}+a_{5}+a_{6}+a_{7}+a_{8}+a_{9}+a_{10}=S$`;
    expect(renderToStaticMarkup(<RichLearningText text={source}/>)).toContain("learning-math--long");
    expect(prepareMathForDisplay(source).content).toBe(source);
  });
  it("对话和完整讲解共享一致输出规范", () => {
    expect(tutorSystemPrompt()).toContain(mathOutputInstruction);
    expect(solutionSystemPrompt()).toContain(mathOutputInstruction);
  });
  it("PDF 的已展示填空答案与对话使用相同规范化", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    session.flow.activeGate = { id: "blank", kind: "step_answer", title: "填空", stepBlank: { before: "$\\Delta$", after: "", hint: "" }, stepAnswer: { answer: "\\geq 0", explanation: "有实根" } };
    const html = renderToStaticMarkup(<ConversationDocument snapshot={conversationExportSnapshot([], session)}/>);
    const slot = html.match(/class="conversation-document__answer">([\s\S]*?)<\/strong>/)![1];
    expect(slot).toContain('class="learning-math');
    expect(slot).toContain("≥");
  });
  it("每一个流式切片都不展示解析器错误，完成后恢复完整公式", () => {
    const source = String.raw`推导：$\frac{1}{\sqrt{2}}=\frac{\sqrt{2}}{2}$。`;
    for (let i = 1; i <= source.length; i += 1) {
      const html = renderToStaticMarkup(<RichLearningText text={source.slice(0, i)} streaming/>);
      expect(html).not.toContain("learning-math-error");
    }
    expect(renderToStaticMarkup(<RichLearningText text={source}/>)).toContain("mfrac");
  });
  it.each([String.raw`$\href{https://example.com}{点击}$`, String.raw`$\includegraphics{https://example.com/a.png}$`])("不因公式开放外链或图片：%s", (text) => {
    const html = renderToStaticMarkup(<RichLearningText text={text}/>);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
  });
  it("可生成复用真实组件及样式的本地视觉验收页", async () => {
    if (!process.env.MATH_VISUAL_QA) return;
    const fs = await import("node:fs/promises");
    const dir = "outputs/math-qa";
    await fs.mkdir(dir, { recursive: true });
    await fs.cp("node_modules/katex/dist/fonts", `${dir}/fonts`, { recursive: true });
    const css = (await Promise.all(["node_modules/katex/dist/katex.min.css", "app/globals.css", "app/ui-theme.css", "components/conversation-export.css"].map((file) => fs.readFile(file, "utf8")))).join("\n").replace(/@import[^;]+;/g, "");
    const body = renderToStaticMarkup(<main className="lesson-chat-shell qa-main"><div className="chat-message--teacher"><h1>公式排版验收</h1>{mathSamples.map((text, i) => <section key={text}><h2>样例 {i + 1}</h2><RichLearningText text={text}/></section>)}<RichLearningText text={String.raw`$x_{1}+x_{2}$ 与 $(x1+x2)^2$。`}/><RichLearningText text={String.raw`$\frac{1}{$`}/><RichLearningText text={"正在推导 $\\sqrt{"} streaming/></div></main>);
    const document = renderToStaticMarkup(<ConversationDocument snapshot={conversationExportSnapshot(mathSamples.map((text, i) => ({ id: String(i), role: "assistant", kind: "assistant", text, status: "complete", createdAt: "2026-09-06T00:00:00Z" })), null)}/>);
    const page = (content: string) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>公式治理验收</title><style>${css}\n.qa-main{height:auto;min-height:0;margin:0;padding:20px;overflow:visible}.qa-main section{padding:16px 0;border-bottom:1px solid #ddd}.qa-main h1{font-size:20px}.qa-main h2{font-size:12px;color:#777}</style><body class="apple-ui">${content}</body></html>`;
    await fs.writeFile(`${dir}/index.html`, page(body));
    await fs.writeFile(`${dir}/pdf-preview.html`, page(document));
  });
});
