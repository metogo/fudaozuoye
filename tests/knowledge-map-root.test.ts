import { describe, expect, it, vi } from "vitest";
import { observeMapRoot } from "@/lib/learning/providers/knowledge-map-root";
import { streamKnowledgeMap } from "@/lib/learning/providers/knowledge-map-stream";
import { LiveProviderAdapter } from "@/lib/learning/providers/adapter";
import type { LearningSession } from "@/lib/learning/types";

const session = { problem: { text: "长方形的长是8厘米，宽是3厘米。求周长。", gradeBand: "primary", subject: "math" }, nodes: [] } as unknown as LearningSession;
const root = { id: "core", title: "长方形周长", evidenceId: "e1", parents: [] };
const plan = { rootId: "core", nodes: [root, { id: "k1", title: "长方形对边相等", evidenceId: "e1", parents: ["core"] }] };
const relations = { relations: [{ kind: "prerequisite", reason: "对边相等才能由长宽确定四条边长" }] };
const prefix = '{"rootId":"core","nodes":[';

describe("根节点不等待整个知识清单", () => {
  it("只发布完整且有原题证据的根节点，支持逐字拆分和转义括号", () => {
    const emit = vi.fn(), observe = observeMapRoot(session, emit);
    const node = { ...root, title: '长度{"关系"}' };
    const first = prefix + JSON.stringify(node);
    for (const char of first.slice(0, -1)) observe(char);
    expect(emit).not.toHaveBeenCalled();
    observe(first.at(-1)!);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({ title: node.title, evidence: "长方形的长是8厘米，宽是3厘米。" });
    observe(',{"id":"k1"}]}');
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it.each([{ ...root, evidenceId: "invented" }, { ...root, evidenceId: "" }, { ...root, parents: ["other"] }, { ...root, title: "" }, { ...root, id: "__proto__" }])("不展示不合法的预览 %j", node => {
    const emit = vi.fn(); observeMapRoot(session, emit)(prefix + JSON.stringify(node)); expect(emit).not.toHaveBeenCalled();
  });
  it("不从其他字段里的伪清单或半截字符串提取根节点", () => {
    const emit = vi.fn();
    observeMapRoot(session, emit)(JSON.stringify({ note: prefix + JSON.stringify(root) }));
    observeMapRoot(session, emit)(prefix + '{"id":"core","title":"未结束');
    expect(emit).not.toHaveBeenCalled();
  });
  it("同一次请求里根先显示，清单未结束时不发布正式节点或进度", async () => {
    let finish!: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    const events = vi.fn(), roots = vi.fn(); let calls = 0;
    const run = streamKnowledgeMap(session, async (_system, _prompt, _timeout, onDelta) => {
      if (calls++ > 0) return JSON.stringify(relations);
      onDelta!(prefix + JSON.stringify(root));
      await held;
      return JSON.stringify(plan);
    }, events, roots);
    expect(roots.mock.calls.map(([node]) => node?.title ?? null)).toEqual([null, root.title]);
    expect(events).not.toHaveBeenCalled();
    finish();
    const optimized = await run;
    let legacyCalls = 0;
    const legacy = await streamKnowledgeMap(session, async () => JSON.stringify(legacyCalls++ ? relations : plan), () => {});
    expect(optimized).toEqual(legacy); // Identical model output -> identical complete graph.
    expect(calls).toBe(legacyCalls);
  });
  it("清单校验不放宽，修正开始先撤回旧根节点", async () => {
    const roots = vi.fn(); let calls = 0;
    await streamKnowledgeMap(session, async (_system, _prompt, _timeout, onDelta) => {
      if (calls++ === 0) { onDelta!(prefix + JSON.stringify(root)); return JSON.stringify({ ...plan, nodes: [root, { ...plan.nodes[1], evidenceId: "bad" }] }); }
      if (calls === 2) { onDelta!(prefix + JSON.stringify(root)); return JSON.stringify(plan); }
      return JSON.stringify(relations);
    }, () => {}, roots);
    expect(roots.mock.calls.map(([node]) => node?.title ?? null)).toEqual([null, root.title, null, root.title]);
    expect(calls).toBe(3);
  });
  it.each(["chat-completions", "responses"] as const)("%s 保留原模型和额度，仅清单使用上游流式传输", async protocol => {
    let finish!: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    const roots = vi.fn(), events = vi.fn(); let calls = 0;
    const adapter = new LiveProviderAdapter({ id: "doubao", label: "test", apiKey: "test", modelId: "same-model", baseUrl: "https://provider.invalid", protocol, mock: false }, async (_url, options) => {
      const body = JSON.parse(String(options?.body)); expect(body.model).toBe("same-model");
      if (protocol === "chat-completions") { expect(body.response_format).toEqual({ type: "json_object" }); expect(body.max_tokens).toBe(2600); }
      else expect(body.max_output_tokens).toBe(2600);
      if (calls++ > 0) {
        expect(body.stream).not.toBe(true);
        return Response.json(protocol === "responses" ? { output_text: JSON.stringify(relations) } : { choices: [{ message: { content: JSON.stringify(relations) } }] });
      }
      expect(body.stream).toBe(true);
      const first = prefix + JSON.stringify(root), rest = JSON.stringify(plan).slice(first.length);
      const frame = (text: string) => `data: ${JSON.stringify(protocol === "responses" ? { type: "response.output_text.delta", delta: text } : { choices: [{ delta: { content: text } }] })}\r\n\r\n`;
      return new Response(new ReadableStream({ async start(controller) {
        const send = (s: string) => controller.enqueue(new TextEncoder().encode(s));
        send(frame(first)); await held; send(frame(rest));
        send(`data: ${JSON.stringify(protocol === "responses" ? { type: "response.completed" } : { choices: [{ finish_reason: "stop" }] })}\n\n`); controller.close();
      } }), { headers: { "Content-Type": "text/event-stream" } });
    });
    const run = adapter.streamKnowledgeMap(session, events, roots);
    await vi.waitFor(() => expect(roots.mock.calls.some(([node]) => node?.title === root.title)).toBe(true));
    expect(events).not.toHaveBeenCalled(); finish();
    expect((await run).nodes).toHaveLength(2); expect(calls).toBe(2);
  });
});
