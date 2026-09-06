import { describe, expect, it } from "vitest";
import { prepareStepAnswerMarkdown } from "@/lib/learning/step-answer-format";

describe("填空公式片段显示", () => {
  it.each(["\\geq 0", "\\ge0", "\\leq 0", "\\neq 0", "x \\geq 0", "\\Delta", "\\frac{1}{\\sqrt{2}}", "2\\sqrt{6}"])("整体包裹裸公式 %s", (value) => {
    expect(prepareStepAnswerMarkdown(value)).toBe(`$${value}$`);
  });
  it.each(["", "≥ 0", "3", "两个实数根", "$\\geq 0$", "\\(\\geq 0\\)", "`\\geq 0`", "这里填 \\geq 0", "Use \\geq 0", "C:\\temp", "\\unknown{0}"])("保留普通文本或已格式化内容 %s", (value) => {
    expect(prepareStepAnswerMarkdown(value)).toBe(value);
  });
});
