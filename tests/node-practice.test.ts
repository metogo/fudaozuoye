import { describe, expect, it, vi } from "vitest";
import { parseNodePractice } from "@/lib/learning/node-practice";
import { generateNodePractice } from "@/lib/learning/providers/node-practice";
import type { LearningSession } from "@/lib/learning/types";

const practice = { question: "同一工作用时减半，效率怎样变化？", options: ["变为两倍", "减半", "不变"], correctIndex: 0, explanation: "总量不变，效率与时间成反比。", connection: "回到原题，用总量除以时间得到合做效率；练习不是原题的新条件。" };
const concept = { id: "rate", title: "工作效率", summary: "", application: "", evidence: "6天完成" };
const session = { problem: { text: "修路360米，6天完成", subject: "math", gradeBand: "primary" } } as LearningSession;
describe("知识点练习质量边界", () => {
  it("严格解析选项与答案，不接受残缺、重复、损坏公式", () => {
    expect(parseNodePractice(practice)).toEqual(practice);
    for (const change of [{ correctIndex: 3 }, { correctIndex: "0" }, { options: ["a", "a", "b"] }, { question: "$x" }, { explanation: "rac{1}{2}" }]) expect(() => parseNodePractice({ ...practice, ...change })).toThrow();
  });
  it("盲审不带候选答案，采用独立复核解释且不修改会话", async () => {
    const request = vi.fn().mockResolvedValueOnce(JSON.stringify(practice)).mockResolvedValueOnce(JSON.stringify({ approved: true, correctIndex: 0, explanation: "独立解答：时间减半，效率翻倍。" }));
    const before = JSON.stringify(session);
    const result = await generateNodePractice(session, concept, [], request);
    const review = JSON.parse(request.mock.calls[1][1]);
    expect(review.correctIndex).toBeUndefined(); expect(review.explanation).toBeUndefined();
    expect(result.explanation).toContain("独立解答");
    expect(JSON.stringify(session)).toBe(before);
  });
  it.each([{ approved: false, correctIndex: 0 }, { approved: true, correctIndex: 1 }])("复核不通过时不展示练习 %j", async review => {
    const request = vi.fn().mockResolvedValueOnce(JSON.stringify(practice)).mockResolvedValueOnce(JSON.stringify({ ...review, explanation: "无法确定" }));
    await expect(generateNodePractice(session, concept, [], request)).rejects.toThrow("一致性");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("不支持和重复题不强行生成，也不无限重试", async () => {
    const request = vi.fn().mockResolvedValue(JSON.stringify({ available: false }));
    await expect(generateNodePractice(session, concept, [], request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValue(JSON.stringify(practice));
    await expect(generateNodePractice(session, concept, [practice.question], request)).rejects.toThrow("重复");
  });
  it("即使两次答案一致，也拒绝无法渲染的公式", async () => {
    const request = vi.fn().mockResolvedValue(JSON.stringify({ ...practice, question: "求 $\\unknowncommand{x}$" }));
    await expect(generateNodePractice(session, concept, [], request)).rejects.toThrow("LaTeX");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("格式错误只纠正一次，修正后的完整候选仍必须通过盲审", async () => {
    const request = vi.fn().mockResolvedValueOnce('{"question" broken}')
      .mockResolvedValueOnce(JSON.stringify(practice))
      .mockResolvedValueOnce(JSON.stringify({ approved: true, correctIndex: 0, explanation: practice.explanation }));
    expect(await generateNodePractice(session, concept, [], request)).toEqual(practice);
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(request.mock.calls[1][1]).instruction).toContain("不改变题意");
    expect(JSON.parse(request.mock.calls[2][1]).correctIndex).toBeUndefined();
  });
  it("修正额度跨候选和复核共享，不能两阶段分别反复重试", async () => {
    const request = vi.fn().mockResolvedValueOnce("{bad}").mockResolvedValueOnce(JSON.stringify(practice)).mockResolvedValueOnce("{bad review}");
    await expect(generateNodePractice(session, concept, [], request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("网络失败和取消不触发内容纠正", async () => {
    const request = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(generateNodePractice(session, concept, [], request)).rejects.toThrow("Aborted");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("真实回归：独立复核把2÷0.1误算成2时拒绝练习，不替换成错误答案", async () => {
    const request = vi.fn().mockResolvedValueOnce(JSON.stringify({ ...practice, question: "电压2伏，电流0.1安，求电阻", options: ["20Ω", "0.05Ω", "2Ω"], correctIndex: 0 }))
      .mockResolvedValueOnce(JSON.stringify({ approved: true, correctIndex: 2, explanation: "2÷0.1=2" }));
    await expect(generateNodePractice(session, concept, [], request)).rejects.toThrow("一致性检查");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("各阶段共用原始时限，不通过延长等待掩盖失败", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const request = vi.fn().mockImplementationOnce(async () => { now.mockReturnValue(35000); return JSON.stringify(practice); })
      .mockResolvedValueOnce(JSON.stringify({ approved: true, correctIndex: 0, explanation: practice.explanation }));
    try {
      await generateNodePractice(session, concept, [], request);
      expect(request.mock.calls[0][4]).toBe(20000);
      expect(request.mock.calls[1][4]).toBe(5000);
    } finally { now.mockRestore(); }
  });
});
