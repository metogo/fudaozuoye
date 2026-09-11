import { describe, expect, it } from "vitest";
import { experimentObservationLimit, experimentQuestion, rectangleMetrics, resizeRectangle, supportsRectangleExperiment } from "@/lib/learning/rectangle-experiment";
import { parseTurnRequest } from "@/lib/learning/http/turn-request";
import type { ProblemSnapshot } from "@/lib/learning/types";

const problem: ProblemSnapshot = { text: "一个长方形的长是8厘米，宽是3厘米，求周长。", subject: "math", gradeBand: "primary", childWork: "", confidence: .99, userRevised: false };
describe("实验适用范围", () => {
  it.each([problem.text, "长方形的长度为10米，宽度为2米，求面积。", "A rectangle has length 8 cm and width 3 cm. Find the perimeter."])("明确适用：%s", text => expect(supportsRectangleExperiment({ ...problem, text })).toBe(true));
  it.each(["长方形的长是8厘米，宽是3米，求面积。", "长方形的宽是3厘米，求周长。", "长方形长8厘米，宽0厘米，求面积。", "长方形长3厘米，宽8厘米，求面积。", "长方形长8厘米，宽3厘米，剪去一个正方形，求面积。", "两个长方形长8厘米，宽3厘米，求面积。", "不是长方形，长8厘米，宽3厘米，求面积。", "长方形长8厘米，宽3厘米，长4厘米，宽2厘米，求面积。", "长方形长8厘米，宽3厘米，求阴影面积。", "长方形长8厘米，宽3厘米，求对角线。", "长方形长-8厘米，宽3厘米，求面积。"])("不推断或硬配：%s", text => expect(supportsRectangleExperiment({ ...problem, text })).toBe(false));
  it("缺图、视觉条件参与求解、低置信度、非数学不展示", () => {
    expect(supportsRectangleExperiment({ ...problem, missingVisualInformation: ["右边界"] })).toBe(false);
    expect(supportsRectangleExperiment({ ...problem, confidence: .7 })).toBe(false);
    expect(supportsRectangleExperiment({ ...problem, subject: "physics" })).toBe(false);
    expect(supportsRectangleExperiment({ ...problem, visualContext: { related: true, affectsSolving: true, summary: "", facts: [], confidence: 1 } })).toBe(false);
  });
});

describe("确定性几何模型", () => {
  it("穷举所有整数边界与操作，保证数值、长宽关系和固定周长一致", () => {
    for (let length = 1; length <= 8; length++) for (let width = 1; width <= length; width++) {
      const current = { length, width };
      expect(rectangleMetrics(current)).toEqual({ perimeter: 2 * (length + width), area: length * width });
      for (let value = -2; value <= 10; value++) {
        for (const side of ["length", "width"] as const) expect(() => rectangleMetrics(resizeRectangle(current, side, value, null))).not.toThrow();
        for (const side of ["length", "width"] as const) {
          const next = resizeRectangle(current, side, value, length + width);
          expect(rectangleMetrics(next).perimeter).toBe(2 * (length + width));
          expect(next.width).toBeLessThanOrEqual(next.length);
        }
      }
    }
  });
  it("不接受无效数据或失效约束", () => {
    expect(() => rectangleMetrics({ length: Infinity, width: 1 })).toThrow();
    expect(() => resizeRectangle({ length: 4, width: 2 }, "length", 2.5, null)).toThrow();
    expect(() => resizeRectangle({ length: 4, width: 2 }, "length", 5, 8)).toThrow();
  });
  it("固定周长可产生不同面积，追问附带真实操作且明确独立示例", () => {
    const next = resizeRectangle({ length: 4, width: 2 }, "length", 5, 6);
    expect(next).toEqual({ length: 5, width: 1 });
    const text = experimentQuestion({ length: 4, width: 2 }, next, 6, "为什么面积变小了？");
    expect(text).toContain("周长从12厘米变为12厘米，面积从8平方厘米变为5平方厘米");
    expect(text).toContain("不是原题条件");
    expect(text).toContain("为什么面积变小了？");
    expect(() => experimentQuestion({ length: 4, width: 2 }, next, 8, "")).toThrow();
  });
  it("最长观察仍能通过现有追问接口，不把实验作为答案", async () => {
    const text = experimentQuestion({ length: 7, width: 7 }, { length: 8, width: 6 }, 14, "问".repeat(experimentObservationLimit));
    const request = new Request("http://localhost/api/learning/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken: "token", input: { type: "question", text } }) });
    expect((await parseTurnRequest(request, false)).input).toEqual({ type: "question", text });
    expect(() => experimentQuestion({ length: 4, width: 2 }, { length: 5, width: 1 }, 6, "问".repeat(experimentObservationLimit + 1))).toThrow();
  });
});
