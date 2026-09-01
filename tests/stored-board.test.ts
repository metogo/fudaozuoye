import { describe, expect, it } from "vitest";
import { isStoredBoardCache, isStoredBoardLesson, restoreBoardLesson } from "@/lib/learning/board-cache";
import { enrichBoardLessonWithSafeAids, isBoardLessonSafeForRestore } from "@/lib/learning/board-aids";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import type { BoardLesson } from "@/lib/learning/types";

const contents = ["先看清题目给出的条件。", "再连接条件之间的关系。", "最后核对每一步的依据。"];
const lesson = {
  title: "板书",
  subtitle: "梳理关系",
  returnLabel: "回到主线",
  layout: "steps",
  blocks: contents.map((content, index) => ({ id: `board-${index + 1}`, label: `步骤${index + 1}`, content, tone: "plain" })),
  annotations: [],
  plan: {
    learningGoal: "看清条件关系",
    sourceMessageIds: [],
    scenes: ["extract", "connect", "verify"].map((intent, index) => ({ id: `board-${index + 1}`, title: `步骤${index + 1}`, content: contents[index], intent, tone: "plain", sourceMessageIds: [], visual: null })),
  },
};

describe("板书缓存恢复", () => {
  it("接受完整计划并拒绝会让渲染崩溃的残缺语义图", () => {
    expect(isStoredBoardLesson(lesson)).toBe(true);
    const broken = structuredClone(lesson) as unknown as { plan: { scenes: Array<Record<string, unknown>> } };
    broken.plan.scenes[0].visual = { kind: "formula_chain", title: "公式", evidence: "原题", caption: "说明" };
    expect(isStoredBoardLesson(broken)).toBe(false);
  });

  it("拒绝场景与正文错位的陈旧缓存", () => {
    const wrongId = structuredClone(lesson) as unknown as { plan: { scenes: Array<Record<string, unknown>> } };
    wrongId.plan.scenes[1].id = "another-block";
    expect(isStoredBoardLesson(wrongId)).toBe(false);

    const wrongContent = structuredClone(lesson) as unknown as { plan: { scenes: Array<Record<string, unknown>> } };
    wrongContent.plan.scenes[1].content = "已经不是正文里的内容";
    expect(isStoredBoardLesson(wrongContent)).toBe(false);

    const unrelatedSource = structuredClone(lesson) as unknown as { plan: { sourceMessageIds: string[] } };
    unrelatedSource.plan.sourceMessageIds = ["unreferenced-chat"];
    expect(isStoredBoardLesson(unrelatedSource)).toBe(false);
  });

  it("没有语义计划的旧缓存重开时也会升级为完整学习脉络", () => {
    const legacy = { ...lesson, plan: undefined } as BoardLesson;
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const upgraded = enrichBoardLessonWithSafeAids(session, legacy);

    expect(upgraded.plan?.scenes).toHaveLength(legacy.blocks.length);
    expect(upgraded.plan?.scenes.some((scene) => scene.visual?.kind === "concept_graph")).toBe(true);
  });

  it("结构合法但泄露答案的旧缓存不会重新展示", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    root.check.answer = "8";
    const leaked = structuredClone(lesson) as BoardLesson;
    leaked.plan!.learningGoal = "最终答案是8";

    expect(isStoredBoardLesson(leaked)).toBe(true);
    expect(isBoardLessonSafeForRestore(session, leaked)).toBe(false);
  });

  it("客户端已抹掉标准答案时不冒充已通过旧缓存安全校验", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    root.check.answer = "";

    expect(isBoardLessonSafeForRestore(session, lesson as BoardLesson)).toBe(false);
  });

  it("只恢复与当前题目匹配的新版本板书缓存", () => {
    expect(isStoredBoardCache({ version: 2, requestId: "problem-1", lesson }, "problem-1")).toBe(true);
    expect(isStoredBoardCache({ version: 1, requestId: "problem-1", lesson }, "problem-1")).toBe(false);
    expect(isStoredBoardCache({ version: 2, requestId: "another-problem", lesson }, "problem-1")).toBe(false);
    expect(isStoredBoardCache({ version: 2, requestId: "problem-1", lesson: { ...lesson, blocks: [] } }, "problem-1")).toBe(false);
  });

  it("新版缓存结构合法也必须经过服务端答案复检", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    root.check.answer = "8";
    const leaked = structuredClone(lesson) as BoardLesson;
    leaked.plan!.learningGoal = "最终答案是8";

    expect(isStoredBoardCache({ version: 2, requestId: session.requestId, lesson: leaked }, session.requestId)).toBe(true);
    expect(restoreBoardLesson(session, leaked)).toBeNull();
  });

  it("识别 KaTeX 包装中的单字符答案泄露", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = session.nodes.find((node) => node.id === session.rootNodeId)!;
    root.check.answer = "8";
    const deeplyWrapped = `$x=${"\\pmb{".repeat(12)}8${"}".repeat(12)}$`;
    for (const content of ["$x=\\boxed{8}$", "$x=\\color{red}{8}$", "$x=\\underline{8}$", "最终答案为 $\\overline{8}$", "$x=\\underline{\\color{red}{8}}$", "$x=\\boxed{\\textcolor{red}{8}}$", "$x=\\overline{\\colorbox{red}{8}}$", "$x=\\cancel{8}$", "$x=\\fbox{8}$", "$x=\\mathsf{8}$", "$x=\\widehat{8}$", "$x=\\displaystyle \\boxed{8}$", "$x=\\operatorname{8}$", "$x=\\pmb{8}$", "$x=\\smash{8}$", "$x=\\overset{*}{8}$", "$x=\\raisebox{1pt}{8}$", "$x=\\boxed 8$", "$x=\\text 8$", "$x=\\mathsf 8$", "$x=\\operatorname*{8}$", "$x=\\smash[t]{8}$", "$x=\\raisebox{1pt}[2pt][3pt]{8}$", "$x=\\frac{0}{1}+\\boxed{8}$", "$x=\\sqrt{0}+\\boxed{8}$", "$x=\\overset{8}{\\phantom{0}}$", "结论：$\\boxed{8}$", "结果：$\\boxed{8}$", "答：$8$", "综上：$\\boxed{8}$", "由此：$\\boxed 8$", "最后写成：$8$", "$|x|=\\boxed{8}$", "$x^2=\\boxed{8}$", "$\\char\"38$", "$\\char56$", "$x=\\char\"38$", "$\\char`8$", "$x=\\char`8$", "$\\verb|8|$", "$x=\\verb+8+$", "$\\def\\?{8}\\?$", "$\\gdef\\?{8}\\?$", "$\\let\\?=8\\?$", deeplyWrapped]) {
      const leaked = structuredClone(lesson) as BoardLesson;
      leaked.blocks[0].content = content;
      leaked.plan!.scenes[0].content = content;
      expect(isBoardLessonSafeForRestore(session, leaked)).toBe(false);
    }

    for (const safeContent of ["$y=8x+1$", "$y=\\mathbf{8x}+1$", "$x=a+b$"]) {
      const safe = structuredClone(lesson) as BoardLesson;
      safe.blocks[0].content = safeContent;
      safe.plan!.scenes[0].content = safeContent;
      expect(isBoardLessonSafeForRestore(session, safe)).toBe(true);
    }

    root.check.answer = "A";
    const letterCoefficient = structuredClone(lesson) as BoardLesson;
    letterCoefficient.blocks[0].content = "$x=a+b$";
    letterCoefficient.plan!.scenes[0].content = "$x=a+b$";
    expect(isBoardLessonSafeForRestore(session, letterCoefficient)).toBe(true);

    const decoratedLetterCoefficient = structuredClone(lesson) as BoardLesson;
    decoratedLetterCoefficient.blocks[0].content = "$x=\\mathbf{a+b}$";
    decoratedLetterCoefficient.plan!.scenes[0].content = "$x=\\mathbf{a+b}$";
    expect(isBoardLessonSafeForRestore(session, decoratedLetterCoefficient)).toBe(true);

    const boxedLetter = structuredClone(lesson) as BoardLesson;
    boxedLetter.blocks[0].content = "$x=\\boxed{A}$";
    boxedLetter.plan!.scenes[0].content = "$x=\\boxed{A}$";
    expect(isBoardLessonSafeForRestore(session, boxedLetter)).toBe(false);

    for (const encodedLetter of ["$\\char\"41$", "$\\char65$", "$\\char`A$"]) {
      const encoded = structuredClone(lesson) as BoardLesson;
      encoded.blocks[0].content = encodedLetter;
      encoded.plan!.scenes[0].content = encodedLetter;
      expect(isBoardLessonSafeForRestore(session, encoded)).toBe(false);
    }
  });

  it("不会把另作射线后的单字母直角绑定到三角形边", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    session.problem.text = "在△ABC中，过A点另作两条互相垂直的射线AD、AE，记∠A=90°。";
    const upgraded = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    const visuals = upgraded.plan!.scenes.flatMap((scene) => scene.visual ? [scene.visual] : []);

    expect(visuals.some((visual) => visual.kind === "geometry_model")).toBe(false);
    expect(visuals.some((visual) => visual.kind === "formula_chain")).toBe(false);

    session.problem.text = "过A点另作互相垂直的射线AD、AE，并把它们的夹角记作∠A；在△ABC中，已知∠A=90°。";
    const crossClause = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    const crossClauseVisuals = crossClause.plan!.scenes.flatMap((scene) => scene.visual ? [scene.visual] : []);
    expect(crossClauseVisuals.some((visual) => visual.kind === "geometry_model" || visual.kind === "formula_chain")).toBe(false);

    session.problem.text = "在△ABC中，已知∠A=90°；注意此处∠A特指三角形外另作射线AD与AE的夹角。";
    const postClause = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(postClause.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);

    session.problem.text = "A角表示射线AD与AE的夹角；在△ABC中，已知∠A=90°。";
    const alternateNotation = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(alternateNotation.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);

    session.problem.text = "在△ABC中，已知∠A=90°，该角特指三角形外另作射线AD与AE的夹角。";
    const sameClause = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(sameClause.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);

    session.problem.text = "在△ABC中，已知∠A=90°，这里的90度指的是三角形外两条线的夹角。";
    const indirectRedefinition = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(indirectRedefinition.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);

    session.problem.text = "在△ABC中，已知∠A=90°，这里的90度与三角形内角无关。";
    const unrelatedDefinition = enrichBoardLessonWithSafeAids(session, { ...lesson, plan: undefined } as BoardLesson);
    expect(unrelatedDefinition.plan!.scenes.some((scene) => scene.visual?.kind === "geometry_model" || scene.visual?.kind === "formula_chain")).toBe(false);
  });
});
