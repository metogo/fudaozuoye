import { describe, expect, it } from "vitest";
import { deterministicAnswerMatch, safeAssessmentFeedback } from "@/lib/learning/providers/assessment";
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
