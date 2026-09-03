import { describe, expect, it, vi } from "vitest";
import {
  adaptBoardLessonForGrade,
  gradeTeachingInstruction,
  inspectGradeLanguage,
  teachingBandOf,
  withLearnerBand,
} from "../lib/learning/grade-pedagogy";
import { analyzeMock, recognizeMock } from "../lib/learning/mock-engine";
import { ServiceError } from "../lib/learning/errors";
import { safeAssessmentFeedback } from "../lib/learning/providers/assessment";
import { createInstantBoardLesson, finalizeBoardLesson } from "../lib/learning/providers/board";
import { MockProviderAdapter } from "../lib/learning/providers/mock-adapter";
import { diagnosticSystemPrompt, solutionSystemPrompt } from "../lib/learning/providers/model-support";
import { streamValidatedSolution } from "../lib/learning/providers/solution";
import { parseQuestionSuggestions, tutorSystemPrompt } from "../lib/learning/providers/tutor";
import { parseTextProblem } from "../lib/learning/providers/provider-validation";
import { subjects, type Subject } from "../lib/learning/types";

describe("学段自适应教学表达", () => {
  it("学生学段与题目课程学段相互独立", () => {
    const problem = withLearnerBand(recognizeMock("math", "senior"), "primary");
    expect(problem.gradeBand).toBe("senior");
    expect(teachingBandOf(problem)).toBe("primary");
  });

  it("小学、初中、高中的表达契约有明确差异但都保留准确性", () => {
    const primary = gradeTeachingInstruction("primary", "chat");
    const junior = gradeTeachingInstruction("junior", "chat");
    const senior = gradeTeachingInstruction("senior", "chat");
    expect(new Set([primary, junior, senior]).size).toBe(3);
    expect(primary).toContain("一个动作、一个理由");
    expect(gradeTeachingInstruction("primary", "suggestion")).toContain("先算什么、先找哪句、先比较什么");
    expect(junior).toContain("条件—操作—理由");
    expect(gradeTeachingInstruction("junior", "suggestion")).toContain("某一步成立的理由");
    expect(senior).toContain("定义对象或变量—建立关系—给出推导依据");
    expect(gradeTeachingInstruction("senior", "suggestion")).toContain("充分必要性、适用条件、反例或边界");
    for (const instruction of [primary, junior, senior]) expect(instruction).toContain("不降低知识要求");
  });

  it("诊断、Chat 和完整讲解都采用分场景的三档结构", () => {
    expect(diagnosticSystemPrompt("primary")).toContain("题目引导的每个字段最多两句短句");
    expect(diagnosticSystemPrompt("junior")).toContain("规范术语—白话解释—题内依据");
    expect(diagnosticSystemPrompt("senior")).toContain("优先定义对象或变量");
    expect(tutorSystemPrompt("primary")).toContain("本轮只推进一个动作和一个理由");
    expect(tutorSystemPrompt("senior")).toContain("定义—推导—依据");
    expect(solutionSystemPrompt("primary")).toContain("每个编号步骤只做一个计算、判断或摘取动作");
    expect(solutionSystemPrompt("senior")).toContain("结论注明适用范围和易错边界");
  });

  it("小学质量检查能发现抽象教学词和过长单句", () => {
    expect(inspectGradeLanguage("先完成题意成模，再继续。", "primary")).toContain("abstract_meta_language");
    expect(inspectGradeLanguage(`这句话${"一直没有停顿".repeat(15)}。`, "primary")).toContain("sentence_too_long");
    expect(inspectGradeLanguage("先看题目问什么。再圈出已知条件。", "primary")).toEqual([]);
  });

  it("小学质量检查能发现一句推进多个任务", () => {
    expect(inspectGradeLanguage("先圈出已知，再写算式，然后算出结果，最后检查单位。", "primary")).toContain("too_many_actions");
    expect(inspectGradeLanguage("先圈出已知。再写算式。然后算出结果。最后检查单位。", "primary")).toContain("too_many_actions");
    expect(inspectGradeLanguage("1. 先圈出已知。\n2. 再写算式。\n3. 最后检查单位。", "primary")).not.toContain("too_many_actions");
  });

  it("小学 Chat 允许同一动作在解释和例子中重复", () => {
    const realReply = "为什么要先做这件事？先把它们单独理出来，后面才不会混。比如修路题，你也得先把“总长60米”“2天修完”这两个信息先挑出来，才能接着往下想。";
    expect(inspectGradeLanguage(realReply, "primary", "", "chat")).not.toContain("too_many_actions");
    expect(inspectGradeLanguage("先圈出条件，再列式，然后计算。", "primary", "", "chat")).toContain("too_many_actions");
  });

  it("小学完整讲解允许多个独立步骤，但不允许单步塞入多个动作", () => {
    const steps = "1. 先圈出已知。\n2. 再写算式。\n3. 然后算出结果。\n4. 最后检查单位。";
    expect(inspectGradeLanguage(steps, "primary", "", "solution")).not.toContain("too_many_actions");
    expect(inspectGradeLanguage("1. 先圈出已知，再写算式，然后算出结果，最后检查单位。", "primary", "", "solution")).toContain("too_many_actions");
    expect(inspectGradeLanguage("1. 先圈出已知，再写算式，然后算出结果。", "primary", "", "solution")).toContain("too_many_actions");
    expect(inspectGradeLanguage("先圈出已知。再写算式。然后算出结果。最后检查单位。", "primary", "", "chat")).toContain("too_many_actions");
  });

  it("小学质量检查允许题干术语和已经解释的必要术语", () => {
    expect(inspectGradeLanguage("变量控制就是一次只改变一个条件。", "primary")).not.toContain("abstract_meta_language");
    expect(inspectGradeLanguage("请判断变量控制是否正确。", "primary", "本题考查变量控制。 ")).not.toContain("abstract_meta_language");
    for (const term of ["定义域", "等价变换", "反例"]) {
      expect(inspectGradeLanguage(`先看${term}。`, "primary")).toContain("abstract_meta_language");
      expect(inspectGradeLanguage(`${term}的意思是这一步可以使用的范围。`, "primary")).not.toContain("abstract_meta_language");
      expect(inspectGradeLanguage(`题目写了${term}。`, "primary", `题目原文含有${term}。`)).not.toContain("abstract_meta_language");
    }
  });

  it("高中质量检查拒绝无必要低龄类比，但保留题干原有情境", () => {
    const analogy = "看个例子：两个小朋友折千纸鹤，就能理解这个关系。";
    expect(inspectGradeLanguage(analogy, "senior", "甲乙两队共同修路。 ")).toContain("childish_analogy");
    expect(inspectGradeLanguage(analogy, "senior", "两个小朋友折千纸鹤，问每天各折多少。 ")).toEqual([]);
    expect(inspectGradeLanguage("把 $x$ 想成一颗糖果。", "senior", "甲乙两队共同修路。 ")).toContain("childish_analogy");
    expect(inspectGradeLanguage("像搭积木一样列式。", "senior", "甲乙两队共同修路。 ")).toContain("childish_analogy");
  });

  it("小学板书缩短长句时不改写 LaTeX 公式", () => {
    const formula = "$A=(1, 2), B=(3, 4), C=(5, 6)$";
    const adapted = adaptBoardLessonForGrade({
      title: "长句检查", subtitle: "", layout: "steps", annotations: [], returnLabel: "返回",
      blocks: [{ id: "b", label: "步骤", tone: "plain", content: `这是一段需要缩短的说明文字，因为它连续补充了许多背景信息，而且还要保留坐标公式中的全部逗号和符号，不能把公式拆开或改变含义，最后再继续解释检查方法：${formula}。` }],
    }, "primary");
    expect(adapted.blocks[0].content).toContain(formula);
  });

  it("九学科板书在小学表达模式下保留学科结构并替换抽象步骤名", () => {
    for (const subject of subjects) {
      const session = subjectSession(subject);
      session.problem.learnerBand = "primary";
      let lesson: ReturnType<typeof createInstantBoardLesson> | undefined;
      expect(() => { lesson = createInstantBoardLesson(session, { kind: "problem" }, { recommended: true, reason: "把关系分步骤讲清楚。", layout: "steps" }); }, subject).not.toThrow();
      if (!lesson) throw new Error(`${subject} 板书没有生成`);
      expect(lesson.plan?.discipline, subject).toBe(subject);
      expect(lesson.plan?.scenes.map((scene) => scene.title), subject).toEqual(lesson.blocks.map((block) => block.label));
      for (const block of lesson.blocks) expect(inspectGradeLanguage(`${block.label}。${block.content}`, "primary", "", "board"), `${subject}:${block.label}`).toEqual([]);
    }
  });

  it("同一道题的三档板书可见内容不同", () => {
    const session = subjectSession("math");
    const lessons = (["primary", "junior", "senior"] as const).map((band) => {
      session.problem.learnerBand = band;
      return createInstantBoardLesson(session, { kind: "problem" }, { recommended: true, reason: "把条件关系讲清楚。", layout: "steps" });
    });
    expect(new Set(lessons.map((lesson) => lesson.blocks.map((block) => `${block.label}:${block.content}`).join("|"))).size).toBe(3);
  });

  it("演示板书会承接不同的当前卡点而不是丢弃对话", async () => {
    const adapter = new MockProviderAdapter("doubao");
    const session = subjectSession("math");
    const suggestion = { recommended: true as const, reason: "整理关系。", layout: "steps" as const };
    const units = await adapter.generateBoardLesson(session, { kind: "problem" }, suggestion, [{ id: "m-unit", role: "user", text: "我不知道这里的单位该怎么对应。" }]);
    const total = await adapter.generateBoardLesson(session, { kind: "problem" }, suggestion, [{ id: "m-total", role: "user", text: "我卡在总量和每天工作量的关系。" }]);
    expect(units.blocks[0].content).toContain("单位");
    expect(total.blocks[0].content).toContain("总量");
    expect(units.blocks[0].content).not.toBe(total.blocks[0].content);
    expect(units.plan?.sourceMessageIds).toEqual(["m-unit"]);
    expect(total.plan?.sourceMessageIds).toEqual(["m-total"]);
  });

  it("小学板书改写说明文字时不改动原题证据", () => {
    const session = subjectSession("math");
    session.problem.learnerBand = "senior";
    const raw = createInstantBoardLesson(session, { kind: "problem" }, { recommended: true, reason: "把条件关系讲清楚。", layout: "steps" });
    const evidence = "函数定义域为全体实数";
    raw.blocks[0].content = `题意成模前保留原题：${evidence}。`;
    if (raw.plan) {
      raw.plan.scenes[0].content = raw.blocks[0].content;
      raw.plan.scenes[0].evidence = evidence;
    }
    const adapted = adaptBoardLessonForGrade(raw, "primary");
    expect(adapted.blocks[0].content).toContain(evidence);
    expect(adapted.blocks[0].content).not.toContain("题意成模");
  });

  it("不支持的小学学科组合归一到实际课程学段", () => {
    const problem = parseTextProblem({ recognized: true, failureReason: "", subject: "physics", gradeBand: "primary", confidence: 0.9 }, "判断物体受到哪些力。 ");
    expect(problem.gradeBand).toBe("junior");
  });

  it("小学完整讲解只有表达告警时不清空并重播", async () => {
    const problem = withLearnerBand(recognizeMock("math", "primary"), "primary");
    const invalid = detailedSolution("题意成模后直接处理条件。", "这里使用题意成模检查关系。");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const systems: string[] = [];
    let calls = 0;
    let reset = 0;
    let output = "";
    await streamValidatedSolution(problem, async (system, _prompt, emit) => {
      systems.push(system);
      calls += 1;
      emit(invalid);
    }, (text) => { output += text; }, () => { reset += 1; output = ""; });
    expect(calls).toBe(1);
    expect(reset).toBe(0);
    expect(output).toBe(invalid);
    expect(systems.every((system) => system.includes("当前学生学段：小学"))).toBe(true);
    expect(warning).toHaveBeenCalledWith("完整讲解已完成，但学段表达仍需优化", "abstract_meta_language");
    warning.mockRestore();
  });

  it("结构重写完成后不会因学段表达告警再次清空重播", async () => {
    const problem = withLearnerBand(recognizeMock("math", "primary"), "primary");
    const invalid = "讲解还没有形成完整结构。";
    const stillNeedsPolish = detailedSolution("先看题目问什么。", "这里需要建模，再继续计算。");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let calls = 0;
    let reset = 0;
    let output = "";
    const visibleUpdates: string[] = [];
    await expect(streamValidatedSolution(problem, async (_system, _prompt, emit) => {
      emit(calls++ === 0 ? invalid : stillNeedsPolish);
    }, (text) => { visibleUpdates.push(text); output += text; }, () => { reset += 1; output = ""; })).resolves.toBeUndefined();
    expect(calls).toBe(2);
    expect(reset).toBe(1);
    expect(output).toBe(stillNeedsPolish);
    expect(visibleUpdates).toEqual([invalid, stillNeedsPolish]);
    expect(warning).toHaveBeenCalledWith("完整讲解已完成，但学段表达仍需优化", "abstract_meta_language");
    warning.mockRestore();
  });

  it("小学完整讲解已完整生成时，尾部超时不清空正文", async () => {
    const problem = withLearnerBand(recognizeMock("math", "primary"), "primary");
    const complete = detailedSolution("先看题目问什么。再找题目给出的数。", "每一步都要从题目里找到理由。");
    let reset = 0;
    let output = "";
    await streamValidatedSolution(problem, async (_system, _prompt, emit) => {
      emit(complete);
      throw new ServiceError("模型流式输出等待超时", 504, "PROVIDER_TIMEOUT", true);
    }, (text) => { output += text; }, () => { reset += 1; output = ""; });
    expect(reset).toBe(0);
    expect(output).toBe(complete);
  });

  it("小学完整讲解尾部中断但公式未闭合时必须重写", async () => {
    const problem = withLearnerBand(recognizeMock("math", "primary"), "primary");
    const incomplete = `${detailedSolution("先看题目问什么。", "每一步都从题目找理由。")}\n未闭合公式 $x+1`;
    const repaired = detailedSolution("先看题目问什么。", "每一步都从题目找理由。");
    let calls = 0;
    let reset = 0;
    const visibleUpdates: string[] = [];
    await streamValidatedSolution(problem, async (_system, _prompt, emit) => {
      emit(calls++ === 0 ? incomplete : repaired);
      if (calls === 1) throw new ServiceError("模型流式输出等待超时", 504, "PROVIDER_TIMEOUT", true);
    }, (text) => { visibleUpdates.push(text); }, () => { reset += 1; });
    expect(reset).toBe(1);
    expect(visibleUpdates).toEqual([incomplete, repaired]);
  });

  it("最终板书在学段改写后仍重新执行答案保护", () => {
    const session = subjectSession("math");
    session.problem.learnerBand = "primary";
    const lesson = createInstantBoardLesson(session, { kind: "problem" }, { recommended: true, reason: "整理关系。", layout: "steps" });
    lesson.blocks[0].content = `这里直接给出${session.nodes.find((node) => node.id === session.rootNodeId)?.check.answer}。`;
    expect(() => finalizeBoardLesson(lesson, session)).toThrow("最终答案");
  });

  it("高中完整讲解出现表达告警时也不清空并重播", async () => {
    const problem = withLearnerBand(recognizeMock("math", "primary"), "senior");
    const invalid = detailedSolution("可以把它想成两个小朋友折千纸鹤，再处理数量关系。", "检查关系是否成立。");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let calls = 0;
    let reset = 0;
    let output = "";
    await streamValidatedSolution(problem, async (_system, _prompt, emit) => {
      calls += 1;
      emit(invalid);
    }, (text) => { output += text; }, () => { reset += 1; output = ""; });
    expect(calls).toBe(1);
    expect(reset).toBe(0);
    expect(output).toBe(invalid);
    expect(warning).toHaveBeenCalledWith("完整讲解已完成，但学段表达仍需优化", "childish_analogy");
    warning.mockRestore();
  });

  it("猜你想问会丢弃单个不合学段的问题并保留其余有效问题", () => {
    const session = subjectSession("math");
    session.problem.learnerBand = "primary";
    const suggestions = parseQuestionSuggestions({ recommended: true, questions: ["为什么要先完成题意成模？", "先找题目里的哪个数？"] }, session, { kind: "problem" }, "先看题目问什么，再找已知条件。 ");
    expect(suggestions.map((item) => item.text)).toEqual(["先找题目里的哪个数？"]);
  });

  it("小学答错反馈直接告诉学生下一步检查什么", () => {
    const feedback = safeAssessmentFeedback({ id: "c", conceptId: "math", prompt: "2+3=?", type: "choice", choices: ["4", "5"], answer: "5", explanation: "加法" }, "4", { passed: false, explanation: "" }, "primary");
    expect(feedback.explanation).toContain("先检查");
    expect(feedback.explanation).not.toContain("关键关系");
  });

  it("初中与高中答错反馈使用不同表达层级", () => {
    const check = { id: "c", conceptId: "math", prompt: "2+3=?", type: "choice" as const, choices: ["4", "5"], answer: "5", explanation: "加法" };
    const junior = safeAssessmentFeedback(check, "4", { passed: false, explanation: "" }, "junior");
    const senior = safeAssessmentFeedback(check, "4", { passed: false, explanation: "" }, "senior");
    expect(junior.explanation).not.toBe(senior.explanation);
    expect(senior.explanation).toContain("题设约束");
  });
});

function subjectSession(subject: Subject) {
  const session = analyzeMock(recognizeMock(subject, "junior"), "doubao");
  const root = session.nodes.find((node) => node.id === session.rootNodeId);
  if (root) root.check.answer = "标准答案仅用于服务端核对";
  return session;
}

function detailedSolution(approach: string, reminder: string): string {
  return [
    "### 解题思路",
    approach,
    "先确定题目要找的内容。把有用条件放到一起。这样做不会改变题目事实，也不会漏掉必要依据。",
    "### 分步推导",
    "1. 先写出题目给出的条件，并说明每个数或词表示什么。",
    "2. 再按照条件之间的联系一步步处理，每一步都写出得到它的理由。",
    "3. 最后把结果放回题目检查，确认它符合全部条件。",
    "### 结论",
    "已经按照题目要求得到结论，并完成了反向检查。",
    "### 易错提醒",
    reminder,
  ].join("\n");
}
