import type { LearningSession, ProblemVisualContext } from "../types";
import { assertProblemInformationComplete } from "../problem-completeness";
import { buildSession, parseProblemSolution } from "./provider-validation";
import { assertConfirmedVisualFactsPreserved, parseAuditedProblemSolution, problemSolutionRequest } from "./problem-image-analysis";
import { earlyVisualInstruction, observeVisualAudit } from "./early-visual-audit";
import { problemSolutionTool, type JsonObject } from "./model-support";
import { requestModelText, type TextRequestContext } from "./provider-text-request";

type JsonRequest = <T>(system: string, prompt: string, parse: (value: JsonObject) => T, image?: string) => Promise<T>;
type StructuredRequest = <T>(system: string, prompt: string, tool: JsonObject, parse: (value: JsonObject) => T) => Promise<T>;

export async function completeChatPreparation(context: TextRequestContext, session: LearningSession, json: JsonRequest, structured: StructuredRequest, image?: string, onVisual?: (visual: ProblemVisualContext) => void): Promise<LearningSession> {
  const problem = session.problem;
  assertProblemInformationComplete(problem);
  const { system, prompt } = problemSolutionRequest(problem, Boolean(image));
  let audited: ReturnType<typeof parseAuditedProblemSolution> | null = null;
  if (image && onVisual) {
    const observer = observeVisualAudit(problem, onVisual);
    const deadline = Date.now() + 60000;
    const raw = await requestModelText(context, `${system}\n${earlyVisualInstruction}`, prompt, image, true, 60000, undefined, 3000, observer.delta);
    try { audited = observer.complete(raw); }
    catch (error) {
      if (error instanceof Error && /前后不一致|已确认|仍不清楚|必需的题图条件/.test(error.message)) throw error;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw error;
      const repaired = await requestModelText(context, `${system}\n仅修复 JSON 结构或公式转义，保留原有图中条件，不得改变事实。`, JSON.stringify({ originalRequirement: prompt, invalidOutput: raw, validationError: error instanceof Error ? error.message : "格式不完整" }), image, true, remaining);
      audited = observer.complete(repaired);
    }
  } else if (image) {
    audited = await json(system, prompt, value => parseAuditedProblemSolution(value, true, Boolean(problem.userRevised && problem.visualContext?.affectsSolving)), image);
  }
  if (audited) assertConfirmedVisualFactsPreserved(problem, audited.visualContext);
  const result = audited?.solution ?? (context.config.protocol === "chat-completions"
    ? await structured(system, prompt, problemSolutionTool(), parseProblemSolution)
    : await json(system, prompt, parseProblemSolution));
  const completedProblem = audited && !problem.userRevised ? { ...problem, visualContext: audited.visualContext } : problem;
  const completed = buildSession(completedProblem, session.provider, session.reasoningLevel, context.config.modelId, [], result.originalAnswer, result.originalExplanation, session.problemGuide);
  return { ...completed, requestId: session.requestId, createdAt: session.createdAt };
}
