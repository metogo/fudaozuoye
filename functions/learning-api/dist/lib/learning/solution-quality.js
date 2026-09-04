"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertDetailedSolution = assertDetailedSolution;
exports.isDetailedSolution = isDetailedSolution;
exports.inspectDetailedSolution = inspectDetailedSolution;
exports.describeDetailedSolutionIssues = describeDetailedSolutionIssues;
const SECTION_HEADINGS = [
    ["解题思路", "思路分析", "方法选择", "解法分析", "分析思路"],
    ["分步推导", "解题步骤", "推导过程", "详细步骤", "解答过程", "计算过程", "证明过程"],
    ["结论", "最终答案", "最后结果", "答案与结论", "结果与结论"],
    ["易错提醒", "易错点", "注意事项", "检查与提醒", "验算与提醒", "自检提醒"],
];
const ISSUE_LABELS = {
    too_short: "讲解篇幅不足",
    missing_approach: "缺少解题思路",
    missing_derivation: "缺少分步推导",
    missing_conclusion: "缺少明确结论",
    missing_pitfall: "缺少易错提醒",
    section_order: "讲解结构顺序混乱",
    insufficient_steps: "可跟随的推导步骤不足两步",
    missing_sub_questions: "没有逐项覆盖全部小问",
};
function assertDetailedSolution(solution, problemText) {
    const inspection = inspectDetailedSolution(solution, problemText);
    if (!inspection.valid)
        throw new Error(`完整讲解未通过内容验收：${describeDetailedSolutionIssues(inspection)}`);
}
function isDetailedSolution(solution, problemText) {
    return inspectDetailedSolution(solution, problemText).valid;
}
function inspectDetailedSolution(solution, problemText) {
    const text = solution.trim();
    const issues = [];
    if ([...text].length < 180)
        issues.push("too_short");
    const positions = SECTION_HEADINGS.map((headings) => headingPosition(text, headings));
    if (positions[0] < 0)
        issues.push("missing_approach");
    if (positions[1] < 0)
        issues.push("missing_derivation");
    if (positions[2] < 0)
        issues.push("missing_conclusion");
    if (positions[3] < 0)
        issues.push("missing_pitfall");
    if (positions.every((position) => position >= 0) && positions.some((position, index) => index > 0 && position <= positions[index - 1]))
        issues.push("section_order");
    if (countReasoningSteps(text) < 2)
        issues.push("insufficient_steps");
    const missingSubQuestions = extractSubQuestionIndexes(problemText).filter((index) => !mentionsSubQuestion(text, index));
    if (missingSubQuestions.length)
        issues.push("missing_sub_questions");
    return { valid: issues.length === 0, issues, missingSubQuestions };
}
function describeDetailedSolutionIssues(inspection) {
    return inspection.issues.map((issue) => issue === "missing_sub_questions"
        ? `${ISSUE_LABELS[issue]}（第 ${inspection.missingSubQuestions.join("、")} 问）`
        : ISSUE_LABELS[issue]).join("；");
}
function headingPosition(text, candidates) {
    const alternatives = candidates.map(escapeRegex).join("|");
    const pattern = new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:[一二三四五六七八九十]+[、.]\\s*)?(?:\\*\\*|__)?(?:${alternatives})(?:\\*\\*|__)?\\s*(?:[：:].*)?$`, "gmu");
    return pattern.exec(text)?.index ?? -1;
}
function countReasoningSteps(text) {
    const pattern = /^\s*(?:#{1,6}\s*)?(?:(?:\d+[.、)]|[（(]\d+[）)]|第\s*[一二三四五六七八九十\d]+\s*步|步骤\s*[一二三四五六七八九十\d]+)\s*)/gmu;
    return text.match(pattern)?.length ?? 0;
}
function extractSubQuestionIndexes(problemText) {
    const candidates = collectSubQuestionCandidates(problemText);
    const sequence = findCompleteTaskSequence(candidates, problemText);
    return sequence?.map((candidate) => String(candidate.index)) ?? [];
}
function collectSubQuestionCandidates(problemText) {
    const patterns = [
        { pattern: /(?:第\s*([1-9]\d*|[一二三四五六七八九十]+)\s*问|问题\s*([1-9]\d*|[一二三四五六七八九十]+))/g, kind: "explicit" },
        { pattern: /(?:^|[\n；;。：:，,])\s*[（(]\s*([1-9]\d*|[一二三四五六七八九十]+)\s*[）)]\s*/g, kind: "parenthesized" },
        { pattern: /(?:^|[\n；;。：:，,])\s*([1-9]\d*)[.．、)）]\s*/g, kind: "bare" },
    ];
    const matches = patterns.flatMap(({ pattern, kind }) => [...problemText.matchAll(pattern)].map((match) => {
        const markerIndex = (match.index ?? 0) + leadingBoundaryLength(match[0]);
        return {
            index: parseSubQuestionIndex(match.slice(1).find(Boolean) ?? ""),
            body: "",
            markerIndex,
            markerEnd: (match.index ?? 0) + match[0].length,
            kind,
        };
    })).filter((candidate) => !isReferenceMarker(problemText, candidate.markerIndex));
    matches.sort((first, second) => first.markerIndex - second.markerIndex || markerStrength(second.kind) - markerStrength(first.kind));
    const unique = matches.filter((candidate, position) => position === 0 || candidate.markerIndex !== matches[position - 1].markerIndex);
    return unique.map((candidate, position) => ({
        ...candidate,
        body: problemText.slice(candidate.markerEnd, unique[position + 1]?.markerIndex ?? problemText.length),
    }));
}
function findCompleteTaskSequence(candidates, problemText) {
    for (let start = 0; start < candidates.length - 1; start += 1) {
        if (candidates[start].index !== 1)
            continue;
        const sequence = [];
        for (let position = start; position < candidates.length; position += 1) {
            const candidate = candidates[position];
            if (candidate.index !== sequence.length + 1)
                break;
            sequence.push(candidate);
        }
        if (sequence.length < 2)
            continue;
        if (start > 0 && candidates[start - 1].index === 1 && !introducesQuestionList(candidates[start - 1].body))
            continue;
        if (sequence.every((candidate) => isSubQuestionTask(candidate, problemText)))
            return sequence;
    }
    return null;
}
function isSubQuestionTask(candidate, problemText) {
    if (hasConditionListContext(problemText, candidate.markerIndex))
        return false;
    if (candidate.kind === "explicit")
        return true;
    if (candidate.kind === "parenthesized" && !hasOptionListContext(problemText, candidate.markerIndex))
        return true;
    return hasTaskIntent(candidate.body) || hasQuestionListContext(problemText, candidate.markerIndex);
}
function hasConditionListContext(text, markerIndex) {
    const prefix = text.slice(Math.max(0, markerIndex - 50), markerIndex);
    return /(?:已知(?:下列|以下)?条件|条件如下|给出(?:下列|以下)(?:条件|数据)|数据如下)\s*[:：]?\s*$/.test(prefix);
}
function introducesQuestionList(body) {
    return /(?:求|回答|完成|解答|解决)?\s*(?:下列|以下)\s*(?:各)?(?:题|问题|小题)/.test(body);
}
function hasQuestionListContext(text, markerIndex) {
    return introducesQuestionList(text.slice(Math.max(0, markerIndex - 60), markerIndex));
}
function hasOptionListContext(text, markerIndex) {
    const prefix = text.slice(Math.max(0, markerIndex - 50), markerIndex);
    return /(?:选项|备选|可选项|答案选项|选择项)(?:为|如下)?\s*[:：]?\s*$/.test(prefix);
}
function isReferenceMarker(text, markerIndex) {
    const prefix = text.slice(Math.max(0, markerIndex - 30), markerIndex);
    return /(?:利用|根据|由|见|结合|代入|套用|引用|参照|按照)(?:上述|前面|上面|前一)?\s*$/.test(prefix)
        || /(?:方程|等式|公式|图|表|步骤|条件|结论|结果)\s*$/.test(prefix);
}
function parseSubQuestionIndex(value) {
    if (/^\d+$/.test(value))
        return Number(value);
    return SUB_QUESTION_ARABIC_INDEX[value] ?? Number.NaN;
}
function hasTaskIntent(body) {
    const command = /(?:求(?!和公式)|证明|判断(?!准则)|计算(?!器|公式)|回答|说明|简述|阐述|写出|列出|比较|选择|解答|分析|推导|确定|找出|指出|画出|作图(?!工具)|补全|改正|化简|解(?:方程|不等式)|解释|概括|归纳|翻译|默写|填(?:空|写)|估算|验证|探究)/;
    const commandClause = new RegExp(`(?:^|[，,：:；;。])\\s*(?:请\\s*)?(?:(?:并|再|然后)\\s*)?(?:(?:根据|结合|利用|由)[^，,：:；;。]{0,30})?${command.source}`);
    return commandClause.test(body) || /(?:为什么|为何|怎样|如何|是否|多少|哪个|哪些|什么|问\s*[:：]?|[?？])/.test(body);
}
function leadingBoundaryLength(marker) {
    return marker.match(/^[\n；;。：:，,]\s*/)?.[0].length ?? 0;
}
function markerStrength(kind) {
    return kind === "explicit" ? 3 : kind === "parenthesized" ? 2 : 1;
}
function mentionsSubQuestion(solution, index) {
    const chineseIndex = SUB_QUESTION_CHINESE_INDEX[index] ?? "";
    const indexLabel = chineseIndex ? `(?:${index}|${chineseIndex})` : index;
    const markdownPrefix = "(?:#{1,6}\\s*)?(?:(?:\\*\\*|__|\\*|_)\\s*)?";
    return new RegExp(`(?:^|\\n)\\s*${markdownPrefix}(?:第\\s*${indexLabel}\\s*问|问题\\s*${indexLabel}|[（(]\\s*${indexLabel}\\s*[）)])`, "mu").test(solution);
}
const SUB_QUESTION_CHINESE_INDEX = {
    "1": "一",
    "2": "二",
    "3": "三",
    "4": "四",
    "5": "五",
    "6": "六",
    "7": "七",
    "8": "八",
    "9": "九",
    "10": "十",
    "11": "十一",
    "12": "十二",
    "13": "十三",
    "14": "十四",
    "15": "十五",
    "16": "十六",
    "17": "十七",
    "18": "十八",
    "19": "十九",
    "20": "二十",
};
const SUB_QUESTION_ARABIC_INDEX = Object.fromEntries(Object.entries(SUB_QUESTION_CHINESE_INDEX).map(([arabic, chinese]) => [chinese, Number(arabic)]));
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
