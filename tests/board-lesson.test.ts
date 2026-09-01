import { describe, expect, it } from "vitest";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { createSafeBoardLesson, createSafeBoardVisual, parseBoardAudit, parseBoardLesson } from "@/lib/learning/providers/board";
import { parseBoardPlan } from "@/lib/learning/providers/board-plan";
import type { BoardSuggestion } from "@/lib/learning/types";

const suggestion: BoardSuggestion = { recommended: true, reason: "条件之间存在多步关系，整理成板书更容易看清。", layout: "relation" };

describe("模型板书结构校验", () => {
  it("只接受能关联真实区块且附理由的精确重点", () => {
    const lesson = parseBoardLesson(validOutput(), session(), suggestion);
    expect(lesson.blocks).toHaveLength(4);
    expect(lesson.annotations).toHaveLength(3);
    expect(lesson.annotations.every((item) => item.reason.length >= 8)).toBe(true);
    expect(lesson.visual).toBeNull();
    expect(lesson.plan?.scenes).toHaveLength(4);
  });

  it("拒绝新模型继续输出旧版坐标图元", () => {
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
    expect(() => parseBoardLesson(output, current, suggestion)).toThrow("受限语义计划");
  });

  it("模型没有返回配图时，为适合图解的真实题目生成 Rough.js 可用关系图", () => {
    const current = session();
    const visual = createSafeBoardVisual(current, suggestion);
    expect(visual).not.toBeNull();
    expect(visual?.evidence.length).toBeGreaterThanOrEqual(4);
    expect(current.problem.text).toContain(visual?.evidence);
    expect(visual?.elements.some((element) => element.type === "arrow")).toBe(true);
  });

  it("旧版三角形图只读取明确三角形名，不会把题干前面的其他点混进去", () => {
    const current = session();
    current.problem.text = "点D在图形外。在△ABC中，已知∠A=90°。";
    const visual = createSafeBoardVisual(current, suggestion);
    expect(visual?.kind).toBe("geometry");
    expect(visual?.elements.filter((element) => element.type === "point").map((element) => element.label)).toEqual(["A", "B", "C"]);
  });

  it("拒绝没有真实原文依据的示意图", () => {
    const output = validOutput();
    output.visual = {
      kind: "geometry", title: "虚构图形", evidence: "题目从未给出的平行条件", caption: "这是一张没有题干依据的图。",
      elements: [{ type: "line", x: 5, y: 10, x2: 90, y2: 10 }, { type: "line", x: 5, y: 40, x2: 90, y2: 40 }],
    };
    expect(() => parseBoardLesson(output, session(), suggestion)).toThrow("受限语义计划");
  });

  it("拒绝通过图元标签泄露最终答案", () => {
    const current = session();
    const output = validOutput();
    output.visual = {
      kind: "relation", title: "关系示意", evidence: current.problem.text.slice(0, 12), caption: "只表达题目中的数量关系，不给计算结果。",
      elements: [{ type: "point", x: 20, y: 20, label: "答案300" }, { type: "arrow", x: 20, y: 20, x2: 70, y2: 20 }],
    };
    expect(() => parseBoardLesson(output, current, suggestion)).toThrow("受限语义计划");
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
    expect(() => parseBoardLesson(visualLabel, current, suggestion)).toThrow("受限语义计划");
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

  it("会拦截公式赋值和选择结论中的单字符答案，但不误伤题干已知量", () => {
    const junior = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const root = junior.nodes.find((node) => node.id === junior.rootNodeId)!;
    root.check.answer = "8";
    const formulaLeak = validOutput();
    (formulaLeak.blocks as Array<Record<string, unknown>>)[3].content = "先逐项核对题目条件和单位，随后却直接写出 $x=8$，这已经泄露了结果。";
    expect(() => parseBoardLesson(formulaLeak, junior, suggestion)).toThrow("最终答案");

    root.check.answer = "A";
    const choiceLeak = validOutput();
    (choiceLeak.blocks as Array<Record<string, unknown>>)[3].content = "先逐项核对题目条件和选项，随后却直接说明应选择 A，这已经泄露了结果。";
    expect(() => parseBoardLesson(choiceLeak, junior, suggestion)).toThrow("最终答案");

    root.check.answer = "3";
    junior.problem.text += "，且AB=3";
    const givenOnly = validOutput();
    (givenOnly.blocks as Array<Record<string, unknown>>)[3].content = "这里只抄录题干已经明确给出的已知量 $AB=3$，继续梳理关系但不推出最终结论。";
    expect(() => parseBoardLesson(givenOnly, junior, suggestion)).not.toThrow();

    root.check.answer = "8";
    for (const leak of ["$8=x$", "$x=+8$", "$x=8.0$", "$x=08$"]) {
      const reversed = validOutput();
      (reversed.blocks as Array<Record<string, unknown>>)[3].content = `先逐项核对题目条件和单位，随后却直接写出 ${leak}，这已经泄露了结果。`;
      expect(() => parseBoardLesson(reversed, junior, suggestion)).toThrow("最终答案");
    }
    root.check.answer = "A";
    for (const leak of ["正确选项为 A", "A 项正确", "选 A"]) {
      const choice = validOutput();
      (choice.blocks as Array<Record<string, unknown>>)[3].content = `先逐项核对题目条件和选项，随后却直接说明${leak}，这已经泄露了结果。`;
      expect(() => parseBoardLesson(choice, junior, suggestion)).toThrow("最终答案");
    }
  });

  it("事实审校任一项失败都不能展示板书", () => {
    expect(parseBoardAudit({ correct: true, grounded: false, noAnswerLeak: true, markingRelevant: true, visualCorrect: true, visualGrounded: true, reason: "核心公式与原题条件不一致。" })).toEqual({ passed: false, reason: "核心公式与原题条件不一致。" });
  });

  it("语义场景必须逐项复用正文，并只引用真实对话来源", () => {
    const current = session();
    const lesson = parseBoardLesson(validOutput(), current, suggestion);
    const evidence = current.problem.text.slice(0, 12);
    const context = [{ id: "chat-1", role: "user" as const, text: "我不理解为什么要先求单位量" }];
    const plan = parseBoardPlan({
      learningGoal: "看清单位量与总量之间的关系",
      sourceMessageIds: ["chat-1"],
      scenes: lesson.blocks.map((_, index) => ({ intent: (["extract", "connect", "derive", "verify"] as const)[index], sourceMessageIds: index === 1 ? ["chat-1"] : [], visual: index === 1 ? { kind: "concept_graph", title: "单位量关系", evidence, caption: "把题目给出的量连接成一条可检查的关系。", direction: "left-right", nodes: [{ id: "total", label: "已知", role: "given" }, { id: "unit", label: "关系", role: "relation" }], edges: [{ from: "total", to: "unit", label: "对应" }] } : { kind: "none", title: "", evidence: "", caption: "" } })),
    }, current, lesson.blocks, context);

    expect(plan.scenes[1].content).toBe(lesson.blocks[1].content);
    expect(plan.scenes[1].visual?.kind).toBe("concept_graph");
    expect(() => parseBoardPlan({ ...plan, sourceMessageIds: ["unknown"] }, current, lesson.blocks, context)).toThrow("当前对话");
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

  it("明确给出直角三角形时，安全板书也会生成可交互几何模型", () => {
    const current = session();
    current.problem.text = "在三角形ABC中，∠A=90°，AB=3，AC=4，请梳理条件关系。";

    const lesson = createSafeBoardLesson(current, { kind: "problem", section: "keyClue" }, suggestion);

    const geometry = lesson.plan?.scenes.find((scene) => scene.visual?.kind === "geometry_model")?.visual;
    expect(geometry?.kind).toBe("geometry_model");
    expect(geometry && "objects" in geometry ? geometry.objects.some((object) => object.type === "right_angle") : false).toBe(true);
    const visualKinds = lesson.plan?.scenes.map((scene) => scene.visual?.kind).filter(Boolean) ?? [];
    expect(visualKinds.filter((kind) => kind === "concept_graph")).toHaveLength(2);
    expect(visualKinds).toEqual(expect.arrayContaining(["geometry_model", "formula_chain"]));
  });

  it("纯文字安全降级也会保留一张学习脉络关系图", () => {
    const lesson = createSafeBoardLesson(session(), { kind: "problem", section: "keyClue" }, suggestion);
    expect(lesson.plan?.scenes.filter((scene) => scene.visual?.kind === "concept_graph")).toHaveLength(1);
    expect(lesson.plan?.scenes.some((scene) => scene.visual?.kind === "geometry_model")).toBe(false);
  });

  it("题目所问正是直角边关系时，安全降级不再重复注入答案关系", () => {
    const current = session();
    current.problem.text = "在△ABC中，∠A=90°，问AB与AC有什么位置关系？";
    const root = current.nodes.find((node) => node.id === current.rootNodeId)!;
    root.check.answer = "垂直";
    root.check.explanation = "直角两边互相垂直。";

    const lesson = createSafeBoardLesson(current, { kind: "problem", section: "keyClue" }, suggestion);
    const visualKinds = lesson.plan?.scenes.flatMap((scene) => scene.visual ? [scene.visual.kind] : []) ?? [];

    expect(visualKinds.filter((kind) => kind === "concept_graph")).toHaveLength(2);
    expect(visualKinds).toContain("geometry_model");
    expect(lesson.plan?.scenes.some((scene) => scene.visual?.kind === "formula_chain")).toBe(false);
  });

  it("拒绝模型坐标、虚构直角和未从依据中抄出的函数系数", () => {
    const current = session();
    current.problem.text = "在△ABC中，∠A=90°；函数P(x)=x^3-3x+1。";
    const blocks = createSafeBoardLesson(current, { kind: "problem" }, suggestion).blocks;
    const geometry = { kind: "geometry_model", title: "直角", evidence: "在△ABC中，∠A=90°", caption: "核对图形中的直角条件。", points: [{ id: "A", label: "A", x: 0 }, { id: "B", label: "B" }, { id: "C", label: "C" }], objects: [{ type: "right_angle", vertex: "B", from: "A", to: "C" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, geometry), current, blocks, [])).toThrow();
    const functionPlot = { kind: "function_plot", title: "函数", evidence: "函数P(x)=x^3-3x+1", caption: "核对题目给出的函数变化。", domain: [-2, 2], series: [{ id: "f", label: "P(x)", coefficients: [1, 0, -2, 1], color: "emerald" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, functionPlot), current, blocks, [])).toThrow("系数");
    current.problem.text += "另有y=x^2-10。";
    const prefixPlot = { ...functionPlot, evidence: "另有y=x^2-10", series: [{ id: "g", label: "y", coefficients: [1, 0, -1], color: "amber" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, prefixPlot), current, blocks, [])).toThrow("系数");
  });

  it("直角必须匹配两条真实射线，函数必须有明确表达式且服从题干定义域", () => {
    const current = session();
    current.problem.text = "在△ABC中，∠BAC=90°，点D在边BC上；函数y=x，x∈[0,1]，求x的值。";
    const blocks = createSafeBoardLesson(current, { kind: "problem" }, suggestion).blocks;
    const wrongRays = { kind: "geometry_model", title: "直角", evidence: "在△ABC中，∠BAC=90°，点D在边BC上", caption: "核对直角两边。", points: [{ id: "A", label: "A" }, { id: "C", label: "C" }, { id: "D", label: "D" }], objects: [{ type: "right_angle", vertex: "A", from: "C", to: "D" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, wrongRays), current, blocks, [])).toThrow("两条射线");

    const missingExpression = { kind: "function_plot", title: "函数", evidence: "求x的值", caption: "观察函数图像的变化关系。", domain: [-2, 2], series: [{ id: "f", label: "y", coefficients: [1, 0], color: "emerald" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, missingExpression), current, blocks, [])).toThrow("系数");

    const wrongDomain = { ...missingExpression, evidence: "函数y=x，x∈[0,1]", domain: [-100, 100] };
    expect(() => parseBoardPlan(semanticPlan(blocks, wrongDomain), current, blocks, [])).toThrow("定义域");

    const shortenedEvidence = { ...wrongDomain, evidence: "函数y=x" };
    expect(() => parseBoardPlan(semanticPlan(blocks, shortenedEvidence), current, blocks, [])).toThrow("定义域");

    current.problem.text += "另有函数g=x+1，且0≤x≤1。";
    const prefix = { ...missingExpression, evidence: "函数g=x+1", series: [{ id: "g", label: "g", coefficients: [1, 0], color: "emerald" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, prefix), current, blocks, [])).toThrow("系数");
    const wrongLabel = { ...missingExpression, evidence: "函数y=x", domain: [0, 1], series: [{ id: "f", label: "g", coefficients: [1, 0], color: "emerald" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, wrongLabel), current, blocks, [])).toThrow("函数标签");

    current.problem.text += "另有函数f=x，且x>0。";
    const openDomain = { ...missingExpression, evidence: "函数f=x，且x>0", series: [{ id: "f", label: "f", coefficients: [1, 0], color: "emerald" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, openDomain), current, blocks, [])).toThrow("闭区间");

    for (const unsupported of ["x∈[0,1)", "x∈{0,1}", "x∈[0,1]∪[2,3]"]) {
      current.problem.text = `函数f=x，${unsupported}。`;
      const unsupportedDomain = { ...openDomain, evidence: `函数f=x，${unsupported}`, domain: [0, 1] };
      expect(() => parseBoardPlan(semanticPlan(blocks, unsupportedDomain), current, blocks, [])).toThrow("闭区间");
    }

    current.problem.text = "同一句给出函数y=x，x∈[0,1]，另有函数f=x，x>0。";
    const borrowedDomain = { ...openDomain, evidence: "函数f=x，x>0", domain: [0, 1] };
    expect(() => parseBoardPlan(semanticPlan(blocks, borrowedDomain), current, blocks, [])).toThrow("闭区间");
  });

  it("不会把线段画成无限直线或箭头，也不会把直径当成半径", () => {
    const current = session();
    current.problem.text = "在△ABC中有线段AB；圆O的直径为4，点A在圆外。";
    const blocks = createSafeBoardLesson(current, { kind: "problem" }, suggestion).blocks;
    const base = { kind: "geometry_model", title: "几何关系", evidence: "在△ABC中有线段AB", caption: "只呈现题目明确给出的几何对象。", points: [{ id: "A", label: "A" }, { id: "B", label: "B" }], objects: [{ type: "line", from: "A", to: "B" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, base), current, blocks, [])).toThrow("无限直线");
    const arrow = { ...base, objects: [{ type: "arrow", from: "A", to: "B" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, arrow), current, blocks, [])).toThrow("方向箭头");
    const circle = { ...base, evidence: "圆O的直径为4，点A在圆外", points: [{ id: "O", label: "O" }, { id: "A", label: "A" }], objects: [{ type: "circle", center: "O", radius: 4 }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, circle), current, blocks, [])).toThrow("圆心或圆名");

    current.problem.text = "圆P的半径为4，点O与点A在图中。";
    const borrowedRadius = { ...circle, evidence: "圆P的半径为4，点O与点A在图中" };
    expect(() => parseBoardPlan(semanticPlan(blocks, borrowedRadius), current, blocks, [])).toThrow("圆心或圆名");

    current.problem.text = "点O与点A在图中。";
    const duplicateLabels = { ...base, evidence: "点O与点A在图中", points: [{ id: "O1", label: "O" }, { id: "O2", label: "O" }], objects: [{ type: "segment", from: "O1", to: "O2" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, duplicateLabels), current, blocks, [])).toThrow("标签不能重复");
  });

  it("拒绝用等价 LaTeX 写法泄露最终答案", () => {
    const current = session();
    const root = current.nodes.find((node) => node.id === current.rootNodeId)!;
    root.check.answer = "1/2";
    const blocks = createSafeBoardLesson(current, { kind: "problem" }, suggestion).blocks;
    const formula = { kind: "formula_chain", title: "推导", evidence: current.problem.text.slice(0, 12), caption: "只检查表达式之间的联系。", steps: [{ id: "s1", expression: "$x=1$", explanation: "先写当前关系" }, { id: "s2", expression: "$x=\\frac{1}{2}$", explanation: "再写下一步关系" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, formula), current, blocks, [])).toThrow("最终答案");
    (formula.steps[1] as { expression: string }).expression = "$x=\\dfrac{1}{2}$";
    expect(() => parseBoardPlan(semanticPlan(blocks, formula), current, blocks, [])).toThrow("最终答案");
    root.check.answer = "0.5";
    (formula.steps[1] as { expression: string }).expression = "$x=\\frac{1}{2}$";
    expect(() => parseBoardPlan(semanticPlan(blocks, formula), current, blocks, [])).toThrow("最终答案");
  });

  it("答案带单位时也会拦截只泄露数值的公式", () => {
    const current = session();
    const root = current.nodes.find((node) => node.id === current.rootNodeId)!;
    root.check.answer = "1/2米";
    const blocks = createSafeBoardLesson(current, { kind: "problem" }, suggestion).blocks;
    const formula = { kind: "formula_chain", title: "推导", evidence: current.problem.text.slice(0, 12), caption: "只检查表达式之间的联系。", steps: [{ id: "s1", expression: "$s=1$", explanation: "先写当前关系" }, { id: "s2", expression: "$s=\\frac{1}{2}$", explanation: "再写下一步关系" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, formula), current, blocks, [])).toThrow("最终答案");
  });

  it("安全几何不把三角形外的射线误画成内角，关系图也不接受无依据节点", () => {
    const current = session();
    current.problem.text = "在△ABC中，点D在三角形外，且∠ABD=90°。";
    const lesson = createSafeBoardLesson(current, { kind: "problem" }, suggestion);
    expect(lesson.plan?.scenes.some((scene) => scene.visual?.kind === "geometry_model")).toBe(false);
    expect(lesson.plan?.scenes.some((scene) => scene.visual?.kind === "concept_graph")).toBe(true);

    current.problem.text = "在△ABC中，AB=3。另有四边形ADEF，∠A=90°。";
    const separatedConditions = createSafeBoardLesson(current, { kind: "problem" }, suggestion);
    expect(separatedConditions.plan?.scenes.some((scene) => scene.visual?.kind === "geometry_model")).toBe(false);
    expect(separatedConditions.plan?.scenes.some((scene) => scene.visual?.kind === "formula_chain")).toBe(false);

    current.problem.text = "在△ABC中未给出角度，另有正方形ADEF，正方形的∠A=90°。";
    const sharedVertex = createSafeBoardLesson(current, { kind: "problem" }, suggestion);
    expect(sharedVertex.plan?.scenes.some((scene) => scene.visual?.kind === "geometry_model")).toBe(false);
    expect(sharedVertex.plan?.scenes.some((scene) => scene.visual?.kind === "formula_chain")).toBe(false);
    const nonsense = { kind: "concept_graph", title: "关系", evidence: "在△ABC中", caption: "核对题目中真实存在的关系。", direction: "left-right", nodes: [{ id: "sun", label: "太阳", role: "given" }, { id: "moon", label: "月亮", role: "step" }], edges: [{ from: "sun", to: "moon", label: "直接导致" }] };
    expect(() => parseBoardPlan(semanticPlan(lesson.blocks, nonsense), current, lesson.blocks, [])).toThrow("节点");

    current.problem.text = "已知速度和时间，请整理条件。";
    const inventedCausality = { kind: "concept_graph", title: "关系", evidence: "已知速度和时间", caption: "核对题目中真实存在的关系。", direction: "left-right", nodes: [{ id: "speed", label: "速度", role: "given" }, { id: "time", label: "时间", role: "given" }], edges: [{ from: "speed", to: "time", label: "决定" }] };
    expect(() => parseBoardPlan(semanticPlan(lesson.blocks, inventedCausality), current, lesson.blocks, [])).toThrow("直接支持");

    const wrongRole = { ...inventedCausality, nodes: [{ id: "known", label: "已知", role: "step" }, { id: "time", label: "时间", role: "given" }], edges: [{ from: "known", to: "time", label: "关联" }] };
    expect(() => parseBoardPlan(semanticPlan(lesson.blocks, wrongRole), current, lesson.blocks, [])).toThrow("角色");
  });

  it("答案带单位或格式变化时也不允许用单字符数值提前给结论", () => {
    const current = session();
    const root = current.nodes.find((node) => node.id === current.rootNodeId)!;
    const blocks = createSafeBoardLesson(current, { kind: "problem" }, suggestion).blocks;
    root.check.answer = "8米";
    const formula = { kind: "formula_chain", title: "推导", evidence: current.problem.text.slice(0, 12), caption: "只检查表达式之间的联系。", steps: [{ id: "s1", expression: "$s=1$", explanation: "先写当前关系" }, { id: "s2", expression: "$s=8$", explanation: "再写下一步关系" }] };
    expect(() => parseBoardPlan(semanticPlan(blocks, formula), current, blocks, [])).toThrow("最终答案");
  });
});

function semanticPlan(blocks: Array<{ id: string }>, visual: Record<string, unknown>) {
  return { learningGoal: "看清条件和关系之间怎样连接", sourceMessageIds: [], scenes: blocks.map((_, index) => ({ intent: (["extract", "connect", "derive", "verify", "compare"] as const)[index] ?? "verify", sourceMessageIds: [], visual: index === 1 ? visual : { kind: "none", title: "", evidence: "", caption: "" } })) };
}

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
