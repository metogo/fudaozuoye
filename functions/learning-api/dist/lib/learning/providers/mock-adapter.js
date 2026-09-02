"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockProviderAdapter = void 0;
const mock_engine_1 = require("../mock-engine");
const curriculum_1 = require("../curriculum");
const solution_recall_1 = require("../solution-recall");
const types_1 = require("../types");
const assessment_1 = require("./assessment");
const board_1 = require("./board");
const provider_validation_1 = require("./provider-validation");
const tutor_1 = require("./tutor");
class MockProviderAdapter {
    id;
    reasoningLevel;
    modelId;
    mode = "demo";
    constructor(id, reasoningLevel = "light") {
        this.id = id;
        this.reasoningLevel = reasoningLevel;
        this.modelId = `${id}-demo`;
    }
    async recognizeProblem(_imageDataUrl, subject = "math", gradeBand = "primary") {
        return (0, mock_engine_1.recognizeMock)(subject, gradeBand);
    }
    async recognizeTextProblem(text) {
        const compact = compactProblemText(text);
        const bands = ["primary", "junior", "senior"];
        const sample = types_1.subjects.flatMap((subject) => bands.filter((band) => (0, curriculum_1.isSupportedSubjectBand)(subject, band)).map((band) => (0, mock_engine_1.recognizeMock)(subject, band)))
            .find((candidate) => compactProblemText(candidate.text) === compact);
        if (!sample)
            throw new Error("演示模式只支持内置代表题，自定义题请配置真实 AI 服务后再试");
        return { ...sample, text: text.trim(), childWork: "", confidence: 0.9, userRevised: true };
    }
    async prepareChatSession(problem) {
        if (!(0, mock_engine_1.isBuiltInMockProblem)(problem))
            throw new Error("演示模式只支持内置代表题，请返回重新识别题目");
        return (0, provider_validation_1.pendingChatSession)(problem, this.id, this.reasoningLevel, this.modelId, this.mode);
    }
    async completeChatSession(session) {
        const root = session.nodes.find((node) => node.id === session.rootNodeId);
        return root?.check.answer === "等待后台核验" ? (0, provider_validation_1.rootOnlySession)((0, mock_engine_1.analyzeMock)(session.problem, this.id, this.reasoningLevel)) : session;
    }
    async diagnoseProblem(session) {
        const analyzed = (0, mock_engine_1.analyzeMock)(session.problem, this.id, this.reasoningLevel);
        const nodes = analyzed.nodes.filter((node) => node.kind === "concept");
        return { nodes, edges: nodes.map((node) => ({ from: node.id, to: session.rootNodeId, reason: `完成原题前需要先掌握${node.title}` })) };
    }
    async analyzeProblem(problem) { return (0, mock_engine_1.analyzeMock)(problem, this.id, this.reasoningLevel); }
    async expandNode(session, targetNodeId, onPhase) { void onPhase; return (0, mock_engine_1.expandMock)(session, targetNodeId); }
    async verifyAnswer(check, answer) {
        const deterministic = (0, assessment_1.deterministicAnswerMatch)(check.answer, answer);
        if (deterministic === true)
            return { passed: true, explanation: "回答正确，关键关系与结果一致。" };
        if (deterministic === false)
            return (0, assessment_1.safeAssessmentFeedback)(check, answer, { passed: false, explanation: "" });
        if (check.id.startsWith("solution-recall-")) {
            const passed = (0, solution_recall_1.isConcreteRecallAnswer)(answer.trim());
            return { passed, explanation: passed ? "已经说出了一个具体的关键步骤。" : "请说出你记得的一个具体操作或关系。" };
        }
        return (0, assessment_1.safeAssessmentFeedback)(check, answer, (0, mock_engine_1.verifyMock)(check, answer));
    }
    async generateSimilarCheck(session, nodeId) {
        const node = session.nodes.find((item) => item.id === nodeId);
        if (!node || node.kind !== "concept")
            throw new Error("找不到要换题的知识点");
        return (0, mock_engine_1.similarCheckMock)(node);
    }
    async generateTransferCheck(session) { return (0, mock_engine_1.transferCheckMock)(session.problem.subject, session.problem.gradeBand); }
    async solveProblem(problem) { return (0, mock_engine_1.solutionMock)(problem); }
    async streamSolution(problem, onDelta, _onReset, signal) {
        if (signal?.aborted)
            throw new DOMException("Aborted", "AbortError");
        const solution = (0, mock_engine_1.solutionMock)(problem);
        for (const part of solution.match(/.{1,12}/gs) ?? [solution]) {
            if (signal?.aborted)
                throw new DOMException("Aborted", "AbortError");
            onDelta(part);
        }
    }
    async streamTutorReply(session, scope, question, onDelta, signal, imageDataUrl) {
        void imageDataUrl;
        if (signal?.aborted)
            throw new DOMException("Aborted", "AbortError");
        const reply = (0, tutor_1.tutorReplyMock)(session, scope, question);
        for (const part of reply.match(/.{1,10}/gs) ?? [reply])
            onDelta(part);
    }
    async suggestQuestions(session, scope, sourceText) {
        return (0, tutor_1.questionSuggestionsMock)(session, scope, sourceText);
    }
    async transcribeStudentAnswer(imageDataUrl, taskPrompt) { void imageDataUrl; void taskPrompt; return { text: "3", confidence: 0.96 }; }
    async decideBoardPresentation(session, scope) {
        const text = `${session.problem.text}${scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId)?.title ?? "" : session.problemGuide.approach}`;
        const relation = /图|角|三角|四边|函数|坐标|光路|电路|受力|结构|关系|步骤|方程|化学式/.test(text);
        return { recommended: relation, reason: relation ? "这一步包含图形、关系或多步变化，用板书拆开更容易看清。" : "当前关系用短文字已经可以讲清楚。", layout: /对比|区别|变化/.test(text) ? "comparison" : /公式|方程|函数|化学式/.test(text) ? "formula" : /图|角|三角|四边|光路|电路|受力/.test(text) ? "relation" : "steps" };
    }
    async generateBoardLesson(session, scope, suggestion, context = []) {
        void context;
        return (0, board_1.createSafeBoardLesson)(session, scope, suggestion);
    }
    cancelPendingRequests() { }
}
exports.MockProviderAdapter = MockProviderAdapter;
function compactProblemText(value) { return value.normalize("NFKC").replace(/[\s，。；：！？?,.!、“”‘’（）()\[\]【】]/g, "").toLowerCase(); }
