import { afterEach, expect, it, vi } from "vitest";
import { streamKnowledgeDetail, observeKnowledgeSummary } from "@/lib/learning/providers/knowledge-detail-stream";
import { requestModelText, type TextRequestContext } from "@/lib/learning/providers/provider-text-request";
import type { LearningSession } from "@/lib/learning/types";
import type { ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";

vi.mock("@/lib/learning/providers/provider-text-request", () => ({ requestModelText: vi.fn() }));
const session = { problem: { text: "长8宽3", subject: "math", gradeBand: "primary" } } as LearningSession;
const map = { rootId: "core", nodes: [{ id: "core", title: "面积", evidence: "长8宽3", summary: "", application: "" }], edges: [] } as unknown as ProblemKnowledgeMap;
const detail = { summary: "面积用 $S=ab$ 表示。", application: "用本题给出的长乘以宽。" };
afterEach(() => vi.resetAllMocks());

it("完整第一段可以提前展示，但返回值仍校验整份内容", async () => {
  const emit = vi.fn();
  vi.mocked(requestModelText).mockImplementation(async (...args) => {
    const raw = JSON.stringify(detail);
    for (const part of raw) args[8]!(part);
    return raw;
  });
  expect(await streamKnowledgeDetail({} as TextRequestContext, session, map, "core", emit)).toEqual(detail);
  expect(emit).toHaveBeenCalledExactlyOnceWith(detail.summary);
});

it("预览和最后全文不一致则失败，不能把另一份内容缓存成完成", async () => {
  vi.mocked(requestModelText).mockImplementation(async (...args) => {
    args[8]!(JSON.stringify(detail));
    return JSON.stringify({ ...detail, summary: "另一个结论" });
  });
  await expect(streamKnowledgeDetail({} as TextRequestContext, session, map, "core", () => {})).rejects.toThrow("前后不一致");
});

it.each(["内容 $x", "面积 rac{1}{2}", "", "a".repeat(701)])("残缺或损坏的最终正文拒绝发布：%s", application => {
  vi.mocked(requestModelText).mockResolvedValue(JSON.stringify({ ...detail, application }));
  return expect(streamKnowledgeDetail({} as TextRequestContext, session, map, "core", () => {})).rejects.toThrow();
});

it("缺失节点不发模型请求，异常长的流式前缀也有界拒绝", async () => {
  await expect(streamKnowledgeDetail({} as TextRequestContext, session, map, "missing", () => {})).rejects.toThrow("知识点不存在");
  expect(requestModelText).not.toHaveBeenCalled();
  expect(() => observeKnowledgeSummary(() => {})(" ".repeat(60001))).toThrow("过长");
});
