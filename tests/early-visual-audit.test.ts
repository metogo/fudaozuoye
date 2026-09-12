import { describe, expect, it, vi } from "vitest";
import { observeVisualAudit } from "../lib/learning/providers/early-visual-audit";
import type { ProblemSnapshot } from "../lib/learning/types";

const visual = { related: true, affectsSolving: true, summary: "图中标注", confidence: 0.95, facts: [{ text: '边长为3厘米（标签含"{}"）', source: "printed_label" as const, confidence: 0.95 }] };
const problem: ProblemSnapshot = { text: "求图中正方形的周长。", subject: "math", gradeBand: "primary", childWork: "", confidence: 1, userRevised: false, visualContext: visual };
const answer = { originalAnswer: "12厘米", originalExplanation: "正方形四条边长度相等，周长为3乘4，等于12厘米。" };
const raw = JSON.stringify({ visualContext: visual, ...answer });

describe("提前发布的图中证据", () => {
  it("逐字符返回时，完整对象闭合前不发布，闭合后无需等答案", () => {
    const emit = vi.fn(), observer = observeVisualAudit(problem, emit);
    const prefix = JSON.stringify({ visualContext: visual }).slice(0, -1);
    for (const char of prefix.slice(0, -1)) observer.delta(char);
    expect(emit).not.toHaveBeenCalled();
    observer.delta(prefix.at(-1)!);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].facts).toEqual(visual.facts);
    observer.delta(raw.slice(prefix.length));
    expect(observer.complete(raw).solution.originalAnswer).toBe("12厘米");
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it("模型没有先返回证据时，仍等待完整校验，不猜测半个对象", () => {
    const emit = vi.fn(), observer = observeVisualAudit(problem, emit);
    const ordered = JSON.stringify({ ...answer, visualContext: visual });
    observer.delta(ordered);
    expect(emit).not.toHaveBeenCalled();
    observer.complete(ordered);
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...visual, confidence: 0.5 },
    { ...visual, facts: [{ ...visual.facts[0], confidence: 0.5 }] },
    { ...visual, facts: [] },
    { ...visual, confidence: undefined },
  ])("低置信度或缺少必要字段不能提前放行：%j", value => {
    const emit = vi.fn(), observer = observeVisualAudit(problem, emit);
    expect(() => observer.delta(JSON.stringify({ visualContext: value }))).toThrow();
    expect(emit).not.toHaveBeenCalled();
  });
  it("不允许改写用户已确认的图中条件", () => {
    const observer = observeVisualAudit({ ...problem, userRevised: true }, vi.fn());
    expect(() => observer.delta(JSON.stringify({ visualContext: { ...visual, facts: [{ ...visual.facts[0], text: "边长为5厘米" }] } }))).toThrow("不一致");
  });
  it("最终响应重复字段覆盖提前证据时拒绝，不能悄悄更换条件", () => {
    const observer = observeVisualAudit(problem, vi.fn());
    observer.delta(raw);
    expect(() => observer.complete(raw.slice(0, -1) + ',"visualContext":' + JSON.stringify({ ...visual, related: false }) + "}")).toThrow("前后不一致");
  });
  it("提前证据有效不等于答案完整，残缺最终内容仍拒绝", () => {
    const observer = observeVisualAudit(problem, vi.fn());
    observer.delta(raw);
    expect(() => observer.complete(JSON.stringify({ visualContext: visual }))).toThrow();
  });
  it("嵌套在其他字段中的 visualContext 不作为提前核验结果", () => {
    const emit = vi.fn(), observer = observeVisualAudit(problem, emit);
    observer.delta(JSON.stringify({ other: { visualContext: visual } }));
    expect(emit).not.toHaveBeenCalled();
  });
});
