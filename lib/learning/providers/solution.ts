import { assertDetailedSolution, describeDetailedSolutionIssues, inspectDetailedSolution } from "../solution-quality";
import { inspectGradeLanguage, teachingBandOf } from "../grade-pedagogy";
import { ServiceError } from "../errors";
import { assertBalancedLearningMarkup } from "../presentation";
import { problemEvidenceText } from "../problem-evidence";
import type { ProblemSnapshot } from "../types";
import { solutionSystemPrompt } from "./model-support";

type StreamRequest = (system: string, prompt: string, onDelta: (text: string) => void, maxTokens: number | null) => Promise<void>;
type OutputBudget = { characters: number; continued: boolean };

export async function generateValidatedSolution(problem: ProblemSnapshot, request: StreamRequest): Promise<string> {
  let output = "";
  await streamValidatedSolution(problem, request, (text) => { output += text; }, () => { output = ""; });
  return output;
}

export async function streamValidatedSolution(
  problem: ProblemSnapshot,
  request: StreamRequest,
  onDelta: (text: string) => void,
  onReset: () => void,
): Promise<void> {
  const learnerBand = teachingBandOf(problem);
  const evidence = problemEvidenceText(problem);
  const budget: OutputBudget = { characters: 0, continued: false };
  const draftResult = await collect(request, solutionSystemPrompt(learnerBand), JSON.stringify(problem), onDelta, budget);
  const draft = draftResult.output;
  const inspection = inspectDetailedSolution(draft, evidence);
  const gradeIssues = inspectGradeLanguage(draft, learnerBand, problem.text, "solution");
  if (inspection.valid && hasBalancedMarkup(draft)) {
    warnGradeIssues(gradeIssues);
    return;
  }

  const repairedResult = await collect(
    request,
    repairSystemPrompt(learnerBand),
    JSON.stringify({
      task: "根据验收失败原因重写完整讲解。必须重新组织完整正文，不能只补一小段，也不能解释校验规则。",
      validationIssues: describeDetailedSolutionIssues(inspection),
      gradeLanguageIssues: gradeIssues,
      problem,
      invalidDraft: draft.slice(0, 14_000),
      requiredStructure: ["### 解题思路", "### 分步推导", "### 结论", "### 易错提醒"],
    }),
    () => undefined,
    budget,
  );
  const repaired = repairedResult.output;
  assertDetailedSolution(repaired, evidence);
  assertBalancedLearningMarkup(repaired, "完整讲解");
  warnGradeIssues(inspectGradeLanguage(repaired, learnerBand, problem.text, "solution"));
  onReset();
  onDelta(repaired);
}

function warnGradeIssues(issues: ReturnType<typeof inspectGradeLanguage>): void {
  if (issues.length) console.warn("完整讲解已完成，但学段表达仍需优化", issues.join(","));
}

function hasBalancedMarkup(output: string): boolean {
  try { assertBalancedLearningMarkup(output, "完整讲解"); return true; } catch { return false; }
}

async function collect(request: StreamRequest, system: string, prompt: string, onDelta: (text: string) => void, budget: OutputBudget): Promise<{ output: string }> {
  let output = "";
  const emit = (text: string) => {
    budget.characters += text.length;
    if (budget.characters > 60_000) throw new ServiceError("模型流式输出超过安全长度，请缩短问题后重试", 502, "PROVIDER_ERROR", true);
    output += text;
    onDelta(text);
  };
  try {
    await request(system, prompt, emit, null);
    return { output };
  } catch (error) {
    if (isExternalAbort(error)) throw error;
    if (error instanceof ServiceError && error.code === "PROVIDER_OUTPUT_LIMIT") {
      if (!output.trim() || budget.continued) throw error;
      budget.continued = true;
      await request(system, JSON.stringify({
        task: "上次输出因模型额度限制中断。仅从前文末尾继续，补完尚未完成的推导、各小问和剩余章节；不要重述已输出内容，不要从头重写，不要添加前言。若末尾公式或句子未闭合，先续完它。",
        originalPrompt: prompt,
        previousDraft: output,
      }), emit, null);
      return { output };
    }
    if (!isRecoverableTailInterruption(error)) throw error;
    return { output };
  }
}

function isRecoverableTailInterruption(error: unknown): boolean {
  return error instanceof ServiceError && (error.code === "PROVIDER_TIMEOUT" || /传输未完整结束/.test(error.message));
}

function isExternalAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function repairSystemPrompt(learnerBand: ProblemSnapshot["gradeBand"]): string {
  return [
    solutionSystemPrompt(learnerBand),
    "上一次讲解没有通过内容验收。这是唯一一次重写机会。必须使用四个指定的三级标题，分步推导至少写两个有序步骤；每一步都说明条件、依据和结果。",
    "只输出重写后的完整讲解正文，不输出道歉、校验说明、前言或代码块。",
  ].join("\n");
}
