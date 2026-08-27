"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeFromConcept = nodeFromConcept;
exports.recognizeMock = recognizeMock;
exports.analyzeMock = analyzeMock;
exports.expandMock = expandMock;
exports.verifyMock = verifyMock;
exports.transferCheckMock = transferCheckMock;
exports.solutionMock = solutionMock;
const curriculum_1 = require("./curriculum");
const graph_1 = require("./graph");
const samples = {
    math: {
        primary: { text: "一辆车 3 小时行驶 180 千米，照这样的速度，5 小时行驶多少千米？", childWork: "180÷5×3=108（孩子在这里卡住了）" },
        junior: { text: "解方程：3(x-2)=18。", childWork: "3x-2=18，接下来不会了" },
        senior: { text: "已知二次函数 y=x²-4x+3，求它的顶点坐标。", childWork: "不知道怎样配方" },
    },
    physics: {
        primary: { text: "小车 5 秒行驶 50 米，平均每秒行驶多少米？", childWork: "50×5=250" },
        junior: { text: "汽车 5 秒内匀速行驶 50 米，它的速度是多少？", childWork: "不会确定公式和单位" },
        senior: { text: "质量为 2 kg 的物体受到 10 N 合力，加速度是多少？", childWork: "写出了 F=ma，但不会代入" },
    },
    chemistry: {
        primary: { text: "写出水由哪些元素组成。", childWork: "不认识元素符号" },
        junior: { text: "配平化学方程式：H₂ + O₂ → H₂O。", childWork: "H₂ + O₂ → 2H₂O" },
        senior: { text: "1 mol O₂ 含有多少个氧分子？", childWork: "不知道物质的量和粒子数关系" },
    },
};
const checkBank = {
    "math.number.counting": { prompt: "6 和 4 中，哪个数更大？", type: "choice", choices: ["4", "6"], answer: "6", explanation: "数轴上越靠右的数越大。" },
    "math.arithmetic.addition": { prompt: "3 个苹果再添 4 个，一共有几个？", type: "choice", choices: ["7", "12", "1"], answer: "7", explanation: "把两部分合在一起，用加法。" },
    "math.arithmetic.multiplication": { prompt: "每盒 12 支笔，4 盒共有多少支？", type: "choice", choices: ["16", "48", "3"], answer: "48", explanation: "4 个 12 相加，12×4=48。" },
    "math.arithmetic.division": { prompt: "20 颗糖平均分给 5 人，每人几颗？", type: "choice", choices: ["4", "15", "100"], answer: "4", explanation: "求每份是多少，用总数除以份数。" },
    "math.rate.unit-rate": { prompt: "2 小时行驶 120 千米，每小时行驶多少千米？", type: "choice", choices: ["60", "122", "240"], answer: "60", explanation: "单位量=总量÷份数，120÷2=60。" },
    "math.ratio.proportional": { prompt: "每小时 60 千米，4 小时行驶多少千米？", type: "choice", choices: ["15", "64", "240"], answer: "240", explanation: "速度不变时，路程随时间同倍变化。" },
    "math.algebra.variable": { prompt: "一个数记作 x，它的 3 倍应写成什么？", type: "choice", choices: ["x+3", "3x", "x÷3"], answer: "3x", explanation: "3 个 x 相加简写为 3x。" },
    "math.algebra.equality": { prompt: "等式 8=8 的两边同时减 3，结果是什么？", type: "choice", choices: ["5=5", "5=8", "8=5"], answer: "5=5", explanation: "等号表示两边相等，同做相同变化仍相等。" },
    "math.algebra.equivalent-transform": { prompt: "x+4=9，两边同时减 4 后得到什么？", type: "choice", choices: ["x=5", "x=13", "x=4"], answer: "x=5", explanation: "等式两边同减一个数，等式仍成立。" },
    "math.arithmetic.order": { prompt: "计算 2×(3+1) 时应先算哪一步？", type: "choice", choices: ["3+1", "2×3", "2×1"], answer: "3+1", explanation: "混合运算中先计算括号内。" },
    "math.algebra.expression": { prompt: "比 x 的 2 倍多 3，应写成什么？", type: "choice", choices: ["2x+3", "2(x+3)", "x+6"], answer: "2x+3", explanation: "先用 2x 表示 x 的 2 倍，再加 3。" },
    "math.power.meaning": { prompt: "3² 表示什么？", type: "choice", choices: ["3×3", "3×2", "3+3"], answer: "3×3", explanation: "平方表示两个相同因数相乘。" },
    "math.algebra.quadratic-expression": { prompt: "x²-6x 配成完全平方时，括号里应是哪个式子？", type: "choice", choices: ["x-3", "x-6", "x+3"], answer: "x-3", explanation: "一次项系数的一半是 -3，因此先写 (x-3)²。" },
    "math.coordinate.axis": { prompt: "点 (2,-1) 的横坐标是多少？", type: "choice", choices: ["2", "-1", "1"], answer: "2", explanation: "有序数对中的第一个数是横坐标。" },
    "math.algebra.linear-equation": { prompt: "x+5=9，x 等于多少？", type: "choice", choices: ["4", "5", "14"], answer: "4", explanation: "等式两边同时减 5。" },
    "math.function.quadratic": { prompt: "x²-4x 配方后应包含哪一项？", type: "choice", choices: ["(x-2)²-4", "(x-4)²", "x(x-4)+4"], answer: "(x-2)²-4", explanation: "先取一次项系数一半，再平方。" },
    "physics.measure.unit": { prompt: "50 米用符号怎样写？", type: "choice", choices: ["50 m", "50 s", "50 kg"], answer: "50 m", explanation: "长度的国际单位是米，符号 m。" },
    "physics.motion.speed": { prompt: "40 米用时 4 秒，速度是多少？", type: "choice", choices: ["10 m/s", "44 m/s", "160 m/s"], answer: "10 m/s", explanation: "速度=路程÷时间。" },
    "physics.motion.reference": { prompt: "判断汽车是否运动，必须先明确什么？", type: "choice", choices: ["参照物", "汽车颜色", "天气"], answer: "参照物", explanation: "物体位置是否变化要相对于参照物判断。" },
    "physics.motion.distance-time": { prompt: "小车从 0 米位置走到 30 米位置，路程是多少？", type: "choice", choices: ["30米", "0米", "60米"], answer: "30米", explanation: "这段直线运动经过的路径长度是 30 米。" },
    "physics.measure.conversion": { prompt: "2 分钟等于多少秒？", type: "choice", choices: ["120秒", "20秒", "200秒"], answer: "120秒", explanation: "1 分钟等于 60 秒。" },
    "physics.motion.acceleration": { prompt: "速度每秒增加 2 m/s，加速度是多少？", type: "choice", choices: ["2 m/s²", "2 m/s", "0.5 m/s²"], answer: "2 m/s²", explanation: "加速度表示单位时间内速度的变化量。" },
    "physics.matter.mass": { prompt: "表示物体所含物质多少的物理量是什么？", type: "choice", choices: ["质量", "速度", "压强"], answer: "质量", explanation: "质量描述物体所含物质的多少。" },
    "physics.force.vector": { prompt: "描述一个力至少要关注什么？", type: "choice", choices: ["大小和方向", "颜色", "温度"], answer: "大小和方向", explanation: "力既有大小也有方向。" },
    "physics.force.balance": { prompt: "静止物体受到的一对平衡力，合力是多少？", type: "choice", choices: ["0 N", "1 N", "无法判断"], answer: "0 N", explanation: "平衡力大小相等、方向相反。" },
    "physics.newton.second-law": { prompt: "合力 12 N、质量 3 kg，加速度是多少？", type: "choice", choices: ["4 m/s²", "9 m/s²", "36 m/s²"], answer: "4 m/s²", explanation: "a=F÷m=12÷3。" },
    "chemistry.symbol.element": { prompt: "氧元素的符号是什么？", type: "choice", choices: ["O", "H", "C"], answer: "O", explanation: "氧元素符号为大写字母 O。" },
    "chemistry.formula.valence": { prompt: "水的化学式是什么？", type: "choice", choices: ["H₂O", "HO₂", "H₂O₂"], answer: "H₂O", explanation: "氢通常显 +1 价，氧显 -2 价。" },
    "chemistry.particle.atom": { prompt: "化学变化中的最小粒子通常是什么？", type: "choice", choices: ["原子", "烧杯", "温度"], answer: "原子", explanation: "化学反应中原子重新组合，原子种类不变。" },
    "chemistry.particle.molecule-ion": { prompt: "O₂ 中的‘2’表示一个氧分子含几个氧原子？", type: "choice", choices: ["2个", "1个", "4个"], answer: "2个", explanation: "化学式右下角数字表示一个分子中的原子个数。" },
    "chemistry.formula.meaning": { prompt: "CO₂ 表示一个二氧化碳分子含几个氧原子？", type: "choice", choices: ["2个", "1个", "3个"], answer: "2个", explanation: "元素符号右下角数字表示该元素的原子个数。" },
    "chemistry.formula.write": { prompt: "一个水分子的化学式应写成什么？", type: "choice", choices: ["H₂O", "H₂+O", "HO₂"], answer: "H₂O", explanation: "化学式用元素符号和右下角数字表示组成。" },
    "chemistry.equation.conservation": { prompt: "反应前后，哪一项一定不变？", type: "choice", choices: ["原子种类和数目", "分子种类", "物质颜色"], answer: "原子种类和数目", explanation: "化学反应重新组合原子，不创造或消灭原子。" },
    "chemistry.equation.balance": { prompt: "H₂ + O₂ → H₂O 中，H₂O 前的正确系数是？", type: "choice", choices: ["1", "2", "3"], answer: "2", explanation: "先令产物含 2 个氧原子，再平衡氢原子。" },
    "chemistry.mole.amount": { prompt: "1 mol 任意微粒包含的微粒数约为？", type: "choice", choices: ["6.02×10²³", "100", "22.4"], answer: "6.02×10²³", explanation: "1 mol 对应阿伏加德罗常数个微粒。" },
};
const directConcepts = {
    math: {
        primary: ["math.rate.unit-rate", "math.arithmetic.multiplication"],
        junior: ["math.algebra.linear-equation", "math.arithmetic.multiplication"],
        senior: ["math.function.quadratic", "math.algebra.linear-equation"],
    },
    physics: {
        primary: ["physics.measure.unit"],
        junior: ["physics.motion.speed", "physics.measure.unit"],
        senior: ["physics.newton.second-law", "physics.force.vector"],
    },
    chemistry: {
        primary: ["chemistry.symbol.element"],
        junior: ["chemistry.equation.balance", "chemistry.equation.conservation"],
        senior: ["chemistry.mole.amount", "chemistry.symbol.element"],
    },
};
function uid(prefix) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
function teachingFor(title) {
    return {
        explanation: `${title}不是要背一句定义，而是先确认“已知什么、每一步改变了什么”。让孩子用自己的话复述，再进入计算。`,
        example: `先换成一个数字更小、关系相同的例子，只保留“${title}”这一件事。`,
        parentPrompt: `你先不要算，告诉我这一步为什么需要用到“${title}”？`,
        expectedSignal: "孩子能指出量之间的关系，并独立说出下一步。",
        misconception: "只记住刚才的数字或步骤，却说不出为什么这样做。",
        alternateExplanation: `把题目中的数字遮住，用实物、箭头或一句日常语言重新解释“${title}”。`,
    };
}
function nodeFromConcept(conceptId) {
    const concept = (0, curriculum_1.getConcept)(conceptId);
    if (!concept)
        throw new Error(`课程目录中不存在知识点：${conceptId}`);
    const check = checkBank[conceptId];
    if (!check)
        throw new Error(`演示模式尚未配置“${concept.title}”的应用型检查题`);
    return {
        id: uid("node"), conceptId, title: concept.title, kind: "concept", difficulty: concept.difficulty,
        atomic: concept.atomic, curriculumVersion: concept.version, simplification: `先把“${concept.title}”单独拿出来，降低同时处理的信息量。`,
        state: "unchecked", attempts: 0, teaching: teachingFor(concept.title), check: { ...check, id: uid("check") },
    };
}
function originalCheck(problem) {
    const bySubject = {
        math: { prompt: `现在请孩子独立重做原题：${problem.text}`, answer: problem.gradeBand === "primary" ? "300" : problem.gradeBand === "junior" ? "8" : "(2,-1)", explanation: "必须由孩子独立完成，并能解释关键步骤。" },
        physics: { prompt: `现在请孩子独立重做原题：${problem.text}`, answer: problem.gradeBand === "senior" ? "5" : "10", explanation: "写出关系式、代入数值并保留正确单位。" },
        chemistry: { prompt: `现在请孩子独立重做原题：${problem.text}`, answer: problem.gradeBand === "senior" ? "6.02×10²³" : "2,1,2", explanation: "结果正确且能说明守恒关系。" },
    };
    return { id: uid("original"), type: "short_text", ...bySubject[problem.subject] };
}
function recognizeMock(subject, gradeBand) {
    const normalizedBand = subject !== "math" && gradeBand === "primary" ? "junior" : gradeBand;
    return { ...samples[subject][normalizedBand], subject, gradeBand: normalizedBand, confidence: 0.94, userRevised: false };
}
function analyzeMock(problem, provider) {
    const now = new Date().toISOString();
    const root = {
        id: uid("root"), conceptId: `problem.${problem.subject}`, title: "原题", kind: "problem", difficulty: 10,
        atomic: false, curriculumVersion: problem.gradeBand === "senior" ? "cn-highschool-2017-2020" : "cn-compulsory-2022",
        simplification: "从原题倒推必须掌握的直接知识。", state: "unchecked", attempts: 0,
        diagnosticEvidence: problem.text,
        teaching: teachingFor("原题建模"), check: originalCheck(problem),
    };
    const nodes = directConcepts[problem.subject][problem.gradeBand].map(nodeFromConcept);
    const edges = nodes.map((node) => ({ from: node.id, to: root.id, reason: `完成原题前需要先掌握${node.title}` }));
    const session = {
        schemaVersion: "1.0", requestId: uid("req"), provider, modelId: `${provider}-demo`, mode: "demo", problem,
        nodes: [root, ...nodes], edges, rootNodeId: root.id, currentNodeId: nodes.slice().sort((a, b) => a.difficulty - b.difficulty)[0]?.id ?? null,
        stage: "diagnosing", evidence: [], transferCheck: null, originalPassed: false, transferPassed: false, createdAt: now, updatedAt: now,
    };
    (0, graph_1.assertGraphInvariants)(session);
    return session;
}
function expandMock(session, targetNodeId) {
    const target = session.nodes.find((node) => node.id === targetNodeId);
    if (!target)
        throw new Error("找不到要继续拆解的知识点");
    const concept = (0, curriculum_1.getConcept)(target.conceptId);
    if (!concept || concept.atomic || concept.prerequisites.length === 0)
        throw new Error("这个知识点已经是当前课标下的最小概念");
    const nodes = concept.prerequisites.map(nodeFromConcept);
    const edges = nodes.map((node) => ({ from: node.id, to: target.id, reason: `${node.title}是理解${target.title}的直接前置` }));
    return { nodes, edges };
}
function normalize(value) {
    return value.toLowerCase().replace(/[\s，。；:：（）()]/g, "").replace(/公里/g, "千米");
}
function verifyMock(check, answer) {
    const actual = normalize(answer);
    const expected = normalize(check.answer);
    const actualNumbers = actual.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const expectedNumbers = expected.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const numericEquivalent = actualNumbers.length > 0 && actualNumbers.length === expectedNumbers.length &&
        actualNumbers.every((value, index) => Math.abs(value - expectedNumbers[index]) <= Math.max(1e-9, Math.abs(expectedNumbers[index]) * 1e-6));
    const passed = actual.length > 0 && (actual === expected || numericEquivalent);
    return { passed, explanation: passed ? `回答正确。${check.explanation}` : `这一步还没有稳定掌握。${check.explanation}` };
}
function transferCheckMock(subject, gradeBand) {
    const bank = {
        math: gradeBand === "senior"
            ? { id: uid("transfer"), conceptId: "math.function.quadratic", prompt: "求二次函数 y=x²-6x+5 的顶点坐标。", type: "short_text", answer: "(3,-4)", explanation: "系数变化后仍能用配方确定顶点，才算真正掌握。" }
            : { id: uid("transfer"), conceptId: gradeBand === "primary" ? "math.rate.unit-rate" : "math.algebra.linear-equation", prompt: gradeBand === "primary" ? "每小时行驶 70 千米，4 小时行驶多少千米？" : "把刚才的方法迁移到：2(x+1)=10。求 x。", type: "short_text", answer: gradeBand === "primary" ? "280" : "4", explanation: "数字和表述变化后仍能独立使用同一知识关系，才算真正掌握。" },
        physics: { id: uid("transfer"), conceptId: gradeBand === "senior" ? "physics.newton.second-law" : "physics.motion.speed", prompt: gradeBand === "senior" ? "质量 4 kg 的物体受 12 N 合力，加速度是多少？" : "自行车 6 秒行驶 72 米，速度是多少？", type: "short_text", answer: gradeBand === "senior" ? "3" : "12", explanation: "关系式不变，只替换新的情境与数值。" },
        chemistry: { id: uid("transfer"), conceptId: gradeBand === "senior" ? "chemistry.mole.amount" : "chemistry.equation.balance", prompt: gradeBand === "senior" ? "2 mol O₂ 含多少个氧分子？" : "配平：N₂ + H₂ → NH₃，请写三个系数。", type: "short_text", answer: gradeBand === "senior" ? "1.204×10²⁴" : "1,3,2", explanation: "新的反应或数量仍要遵循相同的守恒与计量关系。" },
    };
    return bank[subject];
}
function solutionMock(problem) {
    const solutions = {
        math: "先求单位量：180÷3=60（千米/小时）；再求 5 小时的路程：60×5=300（千米）。",
        physics: problem.gradeBand === "senior" ? "由 F=ma，a=F÷m=10÷2=5 m/s²。" : "速度=路程÷时间=50÷5=10 m/s。",
        chemistry: problem.gradeBand === "senior" ? "1 mol O₂ 含 6.02×10²³ 个氧分子。" : "2H₂ + O₂ → 2H₂O，系数为 2、1、2。",
    };
    return solutions[problem.subject];
}
