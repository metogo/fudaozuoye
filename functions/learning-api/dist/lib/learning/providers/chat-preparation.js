"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeChatPreparation = completeChatPreparation;
const problem_completeness_1 = require("../problem-completeness");
const provider_validation_1 = require("./provider-validation");
const problem_image_analysis_1 = require("./problem-image-analysis");
const early_visual_audit_1 = require("./early-visual-audit");
const model_support_1 = require("./model-support");
const provider_text_request_1 = require("./provider-text-request");
async function completeChatPreparation(context, session, json, structured, image, onVisual) {
    const problem = session.problem;
    (0, problem_completeness_1.assertProblemInformationComplete)(problem);
    const { system, prompt } = (0, problem_image_analysis_1.problemSolutionRequest)(problem, Boolean(image));
    let audited = null;
    if (image && onVisual) {
        const observer = (0, early_visual_audit_1.observeVisualAudit)(problem, onVisual);
        const deadline = Date.now() + 60000;
        const raw = await (0, provider_text_request_1.requestModelText)(context, `${system}\n${early_visual_audit_1.earlyVisualInstruction}`, prompt, image, true, 60000, undefined, 3000, observer.delta);
        try {
            audited = observer.complete(raw);
        }
        catch (error) {
            if (error instanceof Error && /前后不一致|已确认|仍不清楚|必需的题图条件/.test(error.message))
                throw error;
            const remaining = deadline - Date.now();
            if (remaining <= 0)
                throw error;
            const repaired = await (0, provider_text_request_1.requestModelText)(context, `${system}\n仅修复 JSON 结构或公式转义，保留原有图中条件，不得改变事实。`, JSON.stringify({ originalRequirement: prompt, invalidOutput: raw, validationError: error instanceof Error ? error.message : "格式不完整" }), image, true, remaining);
            audited = observer.complete(repaired);
        }
    }
    else if (image) {
        audited = await json(system, prompt, value => (0, problem_image_analysis_1.parseAuditedProblemSolution)(value, true, Boolean(problem.userRevised && problem.visualContext?.affectsSolving)), image);
    }
    if (audited)
        (0, problem_image_analysis_1.assertConfirmedVisualFactsPreserved)(problem, audited.visualContext);
    const result = audited?.solution ?? (context.config.protocol === "chat-completions"
        ? await structured(system, prompt, (0, model_support_1.problemSolutionTool)(), provider_validation_1.parseProblemSolution)
        : await json(system, prompt, provider_validation_1.parseProblemSolution));
    const completedProblem = audited && !problem.userRevised ? { ...problem, visualContext: audited.visualContext } : problem;
    const completed = (0, provider_validation_1.buildSession)(completedProblem, session.provider, session.reasoningLevel, context.config.modelId, [], result.originalAnswer, result.originalExplanation, session.problemGuide);
    return { ...completed, requestId: session.requestId, createdAt: session.createdAt };
}
