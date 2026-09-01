import { describe, expect, it } from "vitest";
import { parseJsonObject } from "@/lib/learning/providers/model-support";

describe("模型 JSON 协议解析", () => {
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
