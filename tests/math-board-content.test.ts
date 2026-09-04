import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkedBoardText } from "../components/board-learning-content";
import { RichLearningText } from "../components/rich-learning-text";
import { createMathBoardContent } from "../lib/learning/board-math-content";
import { analyzeMock, recognizeMock } from "../lib/learning/mock-engine";
import { createInstantBoardLesson } from "../lib/learning/providers/board";
import { assertBalancedLearningMarkup } from "../lib/learning/presentation";

describe("数学原生推导板书", () => {
  it("一般三角形三角式生成真实推导，并让正文、公式和图形共用条件模型", () => {
    const session = mathSession("在△ABC中，角A、B、C所对的边分别为a、b、c。已知 sinB+sinC=2sinA cosC，且b=3，△ABC的面积为3√3/2，则a的长为多少？A. 3√3 B. 2√3 C. 3 D. √3");
    const model = createMathBoardContent(session.problem.text);
    expect(model?.knownSides).toContainEqual(expect.objectContaining({ symbol: "b", raw: "3" }));
    expect(model?.area).toMatchObject({ symbol: "S", raw: "3√3/2" });

    const board = boardFor(session);
    expect(board.quality).toBeUndefined();
    expect(board.blocks.map((block) => block.label)).toEqual(["题意成模", "关系结构", "依据变换", "反查边界"]);
    const visible = board.blocks.map((block) => block.content).join("\n");
    for (const expected of ["$b=3$", "$S=\\frac{3\\sqrt{3}}{2}$", "$b+c=2a\\cos C$", "$c^{2}=a^{2}+b^{2}-2ab\\cos C$", "$a^{2}=c(b+c)$", "三边不等式"]) expect(visible).toContain(expected);
    expect(visible).not.toContain("A. 3√3");

    for (const block of board.blocks) {
      assertRenderedMath(renderToStaticMarkup(createElement(RichLearningText, { text: block.content })), block.label);
      const marked = renderToStaticMarkup(createElement(MarkedBoardText, { content: block.content, annotations: board.annotations.filter((annotation) => annotation.blockId === block.id) }));
      assertRenderedMath(marked, `${block.label}/marked`);
      expect(() => assertBalancedLearningMarkup(block.content, block.label)).not.toThrow();
    }

    const visuals = board.plan?.scenes.flatMap((scene) => scene.visual ? [scene.visual] : []) ?? [];
    expect(visuals.map((visual) => visual.kind)).toEqual(["geometry_model", "formula_chain"]);
    const geometry = visuals.find((visual) => visual.kind === "geometry_model");
    if (geometry?.kind === "geometry_model") {
      expect(geometry.objects.flatMap((object) => "label" in object && object.label ? [object.label] : [])).toEqual(expect.arrayContaining(["a", "b=3", "c", "∠C"]));
      expect(geometry.objects).toContainEqual(expect.objectContaining({ type: "angle", vertex: "C", label: "∠C" }));
    }
    const formula = visuals.find((visual) => visual.kind === "formula_chain");
    if (formula?.kind === "formula_chain") {
      expect(formula.steps.map((step) => step.expression).join(" ")).toContain("$a^{2}=c(b+c)$");
      expect(formula.steps[0].expression).toMatch(/^\$[^$]+\\Rightarrow [^$]+\$$/);
      formula.steps.forEach((step) => expect(() => assertBalancedLearningMarkup(step.expression, step.id)).not.toThrow());
    }
  });

  it("数值、已知边和待求边变化时仍保持同一数学关系", () => {
    const variant = boardFor(mathSession("在△ABC中，角A、B、C的对边为a、b、c，sin B + sin C = 2 sin A cos C，b=5，三角形ABC的面积是10，求a的长度。"));
    expect(boardText(variant)).toContain("$b=5$");
    expect(boardText(variant)).toContain("$S=10$");

    const renamed = boardFor(mathSession("在△ABC中，角A、B、C的对边为a、b、c，sinA+sinC=2sinBcosC，a=4，三角形ABC的面积是6，求b的长度。"));
    expect(boardText(renamed)).toContain("$a+c=2b\\cos C$");
    expect(boardText(renamed)).toContain("待求边是 $b$");

    const changedUnknown = mathSession("在△ABC中，a、b、c分别为∠A、∠B、∠C对边，sinB+sinC=2cosCsinA，b=3，△ABC的面积为6，求边长c。");
    expect(createMathBoardContent(changedUnknown.problem.text)?.targetSide).toBe("c");
    expect(boardText(boardFor(changedUnknown))).toContain("待求边是 $c$");

    const changedGiven = boardFor(mathSession("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，c=3，三角形ABC的面积是6，求a的长度。"));
    expect(boardText(changedGiven)).toContain("$c=3$");
    expect(boardText(changedGiven)).not.toContain("至少一条已知边长");
  });

  it("条件不足或歧义时明确停住，不补造数值和对象", () => {
    const incomplete = boardFor(mathSession("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=5，求a的长度。"));
    expect(boardText(incomplete)).toContain("尚缺三角形面积");
    expect(boardText(incomplete)).toContain("在条件补齐前不能代入候选值");
    expect(createMathBoardContent("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=3，△ABC面积为6，求角A的值。")).toBeNull();

    const foreignArea = createMathBoardContent("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=3，△DEF面积为6，求a的长度。");
    expect(foreignArea?.area).toBeUndefined();
    expect(foreignArea?.gaps).toContain("三角形面积");

    const invalidScalar = createMathBoardContent("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=6/2*3，△ABC面积为6，求a的长度。");
    expect(invalidScalar?.knownSides).toEqual([]);
    expect(invalidScalar?.gaps).toContain("至少一条已知边长");

    for (const problem of [
      "在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，△ABC面积为6，求a。A. a=3 B. a=4",
      "在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=.，△ABC面积为6，求a。",
      "在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=1/0，△ABC面积为6，求a。",
      "在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=0/2，△ABC面积为6，求a。",
      "在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，A=1，△ABC面积为6，求a。",
      "在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC。A. a=2 B. a=3；求a。",
      "在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC。Ａ．a=2 Ｂ．a=3；求a。",
      "在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC。① a=2 ② a=3；求a。",
    ]) expect(createMathBoardContent(problem)?.knownSides).toEqual([]);

    for (const relation of ["sinB+sinC=2sinAcosC+1", "sinB+sinC=2sinAcosC/2", "x+sinB+sinC=2sinAcosC", "sinB+sinC=2sinAcosC^2", "sinB+sinC=2sinAcosC×2", "sinB+sinC=2sinAcosC÷2", "x×sinB+sinC=2sinAcosC", "sinB+sinC=2sinAcosC−1"]) {
      expect(createMathBoardContent(`在△ABC中，角A、B、C的对边为a、b、c，${relation}，b=3，△ABC面积为6，求a。`)).toBeNull();
    }
    expect(createMathBoardContent("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=3。另作△DEF，其面积为6，求a。")?.area).toBeUndefined();
    expect(createMathBoardContent("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=3。另一个三角形面积为6，求a。")?.area).toBeUndefined();
    expect(createMathBoardContent("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=3。还有一个三角形面积为6，求a。")?.area).toBeUndefined();
    for (const phrase of ["另外一个三角形", "另取一个三角形", "另一三角形"]) {
      expect(createMathBoardContent(`在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=3。${phrase}面积为6，求a。`)?.area).toBeUndefined();
    }
    for (const pronoun of ["该三角形", "此三角形", "这个三角形", "本三角形"]) {
      expect(createMathBoardContent(`在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=3，${pronoun}面积为6，求a。`)?.area?.raw).toBe("6");
    }
    expect(createMathBoardContent("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=3，△ABC面积为6，求∠A为多少。")).toBeNull();
    expect(createMathBoardContent("在△ABC中，角A、B、C的对边为a、b、c，sinB+sinC=2sinAcosC，b=3，△ABC面积为6，求A的度数。")).toBeNull();
  });

  it("重点标记即使横跨公式边界，也会扩成完整公式后再渲染", () => {
    const content = "明确待求。一般三角形 $\\triangle ABC$，再用 $\\sin B+\\sin C=2\\sin A\\cos C$ 建立关系。";
    const html = renderToStaticMarkup(createElement(MarkedBoardText, {
      content,
      annotations: [{ blockId: "board-1", target: "待求。一般三角形 $\\t", kind: "circle", reason: "标出对象" }],
    }));
    assertRenderedMath(html, "跨公式标记");
  });
});

function mathSession(problem: string) {
  const session = analyzeMock(recognizeMock("math", "senior"), "doubao");
  session.problem.text = problem;
  session.problemGuide.goal = "利用三角形关系分析待求边";
  session.problemGuide.keyClue = problem;
  session.nodes.find((node) => node.id === session.rootNodeId)!.check.answer = "标准答案仅服务端持有";
  return session;
}

function boardFor(session: ReturnType<typeof mathSession>) {
  return createInstantBoardLesson(session, { kind: "problem" }, { recommended: true, reason: "整理一般三角形条件。", layout: "formula" });
}

function boardText(board: ReturnType<typeof boardFor>): string {
  return board.blocks.map((block) => block.content).join(" ");
}

function assertRenderedMath(html: string, label: string) {
  expect(html.match(/class="katex"/g)?.length ?? 0, label).toBeGreaterThan(0);
  expect(html, label).not.toContain("katex-error");
  expect(html, label).not.toContain("color:#cc0000");
  expect(html, label).not.toMatch(/\$+\\[A-Za-z]+/);
  expect(html, label).not.toMatch(/\\[([]/);
}
