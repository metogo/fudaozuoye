"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectPendingGuide = subjectPendingGuide;
const templates = {
    math: { goal: "先明确待求对象，再把它和题目条件放进同一数学关系。", approach: "区分已知、待求与限制条件，建立关系但暂不计算最终结果。", firstQuestion: "题目要求哪个量或结论，哪条条件最接近它？" },
    physics: { goal: "先界定研究系统，再整理物理量、方向和适用规律。", approach: "标出研究对象、过程、数值与单位，核对条件后再选择规律。", firstQuestion: "研究的是哪个系统，题目给了哪些物理量？" },
    chemistry: { goal: "先认清物质与反应过程，再用条件和守恒关系解释变化。", approach: "区分反应物、生成物、条件和现象，再选择需要核对的守恒关系。", firstQuestion: "变化前后有哪些物质，哪一项必须保持对应？" },
    biology: { goal: "先定位生命层次和研究对象，再连接结构、功能、过程与变量。", approach: "标出对象、条件变化和观察结果，实验题同时检查对照与控制变量。", firstQuestion: "研究的是哪个生命对象，改变了什么条件？" },
    chinese: { goal: "先定位原文证据，再解释词句、结构或主旨怎样回应设问。", approach: "保留完整原句，结合上下文分析具体表达及其作用，不套空泛术语。", firstQuestion: "哪一句原文能直接支撑你的判断？" },
    english: { goal: "Locate exact evidence, then connect sentence roles and meaning in context.", approach: "Mark the supporting words, subject, predicate, clauses and connectors before answering.", firstQuestion: "Which exact words in the text support the answer?" },
    history: { goal: "先把材料放入时空坐标，再区分史料事实、因果解释和影响评价。", approach: "提取时间、主体、行动和变化，材料事实与自己的判断分开书写。", firstQuestion: "材料明确给出了哪些时间节点和历史事实？" },
    geography: { goal: "先定位区域和尺度，再连接自然、人文要素与形成过程。", approach: "读清位置、图例、方向和区域要素，再解释空间联系与过程机制。", firstQuestion: "研究区域在哪里，材料给了哪些地理要素？" },
    politics: { goal: "先判断设问动作，再把材料分层并与对应概念建立论证。", approach: "圈出主体、行为和结果，让每一个观点都能对应一条材料信息。", firstQuestion: "设问要求回答原因、意义、体现还是措施？" },
};
function subjectPendingGuide(problem) {
    const template = templates[problem.subject];
    const clue = problem.text.replace(/\s+/g, " ").trim().slice(0, 100);
    return { ...template, keyClue: `先保留题干原文：“${clue}”，只从其中提取当前学科需要的证据。` };
}
