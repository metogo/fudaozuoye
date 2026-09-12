import type { ProblemSnapshot, ProblemVisualContext } from "../types";
import { parseJsonObject } from "./model-support";
import { assertConfirmedVisualFactsPreserved, parseAuditedProblemSolution, parseAuditedVisualContext } from "./problem-image-analysis";

export const earlyVisualInstruction = "先完成图中条件核验，并将完整 visualContext 作为 JSON 的第一个字段输出，再输出 originalAnswer 和 originalExplanation。输出后不得重复或修改 visualContext；若核验不足，应如实降低置信度。保持完整求解要求，不省略任何小问或推导依据。";

/** Observe only a closed first object. Strings may contain braces and escaped quotes. */
export function observeVisualAudit(problem: ProblemSnapshot, emit: (visual: ProblemVisualContext) => void) {
  let buffer = "", sent: ProblemVisualContext | undefined;
  const validate = (value: unknown) => {
    const visual = parseAuditedVisualContext(value, true, Boolean(problem.userRevised && problem.visualContext?.affectsSolving));
    assertConfirmedVisualFactsPreserved(problem, visual);
    return visual;
  };
  return {
    delta(text: string) {
      if (sent) return;
      buffer += text;
      if (buffer.length > 60000) throw new Error("题图复核内容过长");
      const prefix = buffer.match(/^\s*(?:```json\s*)?\{\s*"visualContext"\s*:\s*/i);
      if (!prefix || buffer[prefix[0].length] !== "{") return;
      let depth = 0, quoted = false, escaped = false;
      for (let i = prefix[0].length; i < buffer.length; i++) {
        const char = buffer[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          sent = validate(parseJsonObject(buffer.slice(prefix[0].length, i + 1)));
          emit(sent);
          return;
        }
      }
    },
    complete(raw: string) {
      const result = parseAuditedProblemSolution(parseJsonObject(raw), true, Boolean(problem.userRevised && problem.visualContext?.affectsSolving));
      validate(result.visualContext);
      if (sent && JSON.stringify(sent) !== JSON.stringify(result.visualContext)) throw new Error("题图复核前后不一致，请重新分析");
      if (!sent) { sent = result.visualContext; emit(sent); }
      return result;
    },
  };
}
