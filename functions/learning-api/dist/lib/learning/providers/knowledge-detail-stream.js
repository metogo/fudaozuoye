"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeDetailPrompt = knowledgeDetailPrompt;
exports.observeKnowledgeSummary = observeKnowledgeSummary;
exports.streamKnowledgeDetail = streamKnowledgeDetail;
const knowledge_map_1 = require("../knowledge-map");
const problem_evidence_1 = require("../problem-evidence");
const knowledge_map_2 = require("./knowledge-map");
const model_support_1 = require("./model-support");
const provider_text_request_1 = require("./provider-text-request");
const presentation_1 = require("../presentation");
const knowledge_detail_context_1 = require("../knowledge-detail-context");
function knowledgeDetailPrompt(session, map, nodeId) {
    return JSON.stringify({ subject: session.problem.subject, grade: session.problem.learnerBand ?? session.problem.gradeBand, original: (0, problem_evidence_1.problemEvidenceText)(session.problem), ...(0, knowledge_detail_context_1.knowledgeDetailContext)(map, nodeId) });
}
/** Only publish a closed JSON string, never half a formula or an inferred value. */
function observeKnowledgeSummary(emit) {
    let buffer = "", sent = false;
    return (delta) => {
        if (sent)
            return;
        buffer += delta;
        if (buffer.length > 60000)
            throw new Error("知识详情过长");
        const prefix = buffer.match(/^\s*(?:```json\s*)?\{\s*"summary"\s*:\s*/i);
        if (!prefix || buffer[prefix[0].length] !== '"')
            return;
        let escaped = false;
        for (let i = prefix[0].length + 1; i < buffer.length; i++) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (buffer[i] === "\\") {
                escaped = true;
                continue;
            }
            if (buffer[i] !== '"')
                continue;
            // Withhold invalid previews. The completed response still fails its validator.
            let summary;
            try {
                summary = (0, knowledge_map_1.parseKnowledgeDetail)((0, model_support_1.parseJsonObject)(`{"summary":${buffer.slice(prefix[0].length, i + 1)},"application":"pending"}`)).summary;
                (0, presentation_1.assertBalancedLearningMarkup)(summary, "知识说明");
            }
            catch {
                return;
            }
            sent = true;
            emit(summary);
            return;
        }
    };
}
async function streamKnowledgeDetail(context, session, map, nodeId, emit) {
    let preview;
    const raw = await (0, provider_text_request_1.requestModelText)(context, knowledge_map_2.knowledgeDetailSystem, knowledgeDetailPrompt(session, map, nodeId), undefined, true, 25000, undefined, 1400, observeKnowledgeSummary(summary => { preview = summary; emit(summary); }));
    const detail = (0, knowledge_map_1.parseKnowledgeDetail)((0, model_support_1.parseJsonObject)(raw));
    (0, presentation_1.assertBalancedLearningMarkup)(detail.summary, "知识说明");
    (0, presentation_1.assertBalancedLearningMarkup)(detail.application, "本题怎么用");
    if (preview !== undefined && detail.summary !== preview)
        throw new Error("知识详情前后不一致");
    return detail;
}
