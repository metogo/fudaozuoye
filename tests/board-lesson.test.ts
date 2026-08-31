import { describe, expect, it } from "vitest";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { createSafeBoardLesson, createSafeBoardVisual, parseBoardAudit, parseBoardLesson } from "@/lib/learning/providers/board";
import type { BoardSuggestion } from "@/lib/learning/types";

const suggestion: BoardSuggestion = { recommended: true, reason: "条件之间存在多步关系，整理成板书更容易看清。", layout: "relation" };

describe("模型板书结构校验", () => {
  it("只接受能关联真实区块且附理由的精确重点", () => {
    const lesson = parseBoardLesson(validOutput(), session(), suggestion);
    expect(lesson.blocks).toHaveLength(4);
    expect(lesson.annotations).toHaveLength(3);
    expect(lesson.annotations.every((item) => item.reason.length >= 8)).toBe(true);
    expect(lesson.visual?.kind).toBe("relation");
    expect(lesson.visual?.elements.length).toBeGreaterThanOrEqual(3);
  });

  it("接受有题干直接依据的结构化示意图", () => {
    const current = session();
    const output = validOutput();
    output.visual = {
      kind: "relation",
      title: "路程关系示意",
      evidence: current.problem.text.slice(0, 12),
      caption: "把总路程、时间与单位时间路程的关系放在同一张图里。",
      elements: [
        { type: "rect", x: 8, y: 18, width: 24, height: 18, label: "总路程" },
        { type: "arrow", x: 34, y: 27, x2: 60, y2: 27, label: "平均分" },
        { type: "rect", x: 64, y: 18, width: 26, height: 18, label: "每小时路程" },
      ],
    };
    const lesson = parseBoardLesson(output, current, suggestion);
    expect(lesson.visual?.elements).toHaveLength(3);
  });

  it("模型没有返回配图时，为适合图解的真实题目生成 Rough.js 可用关系图", () => {
    const current = session();
    const visual = createSafeBoardVisual(current, suggestion);
    expect(visual).not.toBeNull();
    expect(visual?.evidence.length).toBeGreaterThanOrEqual(4);
    expect(current.problem.text).toContain(visual?.evidence);
    expect(visual?.elements.some((element) => element.type === "arrow")).toBe(true);
  });

  it("拒绝没有真实原文依据的示意图", () => {
    const output = validOutput();
    output.visual = {
      kind: "geometry", title: "虚构图形", evidence: "题目从未给出的平行条件", caption: "这是一张没有题干依据的图。",
      elements: [{ type: "line", x: 5, y: 10, x2: 90, y2: 10 }, { type: "line", x: 5, y: 40, x2: 90, y2: 40 }],
    };
    expect(() => parseBoardLesson(output, session(), suggestion)).toThrow("逐字来自题干");
  });

  it("拒绝通过图元标签泄露最终答案", () => {
    const current = session();
    const output = validOutput();
    output.visual = {
      kind: "relation", title: "关系示意", evidence: current.problem.text.slice(0, 12), caption: "只表达题目中的数量关系，不给计算结果。",
      elements: [{ type: "point", x: 20, y: 20, label: "答案300" }, { type: "arrow", x: 20, y: 20, x2: 70, y2: 20 }],
    };
    expect(() => parseBoardLesson(output, current, suggestion)).toThrow("最终答案");
  });

  it("拒绝模型标记区块中不存在的文字", () => {
    const output = validOutput();
    (output.annotations as Array<Record<string, unknown>>)[0].target = "并不存在的重点";
    expect(() => parseBoardLesson(output, session(), suggestion)).toThrow("真实原文");
  });

  it("重点命中公式内部时自动扩展到完整公式边界", () => {
    const output = validOutput();
    (output.blocks as Array<Record<string, unknown>>)[0].content = "先看题目中的核心关系 $v=s/t$，再核对路程和时间的单位是否一致。";
    (output.annotations as Array<Record<string, unknown>>)[0].target = "v=s/t";

    const lesson = parseBoardLesson(output, session(), suggestion);

    expect(lesson.annotations[0].target).toBe("$v=s/t$");
  });

  it("拒绝把公式塞进板书区块标题或 SVG 图元标签", () => {
    const formulaLabel = validOutput();
    (formulaLabel.blocks as Array<Record<string, unknown>>)[0].label = "核心 $v=s/t$";
    expect(() => parseBoardLesson(formulaLabel, session(), suggestion)).toThrow("无公式");

    const visualLabel = validOutput();
    const current = session();
    visualLabel.visual = {
      kind: "relation", title: "路程关系示意", evidence: current.problem.text.slice(0, 12), caption: "只表达题目中数量之间的连接关系。",
      elements: [{ type: "point", x: 20, y: 20, label: "x+1" }, { type: "arrow", x: 20, y: 20, x2: 70, y2: 20 }],
    };
    expect(() => parseBoardLesson(visualLabel, current, suggestion)).toThrow("不能承载公式");
  });

  it("拒绝机械截取每个区块开头作为重点", () => {
    const output = validOutput();
    output.annotations = [
      { blockIndex: 0, target: "先看", kind: "circle", reason: "这是第一个机械开头标记，不能作为教学判断。" },
      { blockIndex: 1, target: "再把", kind: "underline", reason: "这是第二个机械开头标记，不能作为教学判断。" },
      { blockIndex: 2, target: "然后", kind: "box", reason: "这是第三个机械开头标记，不能作为教学判断。" },
    ];
    expect(() => parseBoardLesson(output, session(), suggestion)).toThrow("机械截取");
  });

  it("拒绝在引导阶段提前写出原题答案", () => {
    const output = validOutput();
    (output.blocks as Array<Record<string, unknown>>)[3].content = "最后只做自查，但这里故意提前写出最终结果 300，这是不允许出现的内容。";
    expect(() => parseBoardLesson(output, session(), suggestion)).toThrow("最终答案");
  });

  it("会扫描标记理由，并拦截单字符最终答案", () => {
    const output = validOutput();
    (output.annotations as Array<Record<string, unknown>>)[0].reason = "这里直接写出最终答案是 8，应该被拒绝。";
    const junior = analyzeMock(recognizeMock("math", "junior"), "doubao");
    expect(() => parseBoardLesson(output, junior, suggestion)).toThrow("最终答案");
  });

  it("事实审校任一项失败都不能展示板书", () => {
    expect(parseBoardAudit({ correct: true, grounded: false, noAnswerLeak: true, markingRelevant: true, visualCorrect: true, visualGrounded: true, reason: "核心公式与原题条件不一致。" })).toEqual({ passed: false, reason: "核心公式与原题条件不一致。" });
  });

  it("模型上下文含答案时降级为中性安全板书，而不是让整个板书入口失败", () => {
    const current = session();
    const answer = current.nodes.find((node) => node.id === current.rootNodeId)?.check.answer ?? "300";
    current.problemGuide.goal = `最终答案是 ${answer}`;
    current.problemGuide.keyClue = `直接记住答案 ${answer}`;

    const lesson = createSafeBoardLesson(current, { kind: "problem", section: "keyClue" }, suggestion);

    expect(lesson.title).toBe("把当前思路整理清楚");
    expect(lesson.blocks).toHaveLength(5);
    expect(lesson.annotations).toHaveLength(3);
    expect(lesson.blocks.map((block) => block.content).join(" ")).not.toContain(answer);
  });
});

function session() {
  return analyzeMock(recognizeMock("math", "primary"), "doubao");
}

function validOutput(): Record<string, unknown> {
  return {
    title: "把路程问题的关系铺开",
    blocks: [
      { label: "任务与条件", content: "先看题目要寻找的量，再从原题中区分总路程、总时间和每小时路程。", tone: "plain" },
      { label: "核心关系", content: "再把总路程平均分到每个小时，单位量由总量和份数之间的关系决定。", tone: "key" },
      { label: "推理顺序", content: "然后先得到每小时路程，再让同样的速度对应新的时间，前后关系不能颠倒。", tone: "example" },
      { label: "易错自查", content: "动笔后检查单位和乘除顺序，确认每一步都能用题目条件解释，而不是只套数字。", tone: "plain" },
    ],
    annotations: [
      { blockIndex: 0, target: "总路程、总时间和每小时路程", kind: "circle", reason: "这三个量决定后面应该建立什么数量关系。" },
      { blockIndex: 1, target: "总量和份数之间的关系", kind: "underline", reason: "这是求单位量时不能颠倒的核心关系。" },
      { blockIndex: 2, target: "前后关系不能颠倒", kind: "box", reason: "这里是学生最容易把乘除顺序弄反的位置。" },
    ],
    visual: { kind: "none", title: "", evidence: "", caption: "", elements: [] },
  };
}
