import { describe, expect, it } from "vitest";
import { deterministicAnswerMatch, explicitlyNegatesExpected, safeAssessmentFeedback } from "@/lib/learning/providers/assessment";
import { MockProviderAdapter } from "@/lib/learning/providers/adapter";
import type { CheckItem } from "@/lib/learning/types";

describe("学科答案语义等价与安全反馈", () => {
  it.each([
    ["10 m/s", "10米/秒"],
    ["6.02×10²³", "6.02e23"],
    ["(2,-1)", "（2，-1）"],
    ["2,1,2", "2 1 2"],
    ["1 m", "100 cm"],
    ["10 m/s", "36 km/h"],
    ["8盒", "8"],
    ["2H₂ + O₂ → 2H₂O", "2h2+o2=2h2o"],
    ["$2H_{2}O_{2}\\xlongequal{MnO_{2}}2H_{2}O+O_{2}↑$", "2H₂O₂→2H₂O+O₂"],
    ["$2H_{2}O_{2}\\xlongequal{MnO_{2}}2H_{2}O+O_{2}\\uparrow$", "2H₂O₂→2H₂O+O₂"],
    ["$\\ce{2H_{2}O_{2}\\xlongequal{MnO_{2}} 2H_{2}O + O_{2}\\uparrow}$", "2H₂O₂→2H₂O+O₂"],
    ["$2H_2O_2\\xlongequal{MnO_2} 2H_2O + O_2\\uparrow$", "2H₂O₂→2H₂O+O₂"],
    ["\\boldsymbol{2\\mathrm{H_2O_2}\\xlongequal{\\mathrm{MnO_2}} 2\\mathrm{H_2O}+\\mathrm{O_2}\\uparrow}", "2H₂O₂→2H₂O+O₂"],
    ["2H_2O_2\\xrightarrow{MnO_2}2H_2O+O_2\\uparrow", "2H₂O₂→2H₂O+O₂"],
    ["2H_2O_2\\overset{MnO_2}{\\longrightarrow}2H_2O+O_2\\uparrow", "2H₂O₂→2H₂O+O₂"],
    ["$2H_2O_2 \\stackrel{MnO_2}{\\!\\!\\!\\!=\\!\\!\\!\\!=} 2H_2O + O_2\\uparrow$", "2H₂O₂→2H₂O+O₂"],
    ["$\\ce{2H_{2}O_{2}\\xlongequal{\\ce{MnO_{2}}} 2H_{2}O + O_{2}\\uparrow}$", "2H₂O₂→2H₂O+O₂"],
  ])("把 %s 与 %s 判为语义等价", (expected, actual) => {
    expect(deterministicAnswerMatch(expected, actual)).toBe(true);
  });

  it("不会把数值相同但量纲不同的答案误判为等价", () => {
    expect(deterministicAnswerMatch("1 m", "1 s")).toBe(false);
  });

  it.each(["x≠8", "8不是正确答案", "结果不应为8", "The answer should never under any reasonable circumstances be 8", "8作为最终计算结果显然不正确"])("不会把明确否定 8 的表达 %s 误判为正确", async (actual) => {
    expect(deterministicAnswerMatch("8", actual)).toBe(false);
    const check: CheckItem = { id: "number", prompt: "x 等于多少？", type: "short_text", answer: "8", explanation: "检查等式。" };
    await expect(new MockProviderAdapter("doubao").verifyAnswer(check, actual)).resolves.toMatchObject({ passed: false });
  });

  it.each(["答案不是7而是8", "x=8，不是7"])("不会让被否定的干扰项误杀正确答案：%s", (actual) => {
    expect(explicitlyNegatesExpected("8", actual)).toBe(false);
    expect(deterministicAnswerMatch("8", actual)).toBe(true);
  });

  it.each(["8绝不成立", "8不该是正确结果", "8并不成立"])("识别紧跟目标答案的否定：%s", (actual) => {
    expect(deterministicAnswerMatch("8", actual)).toBe(false);
  });

  it("英文干扰项否定不会误杀材料中的正确短语", () => {
    expect(explicitlyNegatesExpected("Tom gets up at seven", "Tom gets up at seven, not eight.")).toBe(false);
  });

  it.each(["答案不是7而是8，但我认为这个结论不成立", "题目声称答案不是7而是8，但这显然错误"])("纠正后又反驳结论时不能判为正确：%s", (actual) => {
    expect(explicitlyNegatesExpected("8", actual)).toBe(true);
    expect(deterministicAnswerMatch("8", actual)).toBe(false);
  });

  it.each(["答案是8，但我不同意老师的解题方法", "答案不是7而是8，但是另一个同学的结论不成立"])("无关异议不会撤回已经确认的答案：%s", (actual) => {
    expect(explicitlyNegatesExpected("8", actual)).toBe(false);
    expect(deterministicAnswerMatch("8", actual)).toBe(true);
  });

  it.each(["答案是8，但这个方法错误", "答案是8，但这道题的另一个说法错误"])("无关对象的批评不会误杀正确答案：%s", (actual) => {
    expect(deterministicAnswerMatch("8", actual)).toBe(true);
  });

  it.each(["答案是8，但此结论不成立", "答案是8，但我不认可这个答案", "答案是8，但我收回这个答案"])("明确撤回当前答案时判为错误：%s", (actual) => {
    expect(deterministicAnswerMatch("8", actual)).toBe(false);
  });

  it.each(["答案是8，但这个判断不成立", "答案是8，但该判断有误", "答案是8，但这个答案不对", "答案是8，我收回这个答案", "The answer is 8, but this answer is wrong.", "The answer is 8, but I disagree with this answer.", "The answer is 8, but this answer is false.", "The answer is 8. I do not accept that answer.", "The answer is 8. I retract that answer."])("中英文明确回指并撤回答案时判为错误：%s", (actual) => {
    expect(deterministicAnswerMatch("8", actual)).toBe(false);
  });

  it("不会把未配平的化学方程式误判为等价", () => {
    expect(deterministicAnswerMatch("2H₂+O₂→2H₂O", "H₂+O₂→H₂O")).toBe(false);
  });

  it("适配器验收会直接接受换算后等价的答案", async () => {
    const check: CheckItem = { id: "speed", prompt: "速度是多少？", type: "short_text", answer: "10 m/s", explanation: "根据路程和时间求速度。" };
    await expect(new MockProviderAdapter("doubao").verifyAnswer(check, "36 km/h")).resolves.toMatchObject({ passed: true });
  });

  it("错误反馈不复述标准答案与完整解析", () => {
    const check: CheckItem = { id: "check", prompt: "速度是多少？", type: "short_text", answer: "10 m/s", explanation: "由 v=s÷t 得到 10 m/s。" };
    const feedback = safeAssessmentFeedback(check, "12 m/s", { passed: false, explanation: "正确答案是 10 m/s，因为 v=s÷t。" });
    expect(feedback.passed).toBe(false);
    expect(feedback.explanation).not.toContain("10 m/s");
    expect(feedback.explanation).not.toContain("v=s÷t");
    expect(feedback.explanation).toContain("检查");
  });
});
