"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.directBoardScenes = directBoardScenes;
exports.directBoardBlueprint = directBoardBlueprint;
exports.assertDirectedBoardMoves = assertDirectedBoardMoves;
const board_subject_engine_1 = require("./board-subject-engine");
const board_visual_runtime_1 = require("./board-visual-runtime");
const problem_evidence_1 = require("./problem-evidence");
const MIN_SCENES = 2;
const MAX_SCENES = 6;
/**
 * 从迁移输入里只保留真正承担教学职责的场景。
 * 这里不制造内容，只根据已验证的来源、专用介质和教学职责做确定性编排。
 */
function directBoardScenes(input) {
    const scenes = input.filter((scene) => Boolean(scene.id.trim()) && Boolean(scene.content.trim()));
    if (scenes.length <= 4)
        return scenes;
    const selected = new Set();
    selected.add(0);
    selected.add(scenes.length - 1);
    const reasoningIndex = scenes.findIndex((scene) => scene.role === "reason" || scene.intent === "derive");
    if (reasoningIndex >= 0)
        selected.add(reasoningIndex);
    rankedIndexes(scenes).filter((index) => sceneScore(scenes[index], index) >= 9)
        .slice(0, Math.max(0, MAX_SCENES - selected.size)).forEach((index) => selected.add(index));
    if (selected.size < MIN_SCENES)
        selected.add(Math.min(1, scenes.length - 1));
    return scenes.filter((_, index) => selected.has(index));
}
/** 在调用模型前决定本题需要哪些教学动作，避免先生成固定五段再做表面裁剪。 */
function directBoardBlueprint(session, scope, dialogue = []) {
    const profile = (0, board_subject_engine_1.subjectBoardProfileFor)(session);
    const defaultMoveIds = (0, board_subject_engine_1.subjectBoardProfile)(session.problem.subject).moves.map((move) => move.id).join("|");
    const specialized = profile.moves.map((move) => move.id).join("|") !== defaultMoveIds;
    const focusNode = scope.kind === "node" ? session.nodes.find((node) => node.id === scope.nodeId && node.kind === "concept") : undefined;
    const focusText = focusNode ? [focusNode.title, focusNode.diagnosticEvidence, focusNode.simplification, focusNode.teaching.explanation, focusNode.teaching.misconception].join("\n") : "";
    const text = `${(0, problem_evidence_1.problemEvidenceText)(session.problem)}\n${session.problemGuide.goal}\n${focusText}\n${dialogue.map((item) => item.text).join("\n")}`;
    const indexes = new Set([0, 2]);
    if (/[=<>∠△图表曲线关系结构过程证据原文材料史料公元\d{3,4}年实验变量反应光路语法句式]|word|phrase|sentence|grammar|evidence/i.test(text))
        indexes.add(1);
    if (specialized)
        indexes.add(1);
    const dialogueText = dialogue.map((item) => item.text).join("\n");
    if (/(?:对象|已知|条件|题意|求什么|问什么|关系|联系|对应|结构)/.test(`${focusText}\n${dialogueText}`))
        indexes.add(1);
    if (specialized || /(?:推导|变形|计算|结论|不懂|不会|出错|易错|边界|为什么|但是|可是|混淆|区别|辨析|第.{0,3}步|下一步|从哪|怎么来|依据)/.test(dialogueText))
        indexes.add(3);
    if (/(?:推导|变形|计算|结论|错误|易错|为什么|依据|反例|限制|混淆|区别)/.test(focusText))
        indexes.add(3);
    if (session.problem.subject === "math" && /(?:sin|cos|tan|三角形|证明|定义域|根|概率|数列)/i.test(text))
        indexes.add(3);
    if (/(?:迁移|总结|复述|举一反三|检验|验证|完整方法|同类题)/.test(text))
        indexes.add(profile.moves.length - 1);
    return profile.moves.filter((_, index) => indexes.has(index)).slice(0, MAX_SCENES);
}
function assertDirectedBoardMoves(session, scope, dialogue, moves) {
    const expected = directBoardBlueprint(session, scope, dialogue).map((move) => move.id);
    if (expected.length !== moves.length || expected.some((move, index) => move !== moves[index])) {
        throw new Error("增强板书必须逐项完成本题 Director 选定的教学动作");
    }
}
function rankedIndexes(scenes) {
    return scenes.map((scene, index) => ({ index, score: sceneScore(scene, index) }))
        .filter(({ index }) => index !== 0 && index !== scenes.length - 1)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map(({ index }) => index);
}
function sceneScore(scene, index) {
    return Number((0, board_visual_runtime_1.isUsefulBoardVisual)(scene.visual)) * 12
        + Number(scene.sourceMessageIds.length > 0) * 10
        + Number(scene.role === "reason" || scene.intent === "derive") * 7
        + Number(scene.role === "model" || scene.intent === "connect") * 5
        + Number(scene.role === "misconception" || scene.intent === "compare") * 3
        - index * 0.01;
}
