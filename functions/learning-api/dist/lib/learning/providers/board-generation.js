"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContextualBoardLesson = generateContextualBoardLesson;
const grade_pedagogy_1 = require("../grade-pedagogy");
const board_director_1 = require("../board-director");
const board_1 = require("./board");
const model_support_1 = require("./model-support");
const candidateTimeoutMs = 30_000;
const candidateRepairTimeoutMs = 18_000;
const auditTimeoutMs = 12_000;
async function generateContextualBoardLesson(client, session, scope, suggestion, context) {
    try {
        const lesson = (0, board_1.finalizeBoardLesson)(await generateCandidate(client, session, scope, suggestion, context), session);
        const auditPrompt = (0, board_1.boardAuditPrompt)(session, scope, lesson, context);
        const auditRaw = client.protocol === "chat-completions"
            ? await client.toolRequest((0, board_1.boardAuditSystemPrompt)(), auditPrompt, (0, board_1.boardAuditTool)(), 320, auditTimeoutMs)
            : await client.textRequest((0, board_1.boardAuditSystemPrompt)(), auditPrompt, undefined, true, auditTimeoutMs);
        const audit = (0, board_1.parseBoardAudit)((0, model_support_1.parseJsonObject)(auditRaw));
        if (audit.passed)
            return lesson;
        console.warn("板书候选未通过事实审校，已使用可验证的安全板书", audit.reason);
        return (0, board_1.createSafeBoardLesson)(session, scope, suggestion, `完整板书未通过内容验收：${audit.reason}`);
    }
    catch (error) {
        if (isAbortError(error))
            throw error;
        const reason = error instanceof Error ? error.message : "未知错误";
        console.warn("板书生成未通过结构校验，已使用可验证的安全板书", reason);
        return (0, board_1.createSafeBoardLesson)(session, scope, suggestion, /超时|timeout/i.test(reason)
            ? "完整板书生成超时，当前内容已降级。"
            : "完整板书的结构或事实校验未通过，当前内容已降级。");
    }
}
async function generateCandidate(client, session, scope, suggestion, context) {
    const learnerBand = (0, grade_pedagogy_1.teachingBandOf)(session.problem);
    const system = (0, board_1.boardLessonSystemPrompt)(learnerBand);
    const prompt = (0, board_1.boardLessonPrompt)(session, scope, suggestion, context);
    if (client.protocol === "chat-completions") {
        const first = await client.toolRequest((0, board_1.boardCoreContentSystemPrompt)(learnerBand), `${prompt}\n严格使用 boardBlueprint 给出的教学单元数量和顺序，直接调用指定函数。`, (0, board_1.boardContentTool)(), 2400, candidateTimeoutMs);
        try {
            return (0, board_1.addSafeBoardAnnotations)((0, board_1.recoverBoardContentPlan)((0, model_support_1.parseJsonObject)(first), session, suggestion, context, scope), session);
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : "结构不合法";
            if (isAbortError(error) || /超时|timeout/i.test(reason))
                throw error;
            const repaired = await client.toolRequest(`${(0, board_1.boardCoreContentSystemPrompt)(learnerBand)}\n这是唯一一次定向修复。必须解决给出的校验错误，不能重复原输出。`, `${prompt}\n上一次板书未通过验收：${reason}\n上一次输出：${first.slice(0, 6000)}\n重新完整调用指定函数。`, (0, board_1.boardContentTool)(), 2400, candidateRepairTimeoutMs);
            return (0, board_1.addSafeBoardAnnotations)((0, board_1.recoverBoardContentPlan)((0, model_support_1.parseJsonObject)(repaired), session, suggestion, context, scope), session);
        }
    }
    const content = (0, board_1.parseBoardContent)((0, model_support_1.parseJsonObject)(await client.textRequest(`${system}\n先只输出板书正文与可选配图，不输出重点标记。\n只输出严格 JSON。`, `${prompt}\nvisual 不需要时返回 kind=none，其余文字留空、elements 为空数组。\n输出字段：title、blocks、visual、plan。`, undefined, true, candidateTimeoutMs)), session, suggestion, context);
    (0, board_director_1.assertDirectedBoardMoves)(session, scope, context, content.plan?.scenes.map((scene) => scene.move ?? "") ?? []);
    return (0, board_1.addSafeBoardAnnotations)(content, session);
}
function isAbortError(error) {
    return error instanceof DOMException && error.name === "AbortError";
}
