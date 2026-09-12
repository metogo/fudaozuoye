import { describe, expect, it } from "vitest";
import { teachingAccuracyInstruction } from "../lib/learning/providers/teaching-accuracy";
import { tutorSystemPrompt } from "../lib/learning/providers/tutor";
import { solutionSystemPrompt } from "../lib/learning/providers/model-support";
import { knowledgeMapRules, knowledgeDetailSystem } from "../lib/learning/providers/knowledge-map";

describe("teaching rule scope contract (not a model accuracy proof)", () => {
  it("keeps questions about multiword phrases at the correct linguistic level", () => {
    expect(teachingAccuracyInstruction).toContain("提问时区分单词、短语和句子");
    expect(teachingAccuracyInstruction).toContain("多个单词构成的短语应问‘哪个短语’");
    expect(teachingAccuracyInstruction).toContain("不能脱离整句语境仅凭它断定时态");
    expect(teachingAccuracyInstruction).toContain("She went to school every day last year.");
  });
  it.each(["primary", "junior", "senior"] as const)("keeps scope constraints in %s tutor and solution prompts", band => {
    expect(tutorSystemPrompt(band)).toContain(teachingAccuracyInstruction);
    expect(solutionSystemPrompt(band)).toContain(teachingAccuracyInstruction);
  });
  it("keeps graph names and explanations under the same constraints", () => {
    expect(knowledgeMapRules).toContain(teachingAccuracyInstruction);
    expect(knowledgeDetailSystem).toContain(teachingAccuracyInstruction);
  });
});
