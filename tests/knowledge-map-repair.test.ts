import { afterEach, describe, expect, it, vi } from "vitest";
import { streamKnowledgeMap } from "@/lib/learning/providers/knowledge-map-stream";
import { requestMapValue } from "@/lib/learning/providers/knowledge-map-validation";
import { readMapStream } from "@/lib/learning/knowledge-map-stream";
import type { LearningSession } from "@/lib/learning/types";

const session = { problem: { text: "正方形草地两侧铺路，求长方形周长。", subject: "math", gradeBand: "primary" }, nodes: [] } as unknown as LearningSession;
const plan = { rootId: "core", nodes: [
  { id: "core", title: "周长", evidenceId: "e1", parents: [] },
  { id: "side", title: "边长", evidenceId: "e1", parents: ["core"] },
] };
const relations = { relations: [{ kind: "prerequisite", reason: "先确定边长才能求周长" }] };

describe("图谱只修正不合格内容，不重播已生成节点", () => {
  afterEach(() => vi.useRealTimers());
  it.each(["core", "side"])("%s缺少证据时先修正整份清单，再发布真实进度", async id => {
    const events: string[] = [];
    const broken = { ...plan, nodes: plan.nodes.map(n => n.id === id ? { ...n, evidenceId: "" } : n) };
    const request = vi.fn(async (_s: string, prompt: string) => {
      if (request.mock.calls.length === 1) return JSON.stringify(broken);
      if (request.mock.calls.length === 2) {
        expect(events).toEqual([]);
        expect(JSON.parse(prompt).validationError).toContain(id);
        return JSON.stringify(plan);
      }
      return JSON.stringify(relations);
    });
    const map = await streamKnowledgeMap(session, request, e => events.push(e.type));
    expect(map.nodes.every(n => n.evidence === session.problem.text)).toBe(true);
    expect(events).toEqual(["plan", "node", "node"]);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("关系漏填只重试当前节点，不重新规划或重复发根节点", async () => {
    const events: string[] = [];
    const request = vi.fn(async (_s: string, prompt: string) => {
      if (request.mock.calls.length === 1) return JSON.stringify(plan);
      if (request.mock.calls.length === 2) return JSON.stringify({ relations: [] });
      expect(events).toEqual(["plan", "core"]);
      expect(JSON.parse(prompt).originalInput.node.title).toBe("边长");
      return JSON.stringify(relations);
    });
    await streamKnowledgeMap(session, request, e => events.push(e.type === "plan" ? "plan" : e.node.id));
    expect(events).toEqual(["plan", "core", "side"]);
  });
  it("连续错误或伪造证据最多两次，不能默认为有效证据", async () => {
    const events: string[] = [];
    const broken = { ...plan, nodes: plan.nodes.map(n => ({ ...n, evidenceId: "不存在" })) };
    const request = vi.fn(async () => JSON.stringify(broken));
    await expect(streamKnowledgeMap(session, request, e => events.push(e.type))).rejects.toThrow("不存在");
    expect(request).toHaveBeenCalledTimes(2);
    expect(events).toEqual([]);
  });
  it("用户取消或网络失败不会触发内容修正", async () => {
    const request = vi.fn(async () => { throw new DOMException("取消", "AbortError"); });
    await expect(streamKnowledgeMap(session, request, () => undefined)).rejects.toThrow("取消");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("修正与首次调用共享预算，不额外延长超时", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (_s: string, _p: string, timeout?: number) => {
      if (request.mock.calls.length === 1) { vi.setSystemTime(Date.now() + 12000); return "invalid"; }
      expect(timeout).toBe(18000);
      return "{}";
    });
    await requestMapValue(request, "system", "{}", value => value, 30000);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("旧后端即使返回200，也不能通过流式发布验收", async () => {
    await expect(readMapStream(Response.json({ map: {} }), () => undefined)).rejects.toThrow("图谱连接未建立");
  });
});
