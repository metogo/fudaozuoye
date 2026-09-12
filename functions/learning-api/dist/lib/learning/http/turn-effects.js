"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canRequestTransfer = canRequestTransfer;
exports.streamReply = streamReply;
exports.offerSuggestions = offerSuggestions;
exports.decideBoardPresentation = decideBoardPresentation;
exports.requestedBoardSuggestion = requestedBoardSuggestion;
exports.emitSafeCorrection = emitSafeCorrection;
exports.isAbortError = isAbortError;
exports.sameScope = sameScope;
exports.awaitOptional = awaitOptional;
exports.emitState = emitState;
exports.needsPreparedAnswer = needsPreparedAnswer;
exports.ensurePreparedAnswer = ensurePreparedAnswer;
exports.updateFlow = updateFlow;
exports.touch = touch;
exports.currentConcept = currentConcept;
exports.requireGate = requireGate;
const flow_1 = require("../flow");
const problem_evidence_1 = require("../problem-evidence");
const session_preparation_1 = require("../session-preparation");
const server_state_1 = require("../server-state");
const provider_validation_1 = require("../providers/provider-validation");
const turn_support_1 = require("./turn-support");
function canRequestTransfer(session) {
    if (session.flow.stage === "complete")
        return session.originalPassed || session.transferPassed;
    return session.flow.solutionRecallPassed && ["solution_recall", "reviewed_complete"].includes(session.flow.stage);
}
async function streamReply(session, scope, question, adapter, send, signal, imageDataUrl, imageRole = "student", onFirstText) {
    let emitted = false;
    const startedAt = Date.now();
    const heading = `### ${(0, flow_1.flowScopeLabel)(session, scope)}\n\n`;
    let content = heading;
    send("message.delta", { text: heading });
    await adapter.streamTutorReply(session, scope, question, (text) => {
        const first = !emitted && Boolean(text);
        if (!emitted && text)
            send("perf.phase", { key: "tutor_first_text", elapsedMs: Date.now() - startedAt });
        emitted = emitted || Boolean(text);
        content += text;
        send("message.delta", { text });
        if (first && !signal.aborted)
            onFirstText?.();
    }, signal, imageDataUrl, imageRole);
    if (!emitted)
        throw new Error("模型没有返回有效讲解");
    send("message.complete", { scopeLabel: (0, flow_1.flowScopeLabel)(session, scope) });
    return content;
}
async function offerSuggestions(session, scope, sourceText, adapter, send, signal) {
    let suggestions = [];
    try {
        suggestions = await awaitOptional(adapter.suggestQuestions(session, scope, sourceText), signal, 8_000, () => adapter.cancelPendingRequests());
    }
    catch (error) {
        if (isAbortError(error))
            throw error;
    }
    const next = updateFlow(session, { suggestedQuestions: suggestions });
    if (suggestions.length)
        send("flow.suggestions", { suggestions });
    emitState(next, send);
    return next;
}
async function decideBoardPresentation(session, scope, adapter, send, signal) {
    if (signal.aborted)
        return null;
    try {
        const suggestion = await awaitOptional(adapter.decideBoardPresentation(session, scope), signal, 8_000, () => adapter.cancelPendingRequests());
        const previous = session.flow.boardSuggestion;
        const repeatedForSameFocus = previous?.recommended === true && suggestion.recommended && sameScope(session.flow.focus, scope);
        if (suggestion.recommended && !repeatedForSameFocus)
            send("presentation.suggestion", suggestion);
        return suggestion;
    }
    catch (error) {
        if (isAbortError(error))
            throw error;
        send("presentation.unavailable", { message: "板书呈现判断暂时不可用，不影响继续学习" });
        return null;
    }
}
function requestedBoardSuggestion(session) {
    const current = session.flow.boardSuggestion;
    if (current?.recommended)
        return current;
    const focus = session.flow.focus;
    const node = focus.kind === "node"
        ? session.nodes.find((item) => item.id === focus.nodeId && item.kind === "concept")
        : null;
    const context = `${session.problem.text}\n${node?.title ?? ""}\n${node?.diagnosticEvidence ?? ""}`;
    const layout = /比较|对比|区别|相同|不同|变化前|变化后/.test(context)
        ? "comparison"
        : /方程|函数|公式|化学式|反应式|=|＋|－|×|÷/.test(context)
            ? "formula"
            : /如图|图形|几何|三角|四边|圆|角|坐标|光路|透镜|电路|受力|杠杆/.test(context)
                ? "relation"
                : "steps";
    return {
        recommended: true,
        reason: "按你的选择，把当前步骤的条件、关系、推理顺序和易错点整理到同一张板书中。",
        layout,
    };
}
function emitSafeCorrection(send, text, scopeLabel) {
    send("message.delta", { text });
    send("message.complete", { scopeLabel });
}
function isAbortError(error) {
    return error instanceof DOMException && error.name === "AbortError"
        || error instanceof Error && error.name === "AbortError";
}
function sameScope(first, second) {
    if (first.kind !== second.kind)
        return false;
    if (first.kind === "node" && second.kind === "node")
        return first.nodeId === second.nodeId;
    return first.kind === "problem" && second.kind === "problem" && first.section === second.section;
}
async function awaitOptional(operation, signal, timeoutMs = 60_000, cancelOperation = () => undefined) {
    if (signal.aborted)
        throw new DOMException("Aborted", "AbortError");
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cancelOperation();
            finish(() => reject(new Error("可选能力响应超时")));
        }, timeoutMs);
        const abort = () => finish(() => reject(new DOMException("Aborted", "AbortError")));
        const finish = (complete) => {
            clearTimeout(timeout);
            signal.removeEventListener("abort", abort);
            complete();
        };
        signal.addEventListener("abort", abort, { once: true });
        operation.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
    });
}
function emitState(session, send) {
    if (!session.flow.activeGate && !["intake", "complete", "reviewed_complete"].includes(session.flow.stage)) {
        throw new Error("下一步学习任务未准备完整，请重试当前操作");
    }
    if (session.flow.pathNodeIds.length > 0)
        send("path.updated", { nodeIds: session.flow.pathNodeIds, labels: (0, turn_support_1.pathLabels)(session, session.flow.pathNodeIds) });
    if (session.flow.activeGate)
        send("flow.gate", session.flow.activeGate);
    send("flow.update", (0, server_state_1.toClientState)(session));
}
function needsPreparedAnswer(input) {
    if (input.type === "answer" || input.type === "image_answer" || input.type === "retry_original")
        return true;
    return input.type === "choose" && (input.choice === "retry_original" || input.choice === "view_illustration");
}
async function ensurePreparedAnswer(session, adapter) {
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    if (!root)
        throw new Error("学习会话缺少原题节点");
    if (root.check.answer !== provider_validation_1.PENDING_ORIGINAL_ANSWER)
        return session;
    if ((0, problem_evidence_1.requiresProblemImage)(session.problem))
        throw new Error("原题图片尚未完成联合分析，请重新提交题目照片");
    return (0, session_preparation_1.mergePreparedAnswer)(session, await adapter.completeChatSession(session));
}
function updateFlow(session, patch) {
    return touch({ ...session, flow: (0, flow_1.removeRepeatedSolutionAction)({ ...session.flow, suggestedQuestions: [], ...patch }) });
}
function touch(session) {
    return { ...session, updatedAt: new Date().toISOString() };
}
function currentConcept(session) {
    return session.nodes.find((item) => item.id === session.currentNodeId && item.kind === "concept") ?? null;
}
function requireGate(session, gateId, expected) {
    const gate = session.flow.activeGate;
    if (!gate || gate.id !== gateId)
        throw new Error("当前学习任务已变化，请按页面最新提示继续");
    if (expected && gate.kind !== expected)
        throw new Error("当前学习任务不接受这个操作");
    return gate;
}
