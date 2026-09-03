"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateValidatedSolution = generateValidatedSolution;
exports.streamValidatedSolution = streamValidatedSolution;
const solution_quality_1 = require("../solution-quality");
const grade_pedagogy_1 = require("../grade-pedagogy");
const errors_1 = require("../errors");
const presentation_1 = require("../presentation");
const model_support_1 = require("./model-support");
async function generateValidatedSolution(problem, request) {
    let output = "";
    await streamValidatedSolution(problem, request, (text) => { output += text; }, () => { output = ""; });
    return output;
}
async function streamValidatedSolution(problem, request, onDelta, onReset) {
    const learnerBand = (0, grade_pedagogy_1.teachingBandOf)(problem);
    const draftResult = await collect(request, (0, model_support_1.solutionSystemPrompt)(learnerBand), JSON.stringify(problem), onDelta);
    const draft = draftResult.output;
    const inspection = (0, solution_quality_1.inspectDetailedSolution)(draft, problem.text);
    const gradeIssues = (0, grade_pedagogy_1.inspectGradeLanguage)(draft, learnerBand, problem.text, "solution");
    if (inspection.valid && hasBalancedMarkup(draft)) {
        warnGradeIssues(gradeIssues);
        return;
    }
    const repairedResult = await collect(request, repairSystemPrompt(learnerBand), JSON.stringify({
        task: "根据验收失败原因重写完整讲解。必须重新组织完整正文，不能只补一小段，也不能解释校验规则。",
        validationIssues: (0, solution_quality_1.describeDetailedSolutionIssues)(inspection),
        gradeLanguageIssues: gradeIssues,
        problem,
        invalidDraft: draft.slice(0, 14_000),
        requiredStructure: ["### 解题思路", "### 分步推导", "### 结论", "### 易错提醒"],
    }), () => undefined);
    const repaired = repairedResult.output;
    (0, solution_quality_1.assertDetailedSolution)(repaired, problem.text);
    (0, presentation_1.assertBalancedLearningMarkup)(repaired, "完整讲解");
    warnGradeIssues((0, grade_pedagogy_1.inspectGradeLanguage)(repaired, learnerBand, problem.text, "solution"));
    onReset();
    onDelta(repaired);
}
function warnGradeIssues(issues) {
    if (issues.length)
        console.warn("完整讲解已完成，但学段表达仍需优化", issues.join(","));
}
function hasBalancedMarkup(output) {
    try {
        (0, presentation_1.assertBalancedLearningMarkup)(output, "完整讲解");
        return true;
    }
    catch {
        return false;
    }
}
async function collect(request, system, prompt, onDelta) {
    let output = "";
    try {
        await request(system, prompt, (text) => { output += text; onDelta(text); }, 3_200);
        return { output };
    }
    catch (error) {
        if (isExternalAbort(error))
            throw error;
        if (!isRecoverableTailInterruption(error))
            throw error;
        return { output };
    }
}
function isRecoverableTailInterruption(error) {
    return error instanceof errors_1.ServiceError && (error.code === "PROVIDER_TIMEOUT" || /传输未完整结束/.test(error.message));
}
function isExternalAbort(error) {
    return error instanceof DOMException && error.name === "AbortError";
}
function repairSystemPrompt(learnerBand) {
    return [
        (0, model_support_1.solutionSystemPrompt)(learnerBand),
        "上一次讲解没有通过内容验收。这是唯一一次重写机会。必须使用四个指定的三级标题，分步推导至少写两个有序步骤；每一步都说明条件、依据和结果。",
        "只输出重写后的完整讲解正文，不输出道歉、校验说明、前言或代码块。",
    ].join("\n");
}
