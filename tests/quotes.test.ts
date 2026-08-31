import { describe, expect, it } from "vitest";
import { learningQuotes, loadingLearningQuotes } from "@/lib/learning/quotes";

describe("首页励志词条库", () => {
  it("至少提供 100 条不重复且都有明确出处的原句", () => {
    expect(learningQuotes.length).toBeGreaterThanOrEqual(100);
    expect(new Set(learningQuotes.map((quote) => quote.text.replace(/\s/g, ""))).size).toBe(learningQuotes.length);
    expect(learningQuotes.every((quote) => quote.source.trim().length >= 4)).toBe(true);
    expect(learningQuotes.some((quote) => quote.source.includes("回溯学"))).toBe(false);
  });

  it("等待状态只使用有出处且直接鼓励学习的独立白名单", () => {
    expect(loadingLearningQuotes.length).toBeGreaterThanOrEqual(20);
    expect(new Set(loadingLearningQuotes.map((quote) => quote.text.replace(/\s/g, ""))).size).toBe(loadingLearningQuotes.length);
    expect(loadingLearningQuotes.every((quote) => quote.text.trim().length > 0 && quote.source.trim().length >= 4)).toBe(true);
  });
});
