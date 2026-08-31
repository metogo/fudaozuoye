"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialFlow = createInitialFlow;
exports.understandingGate = understandingGate;
exports.answerGate = answerGate;
exports.postSolutionGate = postSolutionGate;
exports.solutionReviewGate = solutionReviewGate;
exports.needsHelpGate = needsHelpGate;
exports.removeRepeatedSolutionAction = removeRepeatedSolutionAction;
exports.flowScopeLabel = flowScopeLabel;
exports.assertFlowState = assertFlowState;
const understandingOptions = [
    { id: "continue", label: "懂了，继续", emphasis: "primary" },
    { id: "try", label: "我来试试", emphasis: "secondary" },
    { id: "not_understood", label: "这一步没懂", emphasis: "secondary" },
    { id: "full_solution", label: "看完整讲解", emphasis: "quiet" },
];
const boardOption = { id: "view_board", label: "用板书讲清楚", emphasis: "secondary" };
function createInitialFlow() {
    return {
        stage: "intake",
        focus: { kind: "problem" },
        activeGate: null,
        remediationCount: 0,
        explainedNodeIds: [],
        pathNodeIds: [],
        viewedSolution: false,
        solutionRecallPassed: false,
        boardSuggestion: null,
        suggestedQuestions: [],
    };
}
function understandingGate(title = "这一段听懂了吗？", nodeId) {
    return {
        id: gateId("understand"),
        kind: "understanding",
        title,
        nodeId,
        options: [
            ...understandingOptions.slice(0, 3).map((item) => ({ ...item })),
            { ...boardOption },
            { ...understandingOptions[3] },
        ],
    };
}
function answerGate(kind, title, prompt, nodeId, answerChoices) {
    return {
        id: gateId(kind), kind, title, prompt, nodeId,
        ...(answerChoices?.length ? { answerChoices: [...answerChoices] } : {}),
        ...(kind === "transfer_answer" ? {} : { options: [{ ...boardOption }, { ...understandingOptions[3] }] }),
    };
}
function postSolutionGate(title = "关键步骤已经理解。接下来怎么确认？") {
    return {
        id: gateId("post-solution"),
        kind: "post_solution",
        title,
        options: [
            { id: "retry_original", label: "遮住讲解，重做原题", emphasis: "primary" },
            { id: "practice_similar", label: "换一道同知识点题", emphasis: "secondary" },
            { ...boardOption },
            { id: "finish_review", label: "先结束，稍后再练", emphasis: "quiet" },
        ],
    };
}
function solutionReviewGate() {
    return {
        id: gateId("solution-review"),
        kind: "solution_review",
        title: "完整讲解已经准备好",
        options: [
            { id: "start_recall", label: "我看完了，收起讲解", emphasis: "primary" },
            { ...boardOption },
        ],
    };
}
function needsHelpGate(title) {
    return { id: gateId("needs-help"), kind: "needs_help", title, options: [{ ...boardOption }, { ...understandingOptions[3] }] };
}
function removeRepeatedSolutionAction(flow) {
    const gate = flow.activeGate;
    if (!flow.viewedSolution || !gate?.options?.some((option) => option.id === "full_solution"))
        return flow;
    const options = gate.options.filter((option) => option.id !== "full_solution");
    const gateWithoutOptions = { ...gate };
    delete gateWithoutOptions.options;
    return {
        ...flow,
        activeGate: options.length > 0 ? { ...gateWithoutOptions, options } : gateWithoutOptions,
    };
}
function flowScopeLabel(session, scope = session.flow.focus) {
    if (scope.kind === "problem") {
        if (scope.section === "goal")
            return "题目目标";
        if (scope.section === "keyClue")
            return "关键线索";
        if (scope.section === "approach")
            return "解题方向";
        return "这道原题";
    }
    const node = session.nodes.find((item) => item.id === scope.nodeId);
    return node ? `知识点：${node.title}` : "当前知识点";
}
function assertFlowState(value, nodes, transferCheck) {
    if (!value || typeof value !== "object")
        throw new Error("学习流程结构不合法");
    const flow = value;
    const stages = new Set(["intake", "core_explanation", "guided_reasoning", "remediation", "solution_recall", "original_attempt", "reviewed_complete", "complete"]);
    if (!flow.stage || !stages.has(flow.stage) || !Number.isInteger(flow.remediationCount) || Number(flow.remediationCount) < 0 || Number(flow.remediationCount) > 12)
        throw new Error("学习流程结构不合法");
    if (!Array.isArray(flow.explainedNodeIds) || !Array.isArray(flow.pathNodeIds) || typeof flow.viewedSolution !== "boolean" || typeof flow.solutionRecallPassed !== "boolean")
        throw new Error("学习流程记录不合法");
    if (flow.solutionRecallPassed && !flow.viewedSolution)
        throw new Error("关键步骤检查缺少完整讲解记录");
    if (flow.boardSuggestion !== null && (!flow.boardSuggestion || typeof flow.boardSuggestion.recommended !== "boolean" || typeof flow.boardSuggestion.reason !== "string" || !["relation", "steps", "comparison", "formula"].includes(String(flow.boardSuggestion.layout))))
        throw new Error("板书建议结构不合法");
    assertSuggestedQuestions(flow.suggestedQuestions);
    if (!flow.focus || typeof flow.focus !== "object")
        throw new Error("学习焦点不存在");
    const focus = flow.focus;
    if (focus.kind === "node" && (!nodes.some((node) => node.id === focus.nodeId && node.kind === "concept")))
        throw new Error("学习焦点不存在");
    if (focus.kind !== "node" && focus.kind !== "problem")
        throw new Error("学习焦点不合法");
    if (flow.activeGate !== null && (!flow.activeGate || typeof flow.activeGate.id !== "string" || typeof flow.activeGate.kind !== "string" || typeof flow.activeGate.title !== "string"))
        throw new Error("当前学习任务不合法");
    if (flow.activeGate?.kind === "solution_review" && (flow.stage !== "solution_recall" || !flow.viewedSolution || flow.solutionRecallPassed))
        throw new Error("完整讲解阅读状态不一致");
    if (flow.activeGate?.kind === "solution_recall_answer" && (flow.stage !== "solution_recall" || !flow.viewedSolution || flow.solutionRecallPassed))
        throw new Error("关键步骤检查状态不一致");
    if (flow.activeGate?.kind === "post_solution" && (flow.stage !== "solution_recall" || !flow.viewedSolution || !flow.solutionRecallPassed))
        throw new Error("讲解后选择状态不一致");
    if (flow.activeGate?.kind === "original_answer" && flow.stage !== "original_attempt")
        throw new Error("原题作答状态不一致");
    if (flow.stage === "original_attempt" && flow.activeGate?.kind !== "original_answer")
        throw new Error("原题作答任务缺失");
    if (flow.stage === "reviewed_complete" && (flow.activeGate !== null || !flow.viewedSolution || !flow.solutionRecallPassed))
        throw new Error("学习结束状态不一致");
    if (flow.activeGate?.options !== undefined) {
        const options = flow.activeGate.options;
        const allowed = new Set(["continue", "try", "not_understood", "full_solution", "view_board", "start_recall", "retry_original", "practice_similar", "finish_review"]);
        if (!Array.isArray(options) || options.length < 1 || new Set(options.map((option) => option.id)).size !== options.length || options.some((option) => !allowed.has(option.id) || typeof option.label !== "string" || !option.label.trim()))
            throw new Error("当前学习任务的操作不合法");
        if (flow.activeGate.kind === "transfer_answer" && options.some((option) => option.id === "full_solution"))
            throw new Error("同类练习不能提供原题完整讲解");
    }
    if (flow.activeGate?.answerChoices !== undefined) {
        const choices = flow.activeGate.answerChoices;
        if (!["node_answer", "original_answer", "transfer_answer"].includes(flow.activeGate.kind) || !Array.isArray(choices) || choices.length < 2 || choices.length > 5 || choices.some((choice) => typeof choice !== "string" || !choice.trim()) || new Set(choices).size !== choices.length)
            throw new Error("当前学习任务的选项不合法");
        const check = flow.activeGate.kind === "transfer_answer"
            ? transferCheck
            : nodes.find((node) => node.id === flow.activeGate?.nodeId)?.check;
        if (!check || check.type !== "choice" || !sameChoices(choices, check.choices))
            throw new Error("当前学习任务的选项与题目不一致");
    }
}
function assertSuggestedQuestions(value) {
    if (!Array.isArray(value) || value.length > 3)
        throw new Error("猜你想问结构不合法");
    const ids = new Set();
    const questions = new Set();
    for (const item of value) {
        if (!item || typeof item !== "object")
            throw new Error("猜你想问结构不合法");
        const suggestion = item;
        if (typeof suggestion.id !== "string" || !/^suggest-[a-z0-9-]{4,32}$/i.test(suggestion.id) || ids.has(suggestion.id))
            throw new Error("猜你想问标识不合法");
        if (typeof suggestion.text !== "string" || suggestion.text.trim().length < 4 || suggestion.text.trim().length > 60)
            throw new Error("猜你想问内容不合法");
        const normalized = suggestion.text.trim().replace(/[？?。\s]/g, "");
        if (questions.has(normalized))
            throw new Error("猜你想问内容不能重复");
        if (typeof suggestion.scopeLabel !== "string" || suggestion.scopeLabel.trim().length < 2 || suggestion.scopeLabel.trim().length > 40)
            throw new Error("猜你想问范围不合法");
        if (typeof suggestion.sourceSummary !== "string" || suggestion.sourceSummary.trim().length < 4 || suggestion.sourceSummary.trim().length > 80)
            throw new Error("猜你想问引用不合法");
        ids.add(suggestion.id);
        questions.add(normalized);
    }
}
function sameChoices(gateChoices, checkChoices) {
    return Boolean(checkChoices && gateChoices.length === checkChoices.length && gateChoices.every((choice, index) => choice === checkChoices[index]));
}
function gateId(prefix) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
