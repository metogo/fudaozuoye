"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConcreteRecallAnswer = isConcreteRecallAnswer;
exports.matchesTrustedRecallReference = matchesTrustedRecallReference;
exports.solutionRecallCheck = solutionRecallCheck;
function isConcreteRecallAnswer(answer) {
    const value = answer.trim();
    if (value.length < 4 || /^(不知道|不懂|不会|没看懂|忘了|不清楚|随便|懂了|明白了)$/u.test(value))
        return false;
    if (/^(?:答案|结果|所以)?\s*[A-Da-d]|^(?:答案|结果|所以)?\s*[-+]?\d+(?:\.\d+)?(?:\s*[a-zA-Z%°℃毫厘分米秒克千瓦焦帕牛摩尔]+)?$/u.test(value))
        return false;
    return !/乱写|乱算|乱乘|瞎猜|随便猜/u.test(value);
}
function matchesTrustedRecallReference(reference, answer) {
    const normalize = (value) => value.normalize("NFKC").toLowerCase()
        .replace(/[`*_#$\\{}\s，。；、：:（）()\[\]]/g, "");
    const normalizedReference = normalize(reference);
    const candidates = [answer, answer.replace(/^[^：:\n]{0,30}[：:]/u, ""), ...answer.split(/[。；\n]/u)];
    return candidates.some((candidate) => {
        const normalized = normalize(candidate);
        return normalized.length >= 12 && normalizedReference.includes(normalized);
    });
}
function solutionRecallCheck(session) {
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    if (!root)
        throw new Error("原题不存在");
    return {
        id: `solution-recall-${root.id}`,
        conceptId: root.conceptId,
        type: "short_text",
        prompt: [
            "刚才是示范，现在只确认一个关键步骤。",
            "不用重做整题，也不用写最终答案。",
            session.problemGuide.firstQuestion,
        ].join("\n\n"),
        answer: [
            `当前原题：${session.problem.text}`,
            `完整解法依据：${root.check.explanation}`,
            `可接受的思路方向：${session.problemGuide.approach}`,
        ].join("\n"),
        explanation: "只要学生说出一个能回应问题、在当前题中可执行且方向正确的关键步骤即可；不要求复述整段讲解，也不要求最终答案。",
    };
}
