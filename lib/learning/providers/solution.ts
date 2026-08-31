import { assertDetailedSolution, describeDetailedSolutionIssues, inspectDetailedSolution } from "../solution-quality";
import type { ProblemSnapshot } from "../types";
import { solutionSystemPrompt } from "./model-support";

type StreamRequest = (system: string, prompt: string, onDelta: (text: string) => void, maxTokens: number) => Promise<void>;

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
  const draft = await collect(request, solutionSystemPrompt(), JSON.stringify(problem), onDelta);
  const inspection = inspectDetailedSolution(draft, problem.text);
  if (inspection.valid) return;

  onReset();
  const repaired = await collect(
    request,
    repairSystemPrompt(),
    JSON.stringify({
      task: "根据验收失败原因重写完整讲解。必须重新组织完整正文，不能只补一小段，也不能解释校验规则。",
      validationIssues: describeDetailedSolutionIssues(inspection),
      problem,
      invalidDraft: draft.slice(0, 14_000),
      requiredStructure: ["### 解题思路", "### 分步推导", "### 结论", "### 易错提醒"],
    }),
    onDelta,
  );
  assertDetailedSolution(repaired, problem.text);
}

async function collect(request: StreamRequest, system: string, prompt: string, onDelta: (text: string) => void): Promise<string> {
  let output = "";
  await request(system, prompt, (text) => { output += text; onDelta(text); }, 5_000);
  return output;
}

function repairSystemPrompt(): string {
  return [
    solutionSystemPrompt(),
    "上一次讲解没有通过内容验收。这是唯一一次重写机会。必须使用四个指定的三级标题，分步推导至少写两个有序步骤；每一步都说明条件、依据和结果。",
    "只输出重写后的完整讲解正文，不输出道歉、校验说明、前言或代码块。",
  ].join("\n");
}
