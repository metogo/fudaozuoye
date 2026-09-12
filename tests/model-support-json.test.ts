import { describe, expect, it } from "vitest";
import { parseJsonObject } from "@/lib/learning/providers/model-support";

describe("模型 JSON 协议解析", () => {
  it("原题、证据和嵌套说明中的裸分式不被 JSON 吞掉首字母", () => {
    const formula = String.raw`面积为 \frac{3\sqrt{3}}{2}，选项 \sqrt{3}。`;
    expect(parseJsonObject(String.raw`{"text":"面积为 \frac{3\sqrt{3}}{2}，选项 \sqrt{3}。","nodes":[{"evidence":"\frac{1}{2}"}]}`))
      .toEqual({ text: formula, nodes: [{ evidence: String.raw`\frac{1}{2}` }] });
  });
  it("标准圆括号和方括号定界符也保护合法 JSON 字母开头的命令", () => {
    expect(parseJsonObject(String.raw`{"text":"\(\beta+\theta\) 和 \[\frac{1}{2}\]"}`))
      .toEqual({ text: String.raw`\(\beta+\theta\) 和 \[\frac{1}{2}\]` });
  });
  it("已正确序列化的多学科公式逐字保留，重复解析不二次转义", () => {
    const value = { text: String.raw`面积 \frac{3\sqrt{3}}{2}；$\vec{F}=m\vec{a}$；$\mathrm{H_2O}$`, line: "第一行\n第二行\t缩进", path: String.raw`C:\temp\file` };
    const parsed = parseJsonObject(JSON.stringify(value));
    expect(parsed).toEqual(value);
    expect(parseJsonObject(JSON.stringify(parsed))).toEqual(value);
  });
  it("已损坏的控制字符触发可重试错误，不猜测修补数学条件", () => {
    for (const text of [String.raw`\u000crac{1}{2}`, String.raw`\u000doot{3}{}`, String.raw`\u0009ext{角}`]) {
      expect(() => parseJsonObject(`{"nodes":[{"text":"${text}"}]}`)).toThrow("公式转义损坏");
    }
  });
  it("只修复字符串中未按 JSON 转义的 LaTeX 反斜杠", () => {
    expect(parseJsonObject(String.raw`{"formula":"$\angle A=90^\circ$","line":"第一行\n第二行"}`)).toEqual({
      formula: String.raw`$\angle A=90^\circ$`,
      line: "第一行\n第二行",
    });
  });

  it("不会把合法 JSON 转义误当成 LaTeX，也能修复以合法转义字母开头的公式命令", () => {
    expect(parseJsonObject(String.raw`{"formula":"$\frac{1}{2}+\beta$","explanation":"$\text{说明}$","line":"第一行\n第二行"}`)).toEqual({
      formula: String.raw`$\frac{1}{2}+\beta$`,
      explanation: String.raw`$\text{说明}$`,
      line: "第一行\n第二行",
    });
  });

  it("支持块公式和常见关系命令，同时不篡改非公式字段的合法转义", () => {
    expect(parseJsonObject(String.raw`{"formula":"$$x\notin A\rightarrow B$$","text":"$\therefore \triangle ABC$","line":"\text"}`)).toEqual({
      formula: String.raw`$$x\notin A\rightarrow B$$`,
      text: String.raw`$\therefore \triangle ABC$`,
      line: "\text",
    });
  });

  it("保留块公式和普通文本中的合法换行、制表转义", () => {
    expect(parseJsonObject(String.raw`{"formula":"$$a\n b$$","text":"\text"}`)).toEqual({
      formula: "$$a\n b$$",
      text: "\text",
    });
  });

  it("不会把截断或普通语法错误伪装成合法结果", () => {
    expect(() => parseJsonObject(String.raw`{"formula":"$\angle A$"`)).toThrow();
    expect(() => parseJsonObject('{"value": invalid}')).toThrow();
  });
});
