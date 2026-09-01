"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveProviderAdapter = exports.MockProviderAdapter = void 0;
const curriculum_1 = require("../curriculum");
const errors_1 = require("../errors");
const solution_recall_1 = require("../solution-recall");
const blueprint_1 = require("./blueprint");
const board_1 = require("./board");
const model_support_1 = require("./model-support");
const tutor_1 = require("./tutor");
const request_controller_registry_1 = require("./request-controller-registry");
const assessment_1 = require("./assessment");
const student_response_1 = require("./student-response");
const transient_fetch_1 = require("./transient-fetch");
const provider_validation_1 = require("./provider-validation");
const solution_1 = require("./solution");
var mock_adapter_1 = require("./mock-adapter");
Object.defineProperty(exports, "MockProviderAdapter", { enumerable: true, get: function () { return mock_adapter_1.MockProviderAdapter; } });
class LiveProviderAdapter {
    config;
    fetcher;
    reasoningLevel;
    requestSignal;
    mode = "live";
    id;
    modelId;
    requests = new request_controller_registry_1.RequestControllerRegistry();
    constructor(config, fetcher = fetch, reasoningLevel = "light", requestSignal) {
        this.config = config;
        this.fetcher = fetcher;
        this.reasoningLevel = reasoningLevel;
        this.requestSignal = requestSignal;
        this.id = config.id;
        this.modelId = config.modelId;
    }
    cancelPendingRequests() { this.requests.cancelAll(); }
    async recognizeProblem(imageDataUrl, subject, gradeBand) {
        void subject;
        void gradeBand;
        return this.validatedJsonRequest("你是严格的作业照片门禁与识别器。先判断图片里是否真实、清晰、完整地出现至少一道数学、物理或化学题。只看到天花板、墙面、人物、空白纸、无关物体、严重模糊、题干被裁断或多题无法分离时，绝对禁止猜测、补全或套用示例，必须返回 recognized=false。只有能逐字依据图片提取完整题干时才返回 recognized=true。只识别一道题及学生已有作答，不求解。输出严格 JSON。", "请根据题干中的术语、公式与难度自行判断学科和学段；没有足够依据时，选择更保守的学段并降低 confidence。学科为 physics 或 chemistry 时 gradeBand 不得为 primary。输出字段：recognized(boolean), failureReason(string；成功时为空), text(string；失败时为空), childWork(string；失败时为空), subject(math|physics|chemistry), gradeBand(primary|junior|senior), confidence(0到1；失败时为0)。", provider_validation_1.parseProblem, imageDataUrl);
    }
    async recognizeTextProblem(text) {
        return this.validatedJsonRequest("你是严格的 K12 数理化题目门禁与分类器。判断用户文字是否包含一道可以学习的数学、物理或化学题。不得求解、不得改写或复述原题。只输出严格 JSON。", JSON.stringify({
            task: "只判断原文是否为一道完整的数理化题，并判断学科和学段；不是数理化题、信息不足或混入多道题时返回 recognized=false",
            text,
            output: { recognized: true, failureReason: "", subject: "math", gradeBand: "junior", confidence: 0.9 },
        }), (value) => (0, provider_validation_1.parseTextProblem)(value, text));
    }
    async analyzeProblem(problem, onPhase) {
        const allowed = (0, curriculum_1.listConcepts)(problem.subject, problem.gradeBand).map((item) => ({
            id: item.id,
            title: item.title,
            aliases: item.aliases,
            difficulty: item.difficulty,
            atomic: item.atomic,
        }));
        const result = await this.validatedJsonRequest((0, model_support_1.selectionSystemPrompt)(1, 4), JSON.stringify({
            task: "找出学生独立完成这道原题真正需要的 1 到 4 个直接前置知识；简单题只选 1 个，不得凑数",
            problem,
            evidenceQuotes: (0, provider_validation_1.evidenceCandidates)((0, provider_validation_1.problemEvidenceSources)(problem)),
            output: (0, model_support_1.selectionOutputExample)(true),
            allowedConcepts: allowed,
        }), (value) => (0, provider_validation_1.parseInitialAnalysisSelection)(value, problem, allowed), undefined, (value, error) => {
            if (!(0, provider_validation_1.isRecoverableReasonGroundingError)(error))
                throw error;
            return (0, provider_validation_1.parseInitialAnalysisSelection)((0, blueprint_1.repairSelectionReasonGrounding)(value), problem, allowed);
        });
        onPhase?.("teaching", "已找到讲解起点，正在准备针对这道题的讲法和练习");
        const blueprints = await this.generateBlueprintBatch(result.selections, (selection, existingCheckPrompts, existingContentSignatures, avoidTeachingContent) => this.generateBlueprint(problem, selection, (0, provider_validation_1.problemEvidenceSources)(problem), { parentTitle: "原题", parentExplanation: problem.text }, existingCheckPrompts, existingContentSignatures, avoidTeachingContent));
        return (0, provider_validation_1.buildSession)(problem, this.id, this.reasoningLevel, this.modelId, blueprints, result.originalAnswer, result.originalExplanation, result.problemGuide);
    }
    async prepareChatSession(problem, onPhase) {
        onPhase?.("ready", "题目已读懂，正在准备核心思路");
        return (0, provider_validation_1.pendingChatSession)(problem, this.id, this.reasoningLevel, this.modelId, this.mode);
    }
    async completeChatSession(session) {
        const problem = session.problem;
        const system = [
            "你是中国 K12 数理化原题求解器。只处理当前原题，不生成知识卡、板书、首讲或迁移题。输出严格 JSON。",
            "originalAnswer 与 originalExplanation 是服务端保存的核验依据，必须准确、完整、可复核。",
            "如果题目要求说明理由、解释原因或写出依据，originalAnswer 必须同时包含结论和不可缺少的理由，不能只写结论。",
            "解题依据出现数学或物理公式时，必须使用 KaTeX 兼容的 LaTeX：行内写成 $...$，独立公式写成 $$...$$。所有字段不得包含 HTML。",
        ].join("\n");
        const prompt = JSON.stringify({
            task: "完整求解原题，只返回后续验题必需的标准答案和可复核解题依据",
            problem,
            output: {
                originalAnswer: "标准答案",
                originalExplanation: "足以复核答案的完整解题依据",
            },
        });
        const result = this.config.protocol === "chat-completions"
            ? await this.validatedStructuredRequest(system, prompt, (0, model_support_1.problemSolutionTool)(), provider_validation_1.parseProblemSolution)
            : await this.validatedJsonRequest(system, prompt, provider_validation_1.parseProblemSolution);
        const completed = (0, provider_validation_1.buildSession)(problem, this.id, this.reasoningLevel, this.modelId, [], result.originalAnswer, result.originalExplanation, session.problemGuide);
        return { ...completed, requestId: session.requestId, createdAt: session.createdAt };
    }
    async diagnoseProblem(session, onPhase) {
        if (session.nodes.some((node) => node.kind === "concept")) {
            const nodes = session.nodes.filter((node) => node.kind === "concept");
            return { nodes: [], edges: session.edges.filter((edge) => nodes.some((node) => node.id === edge.from) && edge.to === session.rootNodeId) };
        }
        const problem = session.problem;
        const allowed = (0, curriculum_1.listConcepts)(problem.subject, problem.gradeBand).map((item) => ({
            id: item.id,
            title: item.title,
            aliases: item.aliases,
            difficulty: item.difficulty,
            atomic: item.atomic,
        }));
        const selections = await this.validatedJsonRequest((0, model_support_1.selectionSystemPrompt)(1, 4), JSON.stringify({
            task: "找出学生独立完成这道原题真正需要的 1 到 4 个直接前置知识；简单题只选 1 个，不得凑数",
            problem,
            evidenceQuotes: (0, provider_validation_1.evidenceCandidates)((0, provider_validation_1.problemEvidenceSources)(problem)),
            output: (0, model_support_1.selectionOutputExample)(false),
            allowedConcepts: allowed,
        }), (value) => (0, blueprint_1.parseKnowledgeSelections)(value, {
            allowedConceptIds: allowed.map((item) => item.id),
            evidenceSources: (0, provider_validation_1.problemEvidenceSources)(problem),
            min: 1,
            max: 4,
            rejectAncestorPairs: true,
        }), undefined, (value, error) => {
            if (!(0, provider_validation_1.isRecoverableReasonGroundingError)(error))
                throw error;
            return (0, blueprint_1.parseKnowledgeSelections)((0, blueprint_1.repairSelectionReasonGrounding)(value), {
                allowedConceptIds: allowed.map((item) => item.id),
                evidenceSources: (0, provider_validation_1.problemEvidenceSources)(problem),
                min: 1,
                max: 4,
                rejectAncestorPairs: true,
            });
        });
        onPhase?.("teaching", "已找到讲解起点，正在准备针对这道题的讲法和练习");
        const blueprints = await this.generateBlueprintBatch(selections, (selection, existingCheckPrompts, existingContentSignatures, avoidTeachingContent) => this.generateBlueprint(problem, selection, (0, provider_validation_1.problemEvidenceSources)(problem), { parentTitle: "原题", parentExplanation: problem.text }, existingCheckPrompts, existingContentSignatures, avoidTeachingContent));
        const nodes = blueprints.map(blueprint_1.knowledgeNodeFromBlueprint);
        return { nodes, edges: nodes.map((node, index) => ({ from: node.id, to: session.rootNodeId, reason: (0, provider_validation_1.edgeReason)(node, blueprints[index], "原题") })) };
    }
    async expandNode(session, targetNodeId, onPhase) {
        const target = session.nodes.find((node) => node.id === targetNodeId);
        if (!target)
            throw new Error("找不到要拆解的知识点");
        const concept = (0, curriculum_1.getConcept)(target.conceptId);
        if (!concept || concept.atomic || concept.prerequisites.length === 0)
            throw new Error("这个知识点已经是当前课标下的最小概念");
        const allowed = concept.prerequisites.map((id) => {
            const prerequisite = (0, curriculum_1.getConcept)(id);
            return { id, title: prerequisite?.title, aliases: prerequisite?.aliases, difficulty: prerequisite?.difficulty };
        });
        const selections = await this.validatedJsonRequest((0, model_support_1.selectionSystemPrompt)(1, concept.prerequisites.length), JSON.stringify({
            task: "只选择理解当前 target 真正缺失的直接前置",
            problem: session.problem,
            target: {
                conceptId: target.conceptId,
                title: target.title,
                simplification: target.simplification,
                teachingExplanation: target.teaching.explanation,
            },
            evidenceQuotes: (0, provider_validation_1.evidenceCandidates)((0, provider_validation_1.expansionEvidenceSources)(session.problem, target)),
            output: (0, model_support_1.selectionOutputExample)(false),
            allowedPrerequisites: allowed,
            existingConceptIds: session.nodes.filter((node) => node.kind === "concept").map((node) => node.conceptId),
        }), (value) => (0, blueprint_1.parseKnowledgeSelections)(value, (0, provider_validation_1.expansionSelectionOptions)(session.problem, target, concept.prerequisites)), undefined, (value, error) => {
            if (!(0, provider_validation_1.isRecoverableReasonGroundingError)(error))
                throw error;
            return (0, blueprint_1.parseKnowledgeSelections)((0, blueprint_1.repairSelectionReasonGrounding)(value), (0, provider_validation_1.expansionSelectionOptions)(session.problem, target, concept.prerequisites));
        });
        const existingContentSignatures = session.nodes.filter((node) => node.kind === "concept").map((node) => (0, blueprint_1.blueprintContentSignature)({
            conceptId: node.conceptId,
            evidence: node.diagnosticEvidence ?? node.title,
            evidenceSource: node.diagnosticEvidenceSource ?? "parent",
            simplification: node.simplification,
            teaching: node.teaching,
            check: node.check,
        }));
        const evidenceSources = (0, provider_validation_1.expansionEvidenceSources)(session.problem, target);
        onPhase?.("teaching", `已定位 ${selections.length} 个更简单前置，正在生成针对这道题的讲法与检查题`);
        const blueprints = await this.generateBlueprintBatch(selections, (selection, acceptedChecks, acceptedContent, avoidTeachingContent) => this.generateBlueprint(session.problem, selection, evidenceSources, { parentTitle: target.title, parentExplanation: target.teaching.explanation }, [...session.nodes.map((node) => node.check.prompt), ...acceptedChecks], [...existingContentSignatures, ...acceptedContent], avoidTeachingContent));
        const nodes = blueprints.map(blueprint_1.knowledgeNodeFromBlueprint);
        return {
            nodes,
            edges: nodes.map((node, index) => ({
                from: node.id,
                to: target.id,
                reason: (0, provider_validation_1.edgeReason)(node, blueprints[index], target.title),
            })),
        };
    }
    async generateBlueprint(problem, selection, evidenceSources, parent, existingCheckPrompts = [], existingContentSignatures = [], avoidTeachingContent = []) {
        const concept = (0, curriculum_1.getConcept)(selection.conceptId);
        if (!concept)
            throw new Error(`课程目录中不存在知识点：${selection.conceptId}`);
        return this.validatedJsonRequest((0, model_support_1.diagnosticSystemPrompt)(), JSON.stringify({
            task: "为已确认的课标概念生成当前题专属的学生讲解与理解检查；不得更换概念、证据或简化理由",
            problem,
            selected: { ...selection, title: concept.title, aliases: concept.aliases },
            parent,
            avoidCheckPrompts: existingCheckPrompts,
            avoidTeachingContent,
            output: (0, model_support_1.teachingOutputExample)(),
        }), (value) => {
            const detail = (0, provider_validation_1.normalizeBlueprintDetail)(value, selection.conceptId);
            return (0, blueprint_1.parseKnowledgeBlueprints)({ nodes: [{ ...detail, ...selection }] }, {
                allowedConceptIds: [selection.conceptId],
                evidenceSources,
                min: 1,
                max: 1,
                existingCheckPrompts,
                existingContentSignatures,
            })[0];
        });
    }
    async generateBlueprintBatch(selections, generate) {
        const initial = await Promise.all(selections.map((selection) => generate(selection, [], [], [])));
        const accepted = [];
        for (const candidate of initial) {
            const check = (0, blueprint_1.blueprintCheckSignature)(candidate);
            const content = (0, blueprint_1.blueprintContentSignature)(candidate);
            const conflicts = accepted.some((item) => (0, blueprint_1.blueprintCheckSignature)(item) === check || (0, blueprint_1.blueprintContentSignature)(item) === content);
            const blueprint = conflicts
                ? await generate(selections.find((selection) => selection.conceptId === candidate.conceptId), accepted.map((item) => item.check.prompt), accepted.map(blueprint_1.blueprintContentSignature), accepted.flatMap((item) => [item.teaching.explanation, item.teaching.example]))
                : candidate;
            accepted.push(blueprint);
        }
        (0, provider_validation_1.assertBlueprintBatchUnique)(accepted);
        return accepted;
    }
    async verifyAnswer(check, answer) {
        const deterministic = (0, assessment_1.deterministicAnswerMatch)(check.answer, answer);
        if (deterministic === true)
            return { passed: true, explanation: "回答正确，关键关系与结果一致。" };
        if (deterministic === false)
            return (0, assessment_1.safeAssessmentFeedback)(check, answer, { passed: false, explanation: "" });
        const keyStepRecall = check.id.startsWith("solution-recall-");
        if (keyStepRecall && !(0, solution_recall_1.isConcreteRecallAnswer)(answer)) {
            return { passed: false, explanation: "请不要只写结论，说出一个具体操作、条件关系或推理依据。" };
        }
        if (keyStepRecall && (0, solution_recall_1.matchesTrustedRecallReference)(check.answer, answer)) {
            return { passed: true, explanation: "已经说出了一个正确、可执行的关键步骤。" };
        }
        const result = await this.validatedJsonRequest(keyStepRecall
            ? "你是 K12 关键步骤回忆检查器。判断学生是否说出了一个能回应问题、在当前题中可执行且方向正确的关键步骤。学生不需要复述完整参考思路，具体正确的操作可以比参考答案更窄，只覆盖其中一个可行分支也应通过。只报最终答案、只说懂了、空泛套话、无关内容或方向错误必须判为不通过。passed=true 时 evidence 必须逐字复制学生回答中真正体现操作、关系或依据的一小段连续原文；不能找到这样的原文就必须判为 false。explanation 使用简洁 Markdown；公式使用 KaTeX 兼容 LaTeX。输出严格 JSON，不得输出 HTML。"
            : "你是严格的微型学习验收器。根据标准答案判断作答是否语义等价，不因表述差异误判。explanation 使用简洁 Markdown；数学与物理公式必须使用 KaTeX 兼容 LaTeX，行内写在 $...$ 中。输出严格 JSON，不得输出 HTML。", JSON.stringify({
            assessmentMode: keyStepRecall ? "key_step_recall" : "answer_equivalence",
            prompt: check.prompt,
            expected: check.answer,
            rubric: check.explanation,
            answer,
            output: { passed: true, evidence: "学生回答中的连续原文", explanation: "一句反馈" },
        }), (value) => {
            if (typeof value.passed !== "boolean" || typeof value.explanation !== "string" || !value.explanation.trim())
                throw new Error("验收结果缺少 passed 或 explanation");
            if (keyStepRecall && value.passed && (typeof value.evidence !== "string" || value.evidence.trim().length < 2 || !answer.includes(value.evidence.trim())))
                throw new Error("关键步骤验收缺少学生原文证据");
            return { passed: value.passed, explanation: value.explanation.trim() };
        });
        return (0, assessment_1.safeAssessmentFeedback)(check, answer, result);
    }
    async generateSimilarCheck(session, nodeId) {
        const target = session.nodes.find((node) => node.id === nodeId);
        if (!target || target.kind !== "concept")
            throw new Error("找不到要换题的知识点");
        const system = [
            "你是 K12 同知识点练习题生成器。",
            "生成一道与当前检查题考查同一课标概念、难度相近，但题干、数字或情境明显不同的新题。",
            "不得复述当前题，不得改变知识点，不得泄露答案到题干。",
            "不得声称题目是高频题、真题、某年中考题、名校题，也不得编造任何来源标签。",
            "prompt、choices 与 explanation 中的公式使用 KaTeX 兼容的 LaTeX，行内写在 $...$ 中；answer 保持便于学生直接输入和判定的纯答案。不得输出 HTML。",
        ].join("\n");
        const prompt = JSON.stringify({
            problem: session.problem,
            targetConcept: { id: target.conceptId, title: target.title },
            teaching: { explanation: target.teaching.explanation, expectedSignal: target.teaching.expectedSignal, misconception: target.teaching.misconception },
            currentCheck: { prompt: target.check.prompt, type: target.check.type, choices: target.check.choices },
            requiredType: target.check.type,
        });
        const parse = (value) => (0, model_support_1.parseSimilarCheck)(value, target);
        const check = this.config.protocol === "chat-completions"
            ? await this.validatedStructuredRequest(system, prompt, (0, model_support_1.similarCheckTool)(target.check.type), parse)
            : await this.validatedJsonRequest(`${system}\n输出严格 JSON，字段为 prompt、type、choices、answer、explanation。`, prompt, parse);
        const alignment = await this.validatedJsonRequest("你是独立的 K12 练习题概念审校员。严格判断候选题是否只考查指定课标概念、难度是否相近、是否与原题明显不同。不要因为生成器声称相关就通过。输出严格 JSON。", JSON.stringify({ targetConcept: { id: target.conceptId, title: target.title }, teaching: target.teaching.explanation, currentCheck: target.check.prompt, candidate: { prompt: check.prompt, type: check.type, choices: check.choices, answer: check.answer, explanation: check.explanation }, output: { matchesConcept: true, distinct: true, reason: "审校依据" } }), (value) => {
            if (typeof value.matchesConcept !== "boolean" || typeof value.distinct !== "boolean" || typeof value.reason !== "string" || !value.reason.trim())
                throw new Error("相似题审校结果不完整");
            return { matchesConcept: value.matchesConcept, distinct: value.distinct, reason: value.reason.trim() };
        });
        if (!alignment.matchesConcept || !alignment.distinct)
            throw new Error(`新练习题未通过同知识点审校：${alignment.reason}`);
        return check;
    }
    async generateTransferCheck(session) {
        const directIds = new Set(session.edges.filter((edge) => edge.to === session.rootNodeId).map((edge) => edge.from));
        const concepts = session.nodes.filter((node) => directIds.has(node.id) && node.kind === "concept").sort((a, b) => b.difficulty - a.difficulty);
        const root = session.nodes.find((node) => node.id === session.rootNodeId);
        const target = concepts[0];
        if (!target || !root)
            throw new Error("找不到迁移题对应的核心知识点");
        const original = { problem: session.problem.text, check: root.check.prompt, solutionBasis: root.check.explanation };
        const targets = concepts.map((node) => ({ id: node.conceptId, title: node.title, reason: node.simplification }));
        const system = "你是 K12 迁移题生成器。生成一道与原题考查相同核心知识和解题方法、难度相近，但情境、数据和表述明显不同的短题。不能只挑一个局部前置知识另出一道过于简单的题；候选题必须能检验学生是否会迁移原题的核心方法。不得复述或换皮原题，不得泄露答案，不得声称是真题、高频题或编造来源。prompt 与 explanation 中的公式使用 KaTeX 兼容的 LaTeX；answer 保持便于学生直接输入和判定的纯答案。不得输出 HTML。";
        const prompt = JSON.stringify({ original, targetConcepts: targets });
        const parse = (value) => {
            if (typeof value.prompt !== "string" || !value.prompt.trim() || typeof value.answer !== "string" || !value.answer.trim() || typeof value.explanation !== "string" || !value.explanation.trim())
                throw new Error("迁移题缺少 prompt、answer 或 explanation");
            return { id: `transfer-${crypto.randomUUID().slice(0, 8)}`, conceptId: target.conceptId, type: "short_text", prompt: value.prompt.trim(), answer: value.answer.trim(), explanation: value.explanation.trim() };
        };
        const check = this.config.protocol === "chat-completions"
            ? await this.validatedStructuredRequest(system, prompt, (0, model_support_1.transferCheckTool)(), parse)
            : await this.validatedJsonRequest(`${system} 输出严格 JSON。`, prompt, parse);
        const audit = await this.validatedJsonRequest("你是独立的 K12 迁移题审校员。不要相信生成器的自述，必须对照原题、完整解法依据和候选题逐项判断：是否考查相同核心知识与方法、是否与原题明显不同、难度是否相近、题目与答案是否自洽。只要任一项不满足就不通过。输出严格 JSON。", JSON.stringify({ original, targetConcepts: targets, candidate: check, output: { sameKnowledgeAndMethod: true, distinct: true, comparableDifficulty: true, grounded: true, reason: "审校依据" } }), (value) => {
            const keys = ["sameKnowledgeAndMethod", "distinct", "comparableDifficulty", "grounded"];
            if (keys.some((key) => typeof value[key] !== "boolean") || typeof value.reason !== "string" || !value.reason.trim())
                throw new Error("迁移题审校结果不完整");
            return { sameKnowledgeAndMethod: value.sameKnowledgeAndMethod, distinct: value.distinct, comparableDifficulty: value.comparableDifficulty, grounded: value.grounded, reason: value.reason.trim() };
        });
        if (!audit.sameKnowledgeAndMethod || !audit.distinct || !audit.comparableDifficulty || !audit.grounded)
            throw new Error(`同知识点题未通过独立审校：${audit.reason}`);
        return check;
    }
    async solveProblem(problem) {
        return this.generateSolution(problem);
    }
    async streamSolution(problem, onDelta, onReset, signal) {
        await (0, solution_1.streamValidatedSolution)(problem, (system, prompt, emit, maxTokens) => this.streamTextRequest(system, prompt, emit, signal, undefined, maxTokens), onDelta, onReset);
    }
    generateSolution(problem, signal) {
        return (0, solution_1.generateValidatedSolution)(problem, (system, prompt, onDelta, maxTokens) => this.streamTextRequest(system, prompt, onDelta, signal, undefined, maxTokens));
    }
    async streamTutorReply(session, scope, question, onDelta, signal, imageDataUrl) {
        const imageInstruction = imageDataUrl ? "\n学生还附上了一张当前作答或草图。必须结合图片回应，但不要把它误认为一道新题。" : "";
        await this.streamTextRequest((0, tutor_1.tutorSystemPrompt)(), `${(0, tutor_1.tutorPrompt)(session, scope, question)}${imageInstruction}`, onDelta, signal, imageDataUrl);
    }
    async suggestQuestions(session, scope, sourceText) {
        const system = [
            "你是 K12 学习流程中的追问推荐决策器，不是答题器。",
            "只判断刚完成的讲解之后，是否有 1 到 3 个能帮助学生理解当前题目、且适合此刻顺手追问的问题。",
            "推荐是可忽略的辅助入口，不能代替或重复当前必做任务，不能索要答案、完整解法或代做。",
            "无必要时必须返回 recommended=false 和空 questions。只输出严格 JSON。",
        ].join("\n");
        return this.validatedJsonRequest(system, (0, tutor_1.questionSuggestionsPrompt)(session, scope, sourceText), (value) => (0, tutor_1.parseQuestionSuggestions)(value, session, scope, sourceText));
    }
    async transcribeStudentAnswer(imageDataUrl, taskPrompt) {
        return (0, student_response_1.transcribeStudentResponse)(taskPrompt, (system, prompt) => this.textRequest(system, prompt, imageDataUrl, true));
    }
    async decideBoardPresentation(session, scope) {
        const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : null;
        const system = "你是 K12 教学呈现决策器。只判断当前一步是否因为图形、空间、多个条件关系、公式推导或对比结构而需要切换为全屏结构化板书。简单的一句话解释或单步计算必须返回 recommended=false。不得求解，不得输出答案。";
        const prompt = JSON.stringify({
            problem: session.problem.text,
            currentFocus: node ? { title: node.title, evidence: node.diagnosticEvidence, reason: node.simplification } : { keyClue: session.problemGuide.keyClue, approach: session.problemGuide.approach },
        });
        if (this.config.protocol === "chat-completions")
            return this.validatedStructuredRequest(system, prompt, (0, model_support_1.boardSuggestionTool)(), provider_validation_1.parseBoardSuggestion);
        return this.validatedJsonRequest(`${system} 只输出严格 JSON。`, `${prompt}\n输出字段：recommended(boolean)、reason(string)、layout(relation|steps|comparison|formula)。`, provider_validation_1.parseBoardSuggestion);
    }
    async generateBoardLesson(session, scope, suggestion, context = []) {
        if (!suggestion.recommended)
            throw new Error("当前步骤不需要切换板书讲解");
        try {
            const lesson = await this.generateBoardCandidate(session, scope, suggestion, context);
            const audit = (0, board_1.parseBoardAudit)((0, model_support_1.parseJsonObject)(await this.textRequest((0, board_1.boardAuditSystemPrompt)(), (0, board_1.boardAuditPrompt)(session, scope, lesson, context), undefined, true, 15_000)));
            if (audit.passed)
                return lesson;
            console.warn("板书候选未通过事实审校，已使用可验证的安全板书", audit.reason);
            return (0, board_1.createSafeBoardLesson)(session, scope, suggestion);
        }
        catch (error) {
            console.warn("板书生成未通过结构校验，已使用可验证的安全板书", error instanceof Error ? error.message : "未知错误");
            return (0, board_1.createSafeBoardLesson)(session, scope, suggestion);
        }
    }
    async generateBoardCandidate(session, scope, suggestion, context) {
        const system = (0, board_1.boardLessonSystemPrompt)();
        const prompt = (0, board_1.boardLessonPrompt)(session, scope, suggestion, context);
        if (this.config.protocol === "chat-completions") {
            const value = (0, model_support_1.parseJsonObject)(await this.toolRequest(`${system}\n先只输出板书正文、教学顺序与语义配图，不输出重点标记。`, `${prompt}\n旧版 visual 固定返回 kind=none，其余文字留空、elements 为空数组。`, (0, board_1.boardContentTool)(), 6000, 30_000));
            let content;
            try {
                content = (0, board_1.parseBoardContent)(value, session, suggestion, context);
            }
            catch (error) {
                console.warn("板书语义计划不合法，保留已校验正文并改用本地教学顺序", error instanceof Error ? error.message : "结构不合法");
                content = (0, board_1.recoverBoardContentPlan)(value, session, suggestion);
            }
            return (0, board_1.addSafeBoardAnnotations)(content, session);
        }
        const parseContent = (value) => (0, board_1.parseBoardContent)(value, session, suggestion, context);
        const contentSystem = `${system}\n先只输出板书正文与可选配图，不输出重点标记。`;
        const contentPrompt = `${prompt}\nvisual 不需要时返回 kind=none，其余文字留空、elements 为空数组。`;
        const content = await this.validatedJsonRequest(`${contentSystem}\n只输出严格 JSON。`, `${contentPrompt}\n输出字段：title、blocks、visual、plan。`, parseContent);
        const annotationSystem = "你是 K12 板书重点标记老师。只能从已完成板书的原文中选重点，不能改写正文、补充答案或添加推理。重点必须由教学作用决定，禁止机械选择每段开头。";
        const annotationPrompt = (0, board_1.boardAnnotationsPrompt)(content);
        const parseAnnotations = (value) => (0, board_1.parseBoardAnnotations)(value, content, session);
        try {
            return await this.validatedJsonRequest(`${annotationSystem}\n只输出严格 JSON。`, annotationPrompt, parseAnnotations);
        }
        catch {
            return (0, board_1.addSafeBoardAnnotations)(content, session);
        }
    }
    async validatedJsonRequest(system, prompt, parse, imageDataUrl, recover) {
        const first = await this.textRequest(system, prompt, imageDataUrl, true);
        try {
            return parse((0, model_support_1.parseJsonObject)(first));
        }
        catch (error) {
            if (error instanceof provider_validation_1.NonRepairableValidationError)
                throw error;
            const repaired = await this.textRequest(`${system}\n这是唯一一次修复机会。必须针对下方校验错误修正完整结果，不能只机械重复上一次输出。所有原文证据必须逐字复制，不能概括或改写；conceptId 与 evidence 不得改变。若错误涉及 simplification，它必须完整包含对应 evidence；若错误涉及 problemGuide.keyClue，它必须逐字包含题干中一段连续原文或已选择的 problem evidence。只输出严格 JSON。`, `${repairContext(prompt)}\n\n上一次输出未通过校验：${error instanceof Error ? error.message : "结构不合法"}\n上一次输出：${first.slice(0, 8000)}\n请重新完成原任务并输出完整 JSON。`, imageDataUrl, true);
            const repairedValue = (0, model_support_1.parseJsonObject)(repaired);
            try {
                return parse(repairedValue);
            }
            catch (repairError) {
                if (!recover)
                    throw repairError;
                return recover(repairedValue, repairError);
            }
        }
    }
    async validatedStructuredRequest(system, prompt, tool, parse) {
        try {
            return await this.validatedToolRequest(system, prompt, tool, parse);
        }
        catch (error) {
            if (error instanceof errors_1.ServiceError && error.code === "PROVIDER_TIMEOUT")
                throw error;
            if (error instanceof provider_validation_1.NonRepairableValidationError)
                throw error;
            const reason = error instanceof Error ? error.message : "结构函数输出无效";
            const functionSchema = tool.function && typeof tool.function === "object" && !Array.isArray(tool.function)
                ? tool.function.parameters
                : {};
            return this.validatedJsonRequest(`${system}\n结构函数输出未通过校验，改为只输出与函数参数完全同构的严格 JSON。`, `${prompt}\n必须严格遵守以下 JSON Schema：${JSON.stringify(functionSchema)}\n上一次结构函数失败原因：${reason}`, parse);
        }
    }
    async validatedToolRequest(system, prompt, tool, parse, maxTokens = 3000) {
        const first = await this.toolRequest(system, prompt, tool, maxTokens);
        try {
            return parse((0, model_support_1.parseJsonObject)(first));
        }
        catch (error) {
            const repaired = await this.toolRequest("你是结构修复器。根据校验错误重新调用指定函数；不得缺少必填字段，不改变题目事实。", JSON.stringify({ originalRequirement: prompt.slice(0, 6000), validationError: error instanceof Error ? error.message : "结构不合法", invalidOutput: first.slice(0, 6000) }), tool, maxTokens);
            return parse((0, model_support_1.parseJsonObject)(repaired));
        }
    }
    async toolRequest(system, prompt, tool, maxTokens = 3000, timeoutMs = 60_000) {
        const controller = new AbortController();
        const release = this.requests.track(controller);
        const abort = () => controller.abort();
        this.requestSignal?.addEventListener("abort", abort, { once: true });
        if (this.requestSignal?.aborted)
            controller.abort();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await (0, transient_fetch_1.fetchWithTransientRetry)(this.fetcher, this.config.baseUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
                body: JSON.stringify((0, model_support_1.chatToolBody)(this.modelId, system, prompt, tool, this.id === "doubao", maxTokens)),
                signal: controller.signal,
            });
            if (!response.ok)
                throw (0, errors_1.providerError)(`模型请求失败（${response.status}）`, response.status === 429 ? 429 : 502);
            return (0, model_support_1.extractToolArguments)(await response.json());
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
                throw (0, errors_1.providerError)("模型响应超时，请稍后重试同一模型", 504);
            throw error;
        }
        finally {
            clearTimeout(timeout);
            this.requestSignal?.removeEventListener("abort", abort);
            release();
        }
    }
    async textRequest(system, prompt, imageDataUrl, jsonMode = false, timeoutMs = 60_000) {
        const controller = new AbortController();
        const release = this.requests.track(controller);
        const abort = () => controller.abort();
        this.requestSignal?.addEventListener("abort", abort, { once: true });
        if (this.requestSignal?.aborted)
            controller.abort();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await (0, transient_fetch_1.fetchWithTransientRetry)(this.fetcher, this.config.baseUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
                body: JSON.stringify(this.config.protocol === "responses"
                    ? (0, model_support_1.responsesBody)(this.modelId, system, prompt, imageDataUrl)
                    : (0, model_support_1.chatBody)(this.modelId, system, prompt, imageDataUrl, jsonMode, this.id === "doubao")),
                signal: controller.signal,
            });
            if (!response.ok)
                throw (0, errors_1.providerError)(`模型请求失败（${response.status}）`, response.status === 429 ? 429 : 502);
            const payload = await response.json();
            return (0, model_support_1.extractText)(payload, this.config.protocol);
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
                throw (0, errors_1.providerError)("模型响应超时，请稍后重试同一模型", 504);
            throw error;
        }
        finally {
            clearTimeout(timeout);
            this.requestSignal?.removeEventListener("abort", abort);
            release();
        }
    }
    async streamTextRequest(system, prompt, onDelta, externalSignal, imageDataUrl, maxTokens = 3_000) {
        const controller = new AbortController();
        const release = this.requests.track(controller);
        const abort = () => controller.abort();
        externalSignal?.addEventListener("abort", abort, { once: true });
        this.requestSignal?.addEventListener("abort", abort, { once: true });
        if (externalSignal?.aborted || this.requestSignal?.aborted)
            controller.abort();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        try {
            const response = await (0, transient_fetch_1.fetchWithTransientRetry)(this.fetcher, this.config.baseUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
                body: JSON.stringify(this.config.protocol === "responses"
                    ? { ...(0, model_support_1.responsesBody)(this.modelId, system, prompt, imageDataUrl, maxTokens), stream: true }
                    : { ...(0, model_support_1.chatBody)(this.modelId, system, prompt, imageDataUrl, false, this.id === "doubao", maxTokens), stream: true }),
                signal: controller.signal,
            });
            if (!response.ok || !response.body)
                throw (0, errors_1.providerError)(`模型流式请求失败（${response.status}）`, response.status === 429 ? 429 : 502);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let outputLength = 0;
            let sawTerminalEvent = false;
            const emitDelta = (delta) => {
                if (!delta)
                    return;
                outputLength += delta.length;
                onDelta(delta);
            };
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? "";
                for (const line of lines)
                    sawTerminalEvent = (0, model_support_1.emitProviderDelta)(line, this.config.protocol, emitDelta) || sawTerminalEvent;
            }
            if (buffer.trim())
                sawTerminalEvent = (0, model_support_1.emitProviderDelta)(buffer, this.config.protocol, emitDelta) || sawTerminalEvent;
            if (outputLength === 0)
                throw (0, errors_1.providerError)("模型没有返回讲解内容，请重试同一模型", 502);
            if (!sawTerminalEvent)
                throw (0, errors_1.providerError)("模型讲解传输未完整结束，请重试同一模型", 502);
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError")
                throw (0, errors_1.providerError)("模型响应超时，请稍后重试同一模型", 504);
            throw error;
        }
        finally {
            externalSignal?.removeEventListener("abort", abort);
            this.requestSignal?.removeEventListener("abort", abort);
            clearTimeout(timeout);
            release();
        }
    }
}
exports.LiveProviderAdapter = LiveProviderAdapter;
function repairContext(prompt) {
    if (prompt.length <= 18_000)
        return prompt;
    return `${prompt.slice(0, 7_000)}\n…中间课程目录省略…\n${prompt.slice(-11_000)}`;
}
