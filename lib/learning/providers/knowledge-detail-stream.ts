import { parseKnowledgeDetail, type KnowledgeDetail, type ProblemKnowledgeMap } from "../knowledge-map";
import { problemEvidenceText } from "../problem-evidence";
import type { LearningSession } from "../types";
import { knowledgeDetailSystem } from "./knowledge-map";
import { parseJsonObject } from "./model-support";
import { requestModelText, type TextRequestContext } from "./provider-text-request";
import { assertBalancedLearningMarkup } from "../presentation";
import { knowledgeDetailContext } from "../knowledge-detail-context";

export function knowledgeDetailPrompt(session: LearningSession, map: ProblemKnowledgeMap, nodeId: string) {
  return JSON.stringify({ subject: session.problem.subject, grade: session.problem.learnerBand ?? session.problem.gradeBand, original: problemEvidenceText(session.problem), ...knowledgeDetailContext(map, nodeId) });
}

/** Only publish a closed JSON string, never half a formula or an inferred value. */
export function observeKnowledgeSummary(emit: (summary: string) => void) {
  let buffer = "", sent = false;
  return (delta: string) => {
    if (sent) return;
    buffer += delta;
    if (buffer.length > 60000) throw new Error("知识详情过长");
    const prefix = buffer.match(/^\s*(?:```json\s*)?\{\s*"summary"\s*:\s*/i);
    if (!prefix || buffer[prefix[0].length] !== '"') return;
    let escaped = false;
    for (let i = prefix[0].length + 1; i < buffer.length; i++) {
      if (escaped) { escaped = false; continue; }
      if (buffer[i] === "\\") { escaped = true; continue; }
      if (buffer[i] !== '"') continue;
      // Withhold invalid previews. The completed response still fails its validator.
      let summary: string;
      try {
        summary = parseKnowledgeDetail(parseJsonObject(`{"summary":${buffer.slice(prefix[0].length, i + 1)},"application":"pending"}`)).summary;
        assertBalancedLearningMarkup(summary, "知识说明");
      } catch { return; }
      sent = true;
      emit(summary);
      return;
    }
  };
}

export async function streamKnowledgeDetail(context: TextRequestContext, session: LearningSession, map: ProblemKnowledgeMap, nodeId: string, emit: (summary: string) => void): Promise<KnowledgeDetail> {
  let preview: string | undefined;
  const raw = await requestModelText(context, knowledgeDetailSystem, knowledgeDetailPrompt(session, map, nodeId), undefined, true, 25000, undefined, 1400,
    observeKnowledgeSummary(summary => { preview = summary; emit(summary); }));
  const detail = parseKnowledgeDetail(parseJsonObject(raw));
  assertBalancedLearningMarkup(detail.summary, "知识说明");
  assertBalancedLearningMarkup(detail.application, "本题怎么用");
  if (preview !== undefined && detail.summary !== preview) throw new Error("知识详情前后不一致");
  return detail;
}
