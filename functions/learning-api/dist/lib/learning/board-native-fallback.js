"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferBoardSubject = inferBoardSubject;
exports.createNativeBoardFallbackPlan = createNativeBoardFallbackPlan;
exports.createNativeBoardBlocks = createNativeBoardBlocks;
exports.createNativeBoardTitle = createNativeBoardTitle;
const presentation_1 = require("./presentation");
function inferBoardSubject(session) {
    const content = `${session.problem.text}\n${session.problemGuide.goal}`;
    if (session.problem.subject === "physics" || session.problem.subject === "chemistry")
        return "science";
    if (/(?:语文|英语|阅读|文章|段落|句子|词语|古诗|文言|作文|修辞|主旨|语法|翻译)/.test(content))
        return "language";
    if (/(?:历史|政治|道德|法治|朝代|事件|制度|人物|原因|影响|意义|材料题)/.test(content))
        return "humanities";
    if (session.problem.subject === "math")
        return "math";
    if (/(?:物理|化学|生物|地理|速度|力|电路|电流|电压|透镜|光屏|反应|溶液|实验|细胞|生态|气候)/.test(content))
        return "science";
    if (/(?:函数|方程|几何|三角形|角|证明|数列|概率|分数|倍数|面积|体积|坐标|代数|不等式|多项式)/.test(content))
        return "math";
    return "general";
}
function createNativeBoardFallbackPlan(session, blocks) {
    const evidence = boardEvidenceCandidates(session);
    const scenes = blocks.map((block, index) => ({
        id: block.id,
        intent: ["extract", "connect", "derive", "verify", "compare", "verify"][index] ?? "verify",
        role: teachingRole(index, blocks.length),
        title: block.label,
        content: block.content,
        tone: block.tone,
        purpose: teachingPurpose(index, blocks.length),
        evidence: evidence[Math.min(index, evidence.length - 1)],
        why: teachingWhy(index, blocks.length),
        selfCheck: teachingCheck(index, blocks.length),
        sourceMessageIds: [],
        visual: null,
    }));
    return {
        version: 2,
        contentRevision: 1,
        subject: inferBoardSubject(session),
        thesis: safeBoardThesis(session),
        learningGoal: safeLearningGoal(session),
        sourceMessageIds: [],
        scenes,
    };
}
function createNativeBoardBlocks(session, scope) {
    const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
    return node ? nodeBlocks(node) : problemBlocks(session);
}
function createNativeBoardTitle(session, scope) {
    const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
    return (node?.title ?? cleanCue(safeLearningGoal(session), 40)) || "把题目关系铺开来看";
}
function nodeBlocks(node) {
    const evidence = cleanCue(node.diagnosticEvidence || node.simplification, 140);
    const explanation = cleanCue(node.teaching.explanation, 180);
    const example = cleanCue(node.teaching.example, 160);
    const misconception = cleanCue(node.teaching.misconception, 140);
    return [
        { id: "board-1", label: "原题定位", content: `这页只处理一个卡点：${cleanCue(node.title, 60)}。原题证据是“${evidence}”。`, tone: "plain" },
        { id: "board-2", label: "关系模型", content: `把卡点写成可以判断的关系：${explanation}`, tone: "key" },
        { id: "board-3", label: "为什么成立", content: `不要只记结论。先看一个更小的同构情境：${example}。再对应回原题中的对象与条件。`, tone: "example" },
        { id: "board-4", label: "反例与边界", content: `需要主动排除的错误理解是：${misconception}。检查适用对象和条件是否发生变化。`, tone: "plain" },
        { id: "board-5", label: "迁移方法", content: `换一道同类题时，先找与“${cleanCue(node.title, 60)}”对应的对象，再核对条件，最后决定是否能使用同一关系。`, tone: "example" },
        { id: "board-6", label: "一页记忆", content: `合上板书后回答：${cleanCue(node.teaching.parentPrompt, 100)} 能同时说出证据、关系和边界，才算真正理解。`, tone: "key" },
    ];
}
function problemBlocks(session) {
    const guide = session.problemGuide;
    const subject = inferBoardSubject(session);
    const goal = cleanCue(guide.goal, 90);
    const clue = cleanCue(guide.keyClue, 140);
    const firstQuestion = cleanCue(guide.firstQuestion, 100);
    const orient = { id: "board-1", label: "读题压缩", content: `先把任务压成一句话：${goal} 再把暂时不参与第一步的信息放到旁边。`, tone: "plain" };
    const recap = { id: "board-6", label: "一页记忆", content: `最后只记三件事：题目要什么、哪条条件决定核心关系、第一步为什么成立。自查问题是：${firstQuestion}`, tone: "key" };
    if (subject === "science")
        return [
            orient,
            { id: "board-2", label: "对象与过程", content: `先确定研究对象、发生过程和观察阶段。题干中最能改变判断方向的证据是：${clue}`, tone: "key" },
            { id: "board-3", label: "变量关系", content: "把题目中的条件按“研究对象—发生过程—观察结果”放回同一条链路，再区分原因、过程量和结果量，不能只看数值大小。", tone: "example" },
            { id: "board-4", label: "易错辨析", content: "不能只凭一个数值或现象下结论。混淆研究对象、观察阶段或控制变量，会把相关性误当成因果关系。", tone: "plain" },
            { id: "board-5", label: "边界迁移", content: "如果对象、方向、阶段或控制变量改变，原关系可能不再直接适用；先重新画过程，再判断规律。", tone: "example" },
            recap,
        ];
    if (subject === "language")
        return [
            orient,
            { id: "board-2", label: "原文证据", content: `先圈出能够直接支持回答的词句：${clue} 证据要保留语境，不能只摘一个关键词。`, tone: "key" },
            { id: "board-3", label: "篇章结构", content: "把证据放回段落或篇章位置，看它与前后内容是总分、转折、照应还是递进；结构关系决定这句话在全文中承担什么作用。", tone: "example" },
            { id: "board-4", label: "易错辨析", content: "不能只写“生动形象”“承上启下”等空泛术语。缺少表达对象、具体效果和主题贡献，结论就没有原文支撑。", tone: "plain" },
            { id: "board-5", label: "对照迁移", content: "换一句或换一段时，仍按“原文证据—语境关系—表达效果”判断，不背固定答案模板。", tone: "example" },
            recap,
        ];
    if (subject === "humanities")
        return [
            orient,
            { id: "board-2", label: "材料证据", content: `先区分材料事实与题目要求。最关键的原文证据是：${clue}`, tone: "key" },
            { id: "board-3", label: "时序因果", content: "按“背景—条件—事件—影响”组织材料，并标明每个判断由哪条材料支持；时间先后不自动等于因果关系。", tone: "example" },
            { id: "board-4", label: "易错辨析", content: "时间先后不等于因果，材料事实也不等于观点。只罗列结论而不解释证据怎样支持观点，论证就不完整。", tone: "plain" },
            { id: "board-5", label: "视角迁移", content: "换材料后重新判断主体、时间和范围，再沿同一证据链分析原因、过程或影响。", tone: "example" },
            recap,
        ];
    return [
        orient,
        { id: "board-2", label: "条件角色", content: `先区分已知、未知与限制条件。决定第一步方向的信息是：${clue}`, tone: "key" },
        { id: "board-3", label: "关系模型", content: mathRelationModel(session.problem.text), tone: "example" },
        { id: "board-4", label: "易错辨析", content: "不能因关键词相似就直接套公式，也不能跳过对象、顺序、单位和适用条件；找不到当前一步的依据，就先停下检查。", tone: "plain" },
        { id: "board-5", label: "方法迁移", content: "换数字或换问法后先重新确认对象、顺序和适用边界，不直接套用这道题的表面步骤。", tone: "example" },
        recap,
    ];
}
function mathRelationModel(problem) {
    if (/(?:函数|方程|=)/.test(problem)) {
        const relation = extractMathRelation(problem);
        const assigned = Array.from(problem.matchAll(/\b([A-Za-z])\s*=\s*(-?\d+(?:\.\d+)?)\b/g))
            .map((match) => `${match[1]}=${match[2]}`)
            .find((value) => value !== relation);
        if (relation && assigned)
            return `题干明确给出关系式 $${relation}$ 和指定值 $${assigned}$。先确认指定值对应哪个字母，再把它放回关系式的正确位置；这里只建立代入关系，不提前计算最终结果。`;
        if (relation)
            return `先把题干中的关系式 $${relation}$ 作为固定结构，再区分已知量和待求量；每次变形都说明使用了哪一项关系，不提前计算最终结果。`;
        return "把表达式、给定值和待求量放进同一结构：先确认给定值对应哪个字母，再把它放回关系式的正确位置；这里只建立代入或变形关系，不提前计算最终结果。";
    }
    if (/(?:三角形|几何|证明|角|边|圆)/.test(problem))
        return "把点、边、角和已知性质放回同一图形，先找能连接已知与目标的中间关系；每条关系都要能指出对应条件，不能只凭图形外观判断。";
    return "把已知量、待求量和限制条件放进同一数量关系，先确认谁随谁变化、单位是否一致，再选择能从已知走向目标的表达方式。";
}
function extractMathRelation(problem) {
    const match = problem.match(/([A-Za-z])\s*=\s*([+\-*/^().\dA-Za-z\s]{1,48})/);
    if (!match)
        return null;
    const right = match[2].trim().replace(/\s+/g, "").replace(/[+\-*/^.(]+$/, "");
    return right ? `${match[1]}=${right}` : null;
}
function cleanCue(value, maximum) {
    const plain = value
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/^\s*(?:[-*+]\s+|\d+[.)、]\s*)/gm, "")
        .replace(/[*_`>#]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (plain.length <= maximum)
        return balancedOrPlain(plain);
    const sentence = plain.split(/(?<=[。！？!?；;])/).find((item) => item.trim().length >= 6)?.trim();
    const candidate = sentence && sentence.length <= maximum ? sentence : safeLearningSlice(plain, maximum);
    return balancedOrPlain(candidate.replace(/[，、：；\s]+$/, "") + "…");
}
function safeLearningGoal(session) {
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    const candidate = cleanCue(session.problemGuide.goal || root?.title || "看清原题的条件、关系和下一步", 80);
    const answer = root?.check.answer ?? "";
    return answer && compact(candidate).includes(compact(answer)) ? "看清原题的条件、关系和下一步" : candidate;
}
function safeBoardThesis(session) {
    const subject = inferBoardSubject(session);
    if (subject === "math")
        return "把题干条件翻译成可检查的数学关系，再沿着依据推进关键步骤。";
    if (subject === "science")
        return "先确定研究对象和过程，再用条件解释变量、现象与结论之间的联系。";
    if (subject === "language")
        return "从原文证据出发，先看结构和语境，再解释表达为什么成立。";
    if (subject === "humanities")
        return "把材料、背景与问题要求连成证据链，再区分原因、过程和影响。";
    return "先明确任务与证据，再建立关系、解释依据并完成自查。";
}
function boardEvidenceCandidates(session) {
    const sources = [
        ...session.problem.text.split(/(?<=[。！？!?；;])/),
        ...session.nodes.flatMap((node) => node.kind === "concept" ? [node.diagnosticEvidence] : []),
    ].filter((value) => typeof value === "string").map((value) => value.trim().replace(/\s+/g, " ")).filter((value) => value.length >= 4);
    const unique = Array.from(new Set(sources)).map((value) => safeLearningSlice(value, 120));
    if (unique.length > 0)
        return unique;
    return [safeLearningSlice(session.problemGuide.keyClue, 120) || "当前题目给出的信息"];
}
function safeLearningSlice(value, maximum) {
    if (value.length <= maximum)
        return balancedOrPlain(value);
    for (let end = maximum; end >= Math.min(12, maximum); end -= 1) {
        const candidate = value.slice(0, end).replace(/[，、：；\s]+$/, "");
        if (isBalancedLearningMarkup(candidate))
            return candidate;
    }
    return value.replace(/[$`\\]/g, "").slice(0, maximum).trim();
}
function balancedOrPlain(value) {
    return isBalancedLearningMarkup(value) ? value : value.replace(/[$`\\]/g, "");
}
function isBalancedLearningMarkup(value) {
    try {
        (0, presentation_1.assertBalancedLearningMarkup)(value, "安全板书文本");
        return true;
    }
    catch {
        return false;
    }
}
function teachingRole(index, count) {
    if (index === 0)
        return "orient";
    if (index === 1)
        return "model";
    if (index === 2)
        return "reason";
    if (index === count - 1)
        return "recap";
    return count >= 6 && index === count - 2 ? "transfer" : "misconception";
}
function teachingPurpose(index, count) {
    return {
        orient: "把题目要求与已知信息压缩成清晰任务",
        model: "把分散条件组织成可以继续推理的关系",
        reason: "说明关键步骤为什么能够从已知条件推出",
        misconception: "指出最容易混淆、跳步或误用条件的位置",
        transfer: "提炼可以迁移到同类问题的方法",
        recap: "把整页板书收束成可以复述的记忆线索",
    }[teachingRole(index, count)];
}
function teachingWhy(index, count) {
    return {
        orient: "目标与条件如果没有先分开，后面的关系就容易连错对象。",
        model: "关系模型把零散信息放到同一结构中，能减少只凭关键词套方法。",
        reason: "写出依据可以暴露隐藏跳步，也能判断当前结论是否真的由条件支持。",
        misconception: "提前识别边界比做完后返工更有效，尤其要检查单位、对象和适用条件。",
        transfer: "能迁移的方法应描述判断顺序，而不是只记住这道题的数字或结论。",
        recap: "复述任务、关系和依据，才能确认自己记住的是方法而不是页面位置。",
    }[teachingRole(index, count)];
}
function teachingCheck(index, count) {
    return {
        orient: "你能用一句话说清这道题真正要解决什么吗？",
        model: "哪个条件决定了应该建立当前关系？",
        reason: "这一步使用了什么依据，缺少它还成立吗？",
        misconception: "如果交换对象、忽略单位或跳过条件，会错在哪里？",
        transfer: "换一组数字或材料，这个判断顺序是否仍然适用？",
        recap: "合上板书后，你能复述任务、核心关系和第一依据吗？",
    }[teachingRole(index, count)];
}
function compact(value) {
    return value.normalize("NFKC").replace(/[\s，。；：、“”‘’（）()\[\]【】]/g, "").toLowerCase();
}
