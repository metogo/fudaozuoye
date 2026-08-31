"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postTurn = postTurn;
const api_1 = require("../api");
const flow_1 = require("../flow");
const graph_1 = require("../graph");
const providers_1 = require("../providers");
const provider_validation_1 = require("../providers/provider-validation");
const assessment_1 = require("../providers/assessment");
const request_guards_1 = require("../request-guards");
const server_state_1 = require("../server-state");
const solution_recall_1 = require("../solution-recall");
const solution_quality_1 = require("../solution-quality");
const sse_1 = require("./sse");
async function postTurn(request) {
    try {
        (0, request_guards_1.assertSameOrigin)(request);
        (0, request_guards_1.assertRateLimit)(request, 40);
        const multipart = request.headers.get("content-type")?.includes("multipart/form-data") ?? false;
        (0, request_guards_1.assertContentLength)(request, multipart ? 7 * 1024 * 1024 : 210_000);
        const parsed = await parseTurnRequest(request, multipart);
        const session = (0, server_state_1.openSession)(parsed.stateToken);
        const input = parsed.input;
        const adapter = (0, providers_1.getSessionProviderAdapter)(session, request.signal);
        assertTurnAllowed(session, input);
        return (0, sse_1.sse)(async (send) => {
            send("meta", { schemaVersion: "1.0", provider: session.provider, modelId: adapter.modelId, requestId: session.requestId });
            await dispatchTurn(session, input, adapter, send, request.signal, parsed.imageDataUrl);
            send("complete", { provider: session.provider, modelId: adapter.modelId });
        });
    }
    catch (error) {
        return (0, api_1.fail)(error);
    }
}
function assertTurnAllowed(session, input) {
    if (input.type === "start" && (session.flow.stage !== "intake" || session.flow.activeGate))
        throw new Error("本题已经开始学习");
    if (input.type === "choose_suggestion" && !session.flow.suggestedQuestions.some((item) => item.id === input.suggestionId))
        throw new Error("这组推荐问题已更新，请按页面最新内容继续");
    if ((input.type === "choose" || input.type === "answer" || input.type === "image_answer") && session.flow.activeGate?.id !== input.gateId)
        throw new Error("当前学习任务已变化，请按页面最新提示继续");
    if (input.type === "choose" && input.choice === "full_solution" && session.flow.viewedSolution)
        throw new Error("完整讲解已经看过了，现在请独立完成原题");
    if (input.type === "choose" && !session.flow.activeGate?.options?.some((option) => option.id === input.choice))
        throw new Error("当前学习任务没有提供这个操作");
    if (input.type === "answer" && !["node_answer", "solution_recall_answer", "original_answer", "transfer_answer"].includes(session.flow.activeGate?.kind ?? ""))
        throw new Error("当前学习任务不接受文字答案");
    if (input.type === "image_answer" && !["node_answer", "solution_recall_answer", "original_answer", "transfer_answer"].includes(session.flow.activeGate?.kind ?? ""))
        throw new Error("当前学习任务不接受图片作答");
    if (input.type === "answer")
        assertOfferedAnswer(session, input.answer);
    if (input.type === "retry_original" && (!session.flow.solutionRecallPassed || session.flow.stage !== "reviewed_complete"))
        throw new Error("当前不需要重新打开原题作答");
    if (input.type === "request_transfer" && !canRequestTransfer(session))
        throw new Error("请先完成关键步骤检查");
}
function assertOfferedAnswer(session, answer) {
    const gate = session.flow.activeGate;
    const check = gate?.kind === "transfer_answer"
        ? session.transferCheck
        : gate?.kind === "solution_recall_answer"
            ? (0, solution_recall_1.solutionRecallCheck)(session)
            : session.nodes.find((node) => node.id === gate?.nodeId)?.check;
    if (check?.type === "choice" && (!check.choices?.length || !check.choices.includes(answer.trim()))) {
        throw new Error("请从当前题目的选项中选择答案");
    }
}
async function dispatchTurn(session, input, adapter, send, signal, imageDataUrl) {
    if (input.type === "start")
        return startLearning(session, adapter, send, signal);
    const working = needsPreparedAnswer(input) ? await ensurePreparedAnswer(session, adapter) : session;
    if (input.type === "choose_suggestion")
        return answerSuggestedQuestion(working, input.suggestionId, adapter, send, signal);
    if (input.type === "question")
        return answerQuestion(working, input.text, adapter, send, signal);
    if (input.type === "image_question")
        return answerImageQuestion(working, requireImage(imageDataUrl), adapter, send, signal);
    if (input.type === "image_answer")
        return handleImageAnswer(working, input.gateId, requireImage(imageDataUrl), adapter, send, signal);
    if (input.type === "retry_original")
        return offerOriginalAnswer(working, send, "继续验证：遮住讲解，重做同一道原题");
    if (input.type === "request_transfer")
        return offerTransfer(working, adapter, send, signal);
    if (input.type === "choose")
        return handleChoice(working, input.gateId, input.choice, adapter, send, signal);
    return handleAnswer(working, input.gateId, input.answer, adapter, send, signal);
}
async function answerImageQuestion(session, imageDataUrl, adapter, send, signal) {
    const scope = session.flow.focus;
    await streamReply(session, scope, "请看我附上的当前作答、草图或标记，告诉我这里应该怎样理解或下一步怎样做。", adapter, send, signal, imageDataUrl);
    send("flow.resume", { label: session.flow.activeGate ? "回到刚才的学习任务" : "继续当前学习", scopeLabel: (0, flow_1.flowScopeLabel)(session, scope) });
    emitState(updateFlow(session, {}), send);
}
async function handleImageAnswer(session, gateId, imageDataUrl, adapter, send, signal) {
    const gate = requireGate(session, gateId);
    const check = gate.kind === "transfer_answer"
        ? session.transferCheck
        : gate.kind === "solution_recall_answer"
            ? (0, solution_recall_1.solutionRecallCheck)(session)
            : session.nodes.find((node) => node.id === gate.nodeId)?.check;
    if (!check)
        throw new Error("当前作答任务不存在");
    const transcription = await adapter.transcribeStudentAnswer(imageDataUrl, check.prompt);
    const needsConfirmation = transcription.confidence < 0.72;
    send("input.transcribed", { text: transcription.text, confidence: transcription.confidence, needsConfirmation });
    if (needsConfirmation) {
        emitState(touch(session), send);
        return;
    }
    await handleAnswer(session, gateId, transcription.text, adapter, send, signal);
}
async function startLearning(session, adapter, send, signal) {
    if (session.flow.stage !== "intake" || session.flow.activeGate)
        throw new Error("本题已经开始学习");
    send("flow.milestone", { key: "problem_understood", label: "先抓住这道题的核心" });
    const completion = adapter.completeChatSession(session).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
    const sourceText = await streamReply(session, { kind: "problem", section: "keyClue" }, "这是本题首次讲解。请依次说明题目要解决什么、最关键的已知条件、第一突破口；不要公布最终答案，也不要完整代做。内容要有清晰层次，最后只问一个帮助学生迈出第一步的问题。", adapter, send, signal);
    const provisional = updateFlow({
        ...session,
        problemGuide: { ...session.problemGuide, approach: sourceText },
    }, {
        stage: "core_explanation",
        focus: { kind: "problem", section: "keyClue" },
        activeGate: (0, flow_1.understandingGate)("核心思路听懂了吗？"),
        boardSuggestion: null,
    });
    emitState(provisional, send);
    send("flow.ready", { stage: provisional.flow.stage, gateId: provisional.flow.activeGate?.id });
    const withSuggestions = await offerSuggestions(provisional, provisional.flow.focus, sourceText, adapter, send, signal);
    const result = await completion;
    if (signal.aborted)
        throw new DOMException("Aborted", "AbortError");
    if (!result.ok) {
        if (isAbortError(result.error))
            throw result.error;
        return;
    }
    const prepared = mergePreparedAnswer(withSuggestions, result.value);
    emitState(prepared, send);
}
async function answerQuestion(session, text, adapter, send, signal) {
    const question = cleanText(text, "请输入想问的问题", 300);
    const scope = session.flow.focus;
    const sourceText = await streamReply(session, scope, question, adapter, send, signal);
    send("flow.resume", { label: session.flow.activeGate ? "回到刚才的学习任务" : "继续当前学习", scopeLabel: (0, flow_1.flowScopeLabel)(session, scope) });
    await offerSuggestions(updateFlow(session, {}), scope, sourceText, adapter, send, signal);
}
async function answerSuggestedQuestion(session, suggestionId, adapter, send, signal) {
    const suggestion = session.flow.suggestedQuestions.find((item) => item.id === suggestionId);
    if (!suggestion)
        throw new Error("这组推荐问题已更新，请按页面最新内容继续");
    const scope = session.flow.focus;
    const next = updateFlow(session, {});
    await streamReply(next, scope, suggestion.text, adapter, send, signal);
    send("flow.resume", { label: next.flow.activeGate ? "回到刚才的学习任务" : "继续当前学习", scopeLabel: suggestion.scopeLabel });
    emitState(next, send);
}
async function handleChoice(session, gateId, choice, adapter, send, signal) {
    if (choice === "start_recall") {
        requireGate(session, gateId, "solution_review");
        const check = (0, solution_recall_1.solutionRecallCheck)(session);
        send("flow.milestone", { key: "back_to_problem", label: "完整讲解已收起，现在确认一个关键步骤" });
        emitState(updateFlow(session, {
            activeGate: (0, flow_1.answerGate)("solution_recall_answer", "先说清楚一个关键步骤", check.prompt, session.rootNodeId),
        }), send);
        return;
    }
    if (["retry_original", "practice_similar", "finish_review"].includes(choice)) {
        requireGate(session, gateId, "post_solution");
        if (!session.flow.solutionRecallPassed)
            throw new Error("请先完成关键步骤检查");
        if (choice === "retry_original")
            return offerOriginalAnswer(session, send, "继续验证：遮住讲解，重做同一道原题");
        if (choice === "practice_similar")
            return offerTransfer(session, adapter, send, signal);
        send("flow.milestone", { key: "back_to_problem", label: "本次讲解已结束，当前记录为：基本理解，尚未验证独立掌握" });
        emitState(updateFlow({ ...session, stage: "reviewed", currentNodeId: null }, {
            stage: "reviewed_complete",
            focus: { kind: "problem" },
            activeGate: null,
        }), send);
        return;
    }
    if (choice === "view_board") {
        requireGate(session, gateId);
        const suggestion = requestedBoardSuggestion(session);
        send("flow.progress", { key: "board", label: "正在把条件、关系和易错点整理成一张板书" });
        try {
            send("board.lesson", await awaitOptional(adapter.generateBoardLesson(session, session.flow.focus, suggestion), signal));
        }
        catch (error) {
            if (isAbortError(error))
                throw error;
            send("presentation.unavailable", { message: "这次板书没有通过可靠性检查，仍可在当前对话继续学习" });
        }
        emitState(touch(session), send);
        return;
    }
    if (choice === "full_solution") {
        requireGate(session, gateId);
        return showFullSolution(session, adapter, send, signal);
    }
    const gate = requireGate(session, gateId, "understanding");
    void gate;
    if (choice === "not_understood")
        return remediate(session, adapter, send, signal);
    if (choice === "try")
        return offerCurrentAnswer(session, send);
    return continueTeaching(session, adapter, send, signal);
}
async function continueTeaching(session, adapter, send, signal) {
    if (session.flow.focus.kind === "problem") {
        const node = currentConcept(session);
        await streamReply(session, { kind: "problem", section: "approach" }, `继续讲下一段：把核心线索连接到第一步解题方向，并重点解释为什么会用到“${node?.title ?? "当前知识"}”。仍不要公布最终答案。`, adapter, send, signal);
        if (!node)
            return offerOriginalAnswer(await ensurePreparedAnswer(session, adapter), send, "思路已经走通，现在独立完成原题");
        const focus = { kind: "node", nodeId: node.id };
        const boardSuggestion = await decideBoardPresentation(session, focus, adapter, send, signal);
        const next = updateFlow(session, {
            stage: "guided_reasoning",
            focus,
            activeGate: (0, flow_1.understandingGate)(`接下来要用到“${node.title}”`, node.id),
            remediationCount: 0,
            boardSuggestion,
        });
        send("flow.milestone", { key: "bottleneck_found", label: `下一步聚焦：${node.title}` });
        emitState(next, send);
        return;
    }
    offerCurrentAnswer(session, send);
}
function offerCurrentAnswer(session, send) {
    const focus = session.flow.focus;
    const node = focus.kind === "node" ? session.nodes.find((item) => item.id === focus.nodeId) : currentConcept(session);
    if (!node || node.kind !== "concept")
        return offerOriginalAnswer(session, send, "现在你来独立完成原题");
    const next = updateFlow(session, {
        stage: "guided_reasoning",
        focus: { kind: "node", nodeId: node.id },
        activeGate: (0, flow_1.answerGate)("node_answer", `用一道小题确认“${node.title}”`, node.check.prompt, node.id, node.check.choices),
    });
    emitState(next, send);
}
async function remediate(session, adapter, send, signal) {
    const count = session.flow.remediationCount + 1;
    if (session.flow.focus.kind === "problem") {
        let working = session;
        let node = currentConcept(working) ?? (0, graph_1.nextReadyNode)(working);
        if (count >= 2 && !node) {
            send("flow.progress", { key: "diagnosing", label: "正在定位这一步真正缺少的基础" });
            try {
                const diagnosis = await awaitOptional(adapter.diagnoseProblem(working, (key, label) => send("flow.progress", { key, label })), signal);
                working = (0, graph_1.mergeDirectKnowledge)(working, diagnosis.nodes, diagnosis.edges);
                node = currentConcept(working) ?? (0, graph_1.nextReadyNode)(working);
            }
            catch (error) {
                if (isAbortError(error))
                    throw error;
                send("flow.branch_error", { capability: "knowledge", message: "暂时没能可靠定位更基础的知识点，已保留当前讲解和进度" });
                emitState(updateFlow(working, {
                    stage: "remediation",
                    remediationCount: count,
                    activeGate: (0, flow_1.needsHelpGate)("可以继续追问当前步骤、查看完整讲解，或请老师一起确认这个卡点"),
                    boardSuggestion: null,
                }), send);
                return;
            }
            if (!node) {
                send("flow.branch_error", { capability: "knowledge", message: "已经保留现有基础路径，但暂时没有新的可靠卡点可继续下拆" });
                emitState(updateFlow(working, {
                    stage: "remediation",
                    remediationCount: 2,
                    activeGate: (0, flow_1.needsHelpGate)("可以继续追问当前步骤、查看完整讲解，或请老师一起确认这个卡点"),
                    boardSuggestion: null,
                }), send);
                return;
            }
        }
        if (count >= 2 && node) {
            working = { ...working, currentNodeId: node.id, stage: "learning" };
            send("flow.milestone", { key: "bottleneck_found", label: `已经定位到卡点：${node.title}` });
            const focus = { kind: "node", nodeId: node.id };
            await streamReply(working, focus, "学生还没理解原题入口。请从这个知识点开始，用更具体、更简单的例子讲清它与原题的关系，只讲当前一步。", adapter, send, signal);
            const boardSuggestion = await decideBoardPresentation(working, focus, adapter, send, signal);
            emitState(updateFlow(working, {
                stage: "remediation",
                focus,
                activeGate: (0, flow_1.understandingGate)(`“${node.title}”现在清楚一些了吗？`, node.id),
                remediationCount: 0,
                pathNodeIds: appendUnique(session.flow.pathNodeIds, node.id),
                boardSuggestion,
            }), send);
            return;
        }
        await streamReply(session, session.flow.focus, "学生表示这一步没懂。不要重复原话；换一种更直观的说法，并给一个数字更小或情境更具体的例子。", adapter, send, signal);
        const boardSuggestion = await decideBoardPresentation(session, session.flow.focus, adapter, send, signal);
        emitState(updateFlow(session, { stage: "remediation", remediationCount: count, activeGate: (0, flow_1.understandingGate)("换一种讲法后，清楚一些了吗？"), boardSuggestion }), send);
        return;
    }
    await remediateNode(session, session.flow.focus.nodeId, count, adapter, send, signal);
}
async function remediateNode(session, nodeId, count, adapter, send, signal) {
    const node = session.nodes.find((item) => item.id === nodeId);
    if (!node || node.kind !== "concept")
        throw new Error("当前知识点不存在");
    if (count >= 2 && !node.atomic) {
        send("flow.milestone", { key: "foundation_added", label: `继续往基础处找：${node.title}` });
        let expanded;
        try {
            const expansion = await awaitOptional(adapter.expandNode(session, node.id, (key, label) => send("flow.progress", { key, label })), signal);
            expanded = (0, graph_1.mergeExpansion)(session, node.id, expansion.nodes, expansion.edges);
        }
        catch (error) {
            if (isAbortError(error))
                throw error;
            send("flow.branch_error", { capability: "knowledge", message: "这次没有生成通过可靠性检查的更基础知识，当前学习位置已保留" });
            emitState(updateFlow(session, {
                stage: "remediation",
                remediationCount: count,
                activeGate: (0, flow_1.needsHelpGate)("可以继续追问当前知识点、查看完整讲解，或请老师一起确认"),
                boardSuggestion: null,
            }), send);
            return;
        }
        const nextNode = currentConcept(expanded);
        if (!nextNode)
            throw new Error("没有找到有效的直接前置知识");
        send("path.updated", { nodeIds: appendUnique(session.flow.pathNodeIds, node.id, nextNode.id), labels: pathLabels(expanded, appendUnique(session.flow.pathNodeIds, node.id, nextNode.id)) });
        const focus = { kind: "node", nodeId: nextNode.id };
        await streamReply(expanded, focus, `请从更基础的“${nextNode.title}”开始，用一个具体例子讲清楚，再说明它怎样帮助理解“${node.title}”。`, adapter, send, signal);
        const boardSuggestion = await decideBoardPresentation(expanded, focus, adapter, send, signal);
        emitState(updateFlow(expanded, {
            stage: "remediation",
            focus,
            activeGate: (0, flow_1.understandingGate)(`更基础的“${nextNode.title}”听懂了吗？`, nextNode.id),
            remediationCount: 0,
            pathNodeIds: appendUnique(session.flow.pathNodeIds, node.id, nextNode.id),
            boardSuggestion,
        }), send);
        return;
    }
    const focus = { kind: "node", nodeId };
    await streamReply(session, focus, count === 1 ? "学生表示没懂。换一种更简单的说法，并给一个与原题结构相同但数字更小的例子。" : "这是课标下的最小知识点。请用最具体的实物或图形例子再讲一次，只问一个非常简单的问题。", adapter, send, signal);
    const boardSuggestion = await decideBoardPresentation(session, focus, adapter, send, signal);
    const gate = node.atomic && count >= 2 ? (0, flow_1.needsHelpGate)("这个最小知识点仍然卡住了，可以继续提问或请老师一起看") : (0, flow_1.understandingGate)("换个例子后，清楚一些了吗？", node.id);
    emitState(updateFlow(session, { stage: "remediation", remediationCount: count, activeGate: gate, boardSuggestion }), send);
}
async function showFullSolution(session, adapter, send, signal) {
    send("flow.milestone", { key: "back_to_problem", label: "先把完整思路看清楚" });
    let solution = "";
    await adapter.streamSolution(session.problem, (text) => { solution += text; send("message.delta", { text }); }, () => { solution = ""; send("message.reset", { reason: "正在重新整理完整讲解" }); }, signal);
    (0, solution_quality_1.assertDetailedSolution)(solution, session.problem.text);
    const next = updateFlow(session, {
        stage: "solution_recall",
        focus: { kind: "problem", section: "approach" },
        viewedSolution: true,
        solutionRecallPassed: false,
        activeGate: (0, flow_1.solutionReviewGate)(),
        remediationCount: 0,
    });
    send("message.complete", { scopeLabel: "原题完整讲解" });
    emitState(next, send);
    send("flow.milestone", { key: "back_to_problem", label: "完整讲解已展示，阅读后再进入关键步骤检查" });
}
async function handleAnswer(session, gateId, rawAnswer, adapter, send, signal) {
    const gate = requireGate(session, gateId);
    const answer = cleanText(rawAnswer, "请先写下你的答案", 2_000);
    const check = gate.kind === "transfer_answer"
        ? session.transferCheck
        : gate.kind === "solution_recall_answer"
            ? (0, solution_recall_1.solutionRecallCheck)(session)
            : session.nodes.find((node) => node.id === gate.nodeId)?.check;
    if (check?.type === "choice" && (!check.choices?.length || !check.choices.includes(answer))) {
        throw new Error("请从当前题目的选项中选择答案");
    }
    if (gate.kind === "node_answer")
        return verifyNodeAnswer(session, gate.nodeId, answer, adapter, send, signal);
    if (gate.kind === "solution_recall_answer")
        return verifySolutionRecallAnswer(session, answer, adapter, send);
    if (gate.kind === "original_answer")
        return verifyOriginalAnswer(session, answer, adapter, send, signal);
    if (gate.kind === "transfer_answer")
        return verifyTransferAnswer(session, answer, adapter, send);
    throw new Error("当前任务不接受文字答案");
}
async function verifyNodeAnswer(session, nodeId, answer, adapter, send, signal) {
    const node = session.nodes.find((item) => item.id === nodeId && item.kind === "concept");
    if (!node)
        throw new Error("当前知识点不存在");
    const result = await verifySafely(node.check, answer, adapter, send);
    if (!result)
        return emitState(touch(session), send);
    const feedback = (0, assessment_1.safeAssessmentFeedback)(node.check, answer, result);
    send("answer.result", { passed: feedback.passed, text: feedback.explanation, kind: "node" });
    const attempts = node.attempts + 1;
    const evidence = { nodeId: node.id, source: "system", answer, passed: result.passed, createdAt: new Date().toISOString() };
    let next = touch({ ...session, nodes: session.nodes.map((item) => item.id === node.id ? { ...item, attempts, state: result.passed ? "mastered" : attempts >= 2 && item.atomic ? "needs_help" : "unknown" } : item), evidence: session.evidence.concat(evidence) });
    if (!result.passed) {
        const focus = { kind: "node", nodeId: node.id };
        emitSafeCorrection(send, feedback.explanation, (0, flow_1.flowScopeLabel)(next, focus));
        const boardSuggestion = await decideBoardPresentation(next, focus, adapter, send, signal);
        const activeGate = node.atomic && attempts >= 2
            ? (0, flow_1.needsHelpGate)("这个基础点仍未通过检查，可以继续问或请老师一起看")
            : (0, flow_1.understandingGate)("找到刚才卡住的位置了吗？", node.id);
        emitState(updateFlow(next, { stage: "remediation", focus, activeGate, remediationCount: session.flow.remediationCount + 1, boardSuggestion }), send);
        return;
    }
    next = (0, api_1.advanceAfterMastery)(next, next.edges.find((edge) => edge.from === node.id)?.to);
    const nextNode = currentConcept(next);
    if (next.stage === "original_check" || !nextNode)
        return offerOriginalAnswer(next, send, "基础已经走通，现在回到原题");
    send("flow.milestone", { key: "bottleneck_found", label: `这一点已通过，继续：${nextNode.title}` });
    const focus = { kind: "node", nodeId: nextNode.id };
    await streamReply(next, focus, `学生刚掌握“${node.title}”。现在讲“${nextNode.title}”，说明它怎样接回原题，只讲一个关键关系。`, adapter, send, signal);
    const boardSuggestion = await decideBoardPresentation(next, focus, adapter, send, signal);
    emitState(updateFlow(next, {
        stage: "guided_reasoning",
        focus,
        activeGate: (0, flow_1.understandingGate)(`“${nextNode.title}”听懂了吗？`, nextNode.id),
        remediationCount: 0,
        explainedNodeIds: appendUnique(session.flow.explainedNodeIds, node.id),
        boardSuggestion,
    }), send);
}
async function verifySolutionRecallAnswer(session, answer, adapter, send) {
    const check = (0, solution_recall_1.solutionRecallCheck)(session);
    const result = await verifySafely(check, answer, adapter, send);
    if (!result)
        return emitState(touch(session), send);
    const feedback = (0, assessment_1.safeAssessmentFeedback)(check, answer, result);
    send("answer.result", {
        passed: feedback.passed,
        text: feedback.passed ? "这个关键关系已经说清楚了。" : feedback.explanation,
        kind: "recall",
    });
    if (!feedback.passed) {
        emitState(updateFlow(session, {
            stage: "solution_recall",
            activeGate: (0, flow_1.answerGate)("solution_recall_answer", "再想一想这个关键步骤", check.prompt, session.rootNodeId),
        }), send);
        return;
    }
    send("flow.milestone", { key: "back_to_problem", label: "关键步骤已经理解，现在选择怎样独立验证" });
    emitState(updateFlow(session, {
        stage: "solution_recall",
        solutionRecallPassed: true,
        activeGate: (0, flow_1.postSolutionGate)(),
        remediationCount: 0,
    }), send);
}
async function verifyOriginalAnswer(session, answer, adapter, send, signal) {
    const root = session.nodes.find((item) => item.id === session.rootNodeId);
    if (!root)
        throw new Error("原题不存在");
    const result = await verifySafely(root.check, answer, adapter, send);
    if (!result)
        return emitState(touch(session), send);
    const feedback = (0, assessment_1.safeAssessmentFeedback)(root.check, answer, result);
    send("answer.result", { passed: feedback.passed, text: feedback.explanation, kind: "original" });
    const attempts = root.attempts + 1;
    const evidence = { nodeId: root.id, source: "system", answer, passed: result.passed, createdAt: new Date().toISOString() };
    let next = touch({ ...session, nodes: session.nodes.map((item) => item.id === root.id ? { ...item, attempts, state: result.passed ? "mastered" : "unknown" } : item), evidence: session.evidence.concat(evidence), originalPassed: result.passed });
    if (result.passed) {
        next = updateFlow({ ...next, stage: "transfer_check", currentNodeId: null }, { stage: "complete", focus: { kind: "problem" }, activeGate: null, remediationCount: 0 });
        send("flow.milestone", { key: "problem_solved", label: "这道题已经能独立完成" });
        emitState(next, send);
        return;
    }
    emitSafeCorrection(send, feedback.explanation, "原题独立作答");
    const focus = { kind: "problem", section: "approach" };
    const boardSuggestion = await decideBoardPresentation(next, focus, adapter, send, signal);
    emitState(updateFlow(next, { stage: "remediation", focus, activeGate: (0, flow_1.understandingGate)("找到刚才出错的那一步了吗？"), remediationCount: session.flow.remediationCount + 1, boardSuggestion }), send);
}
async function offerTransfer(session, adapter, send, signal) {
    if (!canRequestTransfer(session))
        throw new Error("请先完成关键步骤检查");
    if (session.transferCheck && !session.transferPassed) {
        if (session.flow.activeGate?.kind === "transfer_answer") {
            emitState(touch(session), send);
            return;
        }
        const next = updateFlow(session, { activeGate: (0, flow_1.answerGate)("transfer_answer", "再练一道同知识点题", session.transferCheck.prompt, undefined, session.transferCheck.choices) });
        emitState(next, send);
        return;
    }
    let working = session.transferPassed ? touch({ ...session, transferCheck: null, transferPassed: false }) : session;
    try {
        if (!working.nodes.some((node) => node.kind === "concept")) {
            const diagnosis = await awaitOptional(adapter.diagnoseProblem(working), signal);
            working = (0, graph_1.mergeDirectKnowledge)(working, diagnosis.nodes, diagnosis.edges);
        }
        const transferCheck = await awaitOptional(adapter.generateTransferCheck(working), signal);
        if (!transferCheck.prompt.trim() || !transferCheck.answer.trim() || !transferCheck.conceptId)
            throw new Error("同类题没有可靠绑定当前知识点");
        working = updateFlow({ ...working, transferCheck }, { activeGate: (0, flow_1.answerGate)("transfer_answer", "再练一道同知识点题", transferCheck.prompt, undefined, transferCheck.choices) });
    }
    catch (error) {
        if (isAbortError(error))
            throw error;
        send("flow.branch_error", { capability: "transfer", message: "同类练习暂时没有通过可靠性检查，本题完成状态不受影响" });
        emitState(session, send);
        return;
    }
    const next = working;
    send("flow.milestone", { key: "problem_solved", label: "可选强化 · AI 生成同知识点题" });
    emitState(next, send);
}
async function verifyTransferAnswer(session, answer, adapter, send) {
    if (!session.transferCheck)
        throw new Error("同类题不存在");
    const result = await verifySafely(session.transferCheck, answer, adapter, send);
    if (!result)
        return emitState(touch(session), send);
    const feedback = (0, assessment_1.safeAssessmentFeedback)(session.transferCheck, answer, result);
    send("answer.result", { passed: feedback.passed, text: feedback.explanation, kind: "transfer" });
    const root = session.nodes.find((item) => item.id === session.rootNodeId);
    if (!root)
        throw new Error("原题不存在");
    const attempts = root.attempts + 1;
    const evidence = { nodeId: root.id, source: "system", answer, passed: result.passed, createdAt: new Date().toISOString() };
    const next = updateFlow({
        ...session,
        nodes: session.nodes.map((item) => item.id === root.id ? { ...item, attempts, state: result.passed ? "mastered" : item.state } : item),
        evidence: session.evidence.concat(evidence),
        transferPassed: result.passed,
        ...(result.passed ? { stage: "complete", currentNodeId: null } : {}),
    }, {
        ...(result.passed ? { stage: "complete" } : {}),
        activeGate: result.passed ? null : (0, flow_1.answerGate)("transfer_answer", "再想一次", session.transferCheck.prompt, undefined, session.transferCheck.choices),
    });
    if (result.passed)
        send("flow.milestone", { key: "problem_solved", label: "已经独立完成一道同知识点题" });
    emitState(next, send);
}
async function verifySafely(check, answer, adapter, send) {
    try {
        return await adapter.verifyAnswer(check, answer);
    }
    catch (error) {
        if (isAbortError(error))
            throw error;
        send("flow.branch_error", { capability: "assessment", message: "这次没有得到可靠的判断，请保留当前答案后再试一次" });
        return null;
    }
}
function offerOriginalAnswer(session, send, label) {
    const root = session.nodes.find((item) => item.id === session.rootNodeId);
    if (!root)
        throw new Error("原题不存在");
    send("flow.milestone", { key: "back_to_problem", label });
    emitState(updateFlow({ ...session, stage: "original_check", currentNodeId: root.id }, {
        stage: "original_attempt",
        focus: { kind: "problem" },
        activeGate: (0, flow_1.answerGate)("original_answer", session.flow.viewedSolution ? "这是刚才的原题。讲解已收起，请按自己的思路完成" : "现在不看讲解，自己完成原题", root.check.prompt, root.id, root.check.choices),
        remediationCount: 0,
    }), send);
}
function canRequestTransfer(session) {
    if (session.flow.stage === "complete")
        return session.originalPassed || session.transferPassed;
    return session.flow.solutionRecallPassed && ["solution_recall", "reviewed_complete"].includes(session.flow.stage);
}
async function streamReply(session, scope, question, adapter, send, signal, imageDataUrl) {
    let emitted = false;
    const heading = `### ${(0, flow_1.flowScopeLabel)(session, scope)}\n\n`;
    let content = heading;
    send("message.delta", { text: heading });
    await adapter.streamTutorReply(session, scope, question, (text) => { emitted = emitted || Boolean(text); content += text; send("message.delta", { text }); }, signal, imageDataUrl);
    if (!emitted)
        throw new Error("模型没有返回有效讲解");
    send("message.complete", { scopeLabel: (0, flow_1.flowScopeLabel)(session, scope) });
    return content;
}
async function offerSuggestions(session, scope, sourceText, adapter, send, signal) {
    let suggestions = [];
    try {
        suggestions = await awaitOptional(adapter.suggestQuestions(session, scope, sourceText), signal, 8_000);
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
        const suggestion = await awaitOptional(adapter.decideBoardPresentation(session, scope), signal, 8_000);
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
async function awaitOptional(operation, signal, timeoutMs = 60_000) {
    if (signal.aborted)
        throw new DOMException("Aborted", "AbortError");
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => finish(() => reject(new Error("可选能力响应超时"))), timeoutMs);
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
    if (session.flow.pathNodeIds.length > 0)
        send("path.updated", { nodeIds: session.flow.pathNodeIds, labels: pathLabels(session, session.flow.pathNodeIds) });
    if (session.flow.activeGate)
        send("flow.gate", session.flow.activeGate);
    send("flow.update", (0, server_state_1.toClientState)(session));
}
function needsPreparedAnswer(input) {
    if (input.type === "answer" || input.type === "image_answer" || input.type === "retry_original")
        return true;
    return input.type === "choose" && (input.choice === "try" || input.choice === "retry_original");
}
async function ensurePreparedAnswer(session, adapter) {
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    if (!root)
        throw new Error("学习会话缺少原题节点");
    if (root.check.answer !== provider_validation_1.PENDING_ORIGINAL_ANSWER)
        return session;
    return mergePreparedAnswer(session, await adapter.completeChatSession(session));
}
function mergePreparedAnswer(session, prepared) {
    const currentRoot = session.nodes.find((node) => node.id === session.rootNodeId);
    const preparedRoot = prepared.nodes.find((node) => node.id === prepared.rootNodeId);
    if (!currentRoot)
        throw new Error("学习会话缺少原题节点");
    if (!preparedRoot || !preparedRoot.check.answer.trim() || preparedRoot.check.answer === provider_validation_1.PENDING_ORIGINAL_ANSWER)
        throw new Error("原题标准答案尚未准备完成，请重试当前操作");
    const stableRoot = {
        ...currentRoot,
        check: {
            ...currentRoot.check,
            answer: preparedRoot.check.answer,
            explanation: preparedRoot.check.explanation,
        },
    };
    const nodes = session.nodes.map((node) => node.id === session.rootNodeId ? stableRoot : node);
    return touch({ ...session, nodes });
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
function parseTurnInput(value) {
    if (!value || typeof value !== "object")
        throw new Error("学习操作不合法");
    const input = value;
    if (input.type === "start" || input.type === "retry_original" || input.type === "request_transfer")
        return { type: input.type };
    if (input.type === "question")
        return { type: "question", text: cleanText(input.text, "请输入想问的问题", 300) };
    if (input.type === "image_question")
        return { type: "image_question" };
    if (input.type === "choose_suggestion")
        return { type: "choose_suggestion", suggestionId: cleanText(input.suggestionId, "推荐问题不存在", 100) };
    if (input.type === "answer")
        return { type: "answer", gateId: cleanText(input.gateId, "学习任务不存在", 100), answer: cleanText(input.answer, "请先写下答案", 2_000) };
    if (input.type === "image_answer")
        return { type: "image_answer", gateId: cleanText(input.gateId, "学习任务不存在", 100) };
    if (input.type === "choose" && ["continue", "try", "not_understood", "full_solution", "view_board", "start_recall", "retry_original", "practice_similar", "finish_review"].includes(String(input.choice)))
        return { type: "choose", gateId: cleanText(input.gateId, "学习任务不存在", 100), choice: input.choice };
    throw new Error("学习操作不合法");
}
async function parseTurnRequest(request, multipart) {
    if (!multipart) {
        const body = await request.json();
        const input = parseTurnInput(body.input);
        if (input.type === "image_question" || input.type === "image_answer")
            throw new Error("请先选择要发送的图片");
        return { stateToken: cleanText(body.stateToken, "学习会话不存在", 100_000), input };
    }
    const form = await request.formData();
    const inputRaw = cleanText(form.get("input"), "学习操作不合法", 5_000);
    let inputValue;
    try {
        inputValue = JSON.parse(inputRaw);
    }
    catch {
        throw new Error("学习操作不合法");
    }
    const input = parseTurnInput(inputValue);
    if (input.type !== "image_question" && input.type !== "image_answer")
        throw new Error("图片只能用于当前提问或作答");
    const image = form.get("image");
    if (!(image instanceof File))
        throw new Error("请先选择要发送的图片");
    await (0, request_guards_1.assertImageFile)(image);
    const imageDataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
    return { stateToken: cleanText(form.get("stateToken"), "学习会话不存在", 100_000), input, imageDataUrl };
}
function requireImage(imageDataUrl) {
    if (!imageDataUrl)
        throw new Error("请先选择要发送的图片");
    return imageDataUrl;
}
function cleanText(value, emptyMessage, maximum) {
    if (typeof value !== "string")
        throw new Error(emptyMessage);
    const text = value.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (!text)
        throw new Error(emptyMessage);
    if (text.length > maximum)
        throw new Error(`内容请控制在 ${maximum} 字以内`);
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text))
        throw new Error("内容中含有不支持的控制字符");
    return text;
}
function appendUnique(values, ...next) {
    return [...new Set(values.concat(next))];
}
function pathLabels(session, nodeIds) {
    return nodeIds.map((id) => session.nodes.find((node) => node.id === id)?.title).filter((value) => Boolean(value));
}
