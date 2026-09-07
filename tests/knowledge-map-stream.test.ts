import { describe, expect, it } from "vitest";
import { applyMapEvent, finishMapDraft, mapPlanPositions, parseMapPlan, readMapStream } from "@/lib/learning/knowledge-map-stream";
import { streamKnowledgeMap } from "@/lib/learning/providers/knowledge-map-stream";
import { LiveProviderAdapter } from "@/lib/learning/providers/adapter";
import type { LearningSession } from "@/lib/learning/types";

const session = { problem: { text: "正方形草地两侧铺路，求长方形周长。", gradeBand: "primary", subject: "math" }, nodes: [] } as unknown as LearningSession;
const plan = { rootId: "core", nodes: [{ id: "core", title: "长方形周长", evidenceId: "e1", parents: [] }, { id: "base", title: "正方形边长", evidenceId: "e1", parents: ["core"] }] };
const relation = { from: "core", kind: "prerequisite", reason: "正方形边长就是整块地的宽" };

describe("图谱真实流式协议", () => {
  it("清单与根节点先出现，不等待关联知识生成结束", async () => {
    const events: string[] = [];
    let calls = 0;
    const map = await streamKnowledgeMap(session, async () => {
      if (calls++ === 0) return JSON.stringify(plan);
      expect(events).toEqual(["plan", "node"]);
      return JSON.stringify({ relations: [relation] });
    }, e => events.push(e.type));
    expect(events).toEqual(["plan", "node", "node"]);
    expect(map.nodes[0].evidence).toBe(session.problem.text);
  });
  it.each(["chat-completions", "responses"] as const)("%s 使用有界请求生成，根节点早于后续请求完成", async protocol => {
    const events: string[] = [];
    let calls = 0;
    const adapter = new LiveProviderAdapter({ id: "doubao", label: "test", apiKey: "test", modelId: "test", baseUrl: "https://provider.invalid", protocol, mock: false }, async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      if (protocol === "chat-completions") expect(body.response_format).toEqual({ type: "json_object" });
      if (calls) expect(events).toEqual(["plan", "node"]);
      const content = JSON.stringify(calls++ ? { relations: [relation] } : plan);
      return Response.json(protocol === "chat-completions" ? { choices: [{ message: { content } }] } : { output_text: content });
    });
    expect((await adapter.streamKnowledgeMap(session, e => events.push(e.type))).nodes).toHaveLength(2);
  });
  it("并发最多两个，独立节点完成即显示，失败保留已就绪兄弟节点", async () => {
    const bigger = { ...plan, nodes: [...plan.nodes, { ...plan.nodes[1], id: "other", title: "长度的加法" }, { ...plan.nodes[1], id: "last", title: "乘法意义" }] };
    const emitted: string[] = [];
    const pending = new Map<string, (value: string) => void>();
    let calls = 0, active = 0, maxActive = 0;
    const run = streamKnowledgeMap(session, async (_s, prompt) => {
      if (calls++ === 0) return JSON.stringify(bigger);
      active++; maxActive = Math.max(maxActive, active);
      const nodeTitle = JSON.parse(prompt).node.title;
      const text = await new Promise<string>(resolve => pending.set(bigger.nodes.find(n => n.title === nodeTitle)!.id, resolve));
      active--; return text;
    }, e => { if (e.type === "node") emitted.push(e.node.id); });
    await Promise.resolve(); await Promise.resolve();
    expect(pending.size).toBe(2);
    pending.get("other")!(JSON.stringify({ relations: [relation] }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(emitted).toEqual(["core", "other"]);
    pending.get("base")!(JSON.stringify({ relations: [relation] }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(emitted).toEqual(["core", "other", "base"]);
    pending.get("last")!(JSON.stringify({ relations: [] }));
    await expect(run).rejects.toThrow();
    expect(maxActive).toBe(2);
    expect(emitted).toEqual(["core", "other", "base"]);
  });
  it("子节点先完成时等待父节点，但不阻塞独立分支", async () => {
    const branched = { ...plan, nodes: [...plan.nodes,
      { ...plan.nodes[1], id: "child", title: "长度加法", parents: ["base"] },
      { ...plan.nodes[1], id: "sibling", title: "乘法意义" }] };
    let release!: (text: string) => void;
    let calls = 0;
    const emitted: string[] = [];
    const run = streamKnowledgeMap(session, async (_system, prompt) => {
      if (calls++ === 0) return JSON.stringify(branched);
      if (JSON.parse(prompt).node.title === "正方形边长") return new Promise(resolve => { release = resolve; });
      return JSON.stringify({ relations: [relation] });
    }, event => { if (event.type === "node") emitted.push(event.node.id); });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(emitted).toEqual(["core", "sibling"]);
    release(JSON.stringify({ relations: [relation] }));
    await run;
    expect(emitted).toEqual(["core", "sibling", "base", "child"]);
  });
  it("同层三个以上分支保持一行，位置不依赖到达顺序和屏幕宽度", () => {
    const branched = { ...plan, nodes: [...plan.nodes, ...["a", "b", "c"].map(id => ({ id, parents: ["core"] }))] };
    const positions = mapPlanPositions(parseMapPlan(branched));
    expect(positions.core).toEqual({ x: 0, y: 0 });
    expect(new Set(branched.nodes.slice(1).map(n => positions[n.id].y))).toEqual(new Set([208]));
    expect(branched.nodes.slice(1).map(n => positions[n.id].x)).toEqual([-348, -116, 116, 348]);
  });
  it.each([{}, { relations: [] }, { relations: [{ ...relation, kind: "missing" }] }, { relations: [relation, relation] }])("不完整的关联不增加计数：%j", async bad => {
    const events: string[] = []; let calls = 0;
    await expect(streamKnowledgeMap(session, async () => JSON.stringify(calls++ ? bad : plan), e => events.push(e.type))).rejects.toThrow();
    expect(events).toEqual(["plan", "node"]);
  });
  it("清单错误、伪造证据或重复名称不发布虚假进度", async () => {
    for (const nodes of [[plan.nodes[1], plan.nodes[0]], [plan.nodes[0], { ...plan.nodes[1], evidenceId: "missing" }], [plan.nodes[0], { ...plan.nodes[1], title: plan.nodes[0].title }]]) {
      const events: string[] = [];
      await expect(streamKnowledgeMap(session, async () => JSON.stringify({ ...plan, nodes }), e => events.push(e.type))).rejects.toThrow();
      expect(events).toEqual([]);
    }
    expect(() => parseMapPlan({ ...plan, nodes: Array(17).fill(plan.nodes[0]) })).toThrow();
  });
  it("多父节点关联按既定清单接入，不依赖模型重复填写编号", async () => {
    const shared = { ...plan, nodes: [...plan.nodes, { id: "shared", title: "长度关系", evidenceId: "e1", parents: ["core", "base"] }] };
    let calls = 0;
    const result = await streamKnowledgeMap(session, async (_s, prompt) => {
      if (calls++ === 0) return JSON.stringify(shared);
      const parents = JSON.parse(prompt).parents as { title: string }[];
      return JSON.stringify({ relations: parents.map(parent => ({ kind: "prerequisite", reason: `支撑${parent.title}的边长关系` })) });
    }, () => undefined);
    expect(result.edges.filter(e => e.to === "shared").map(e => e.from)).toEqual(["core", "base"]);
  });
  it("客户端拒绝少节点的完成状态与重复编号", () => {
    let draft = applyMapEvent({ plan: null, map: null }, { type: "plan", plan }, session.problem.text);
    const node = { ...plan.nodes[0], evidence: session.problem.text, summary: "", application: "" };
    draft = applyMapEvent(draft, { type: "node", node, edges: [] }, session.problem.text);
    expect(() => finishMapDraft(draft, session.problem.text)).toThrow();
    expect(() => applyMapEvent(draft, { type: "node", node, edges: [] }, session.problem.text)).toThrow();
  });
  it("SSE支持中文UTF8跨块及CRLF，结束后释放reader", async () => {
    const bytes = new TextEncoder().encode('event: map.start\r\ndata: {"text":"图谱"}\r\n\r\nevent: complete\r\ndata: {"total":2}\r\n\r\n');
    const stream = new ReadableStream<Uint8Array>({ start(controller) { bytes.forEach(b => controller.enqueue(new Uint8Array([b]))); controller.close(); } });
    const events: unknown[] = [];
    await readMapStream(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }), (e, d) => events.push([e, d]));
    expect(events).toEqual([["map.start", { text: "图谱" }], ["complete", { total: 2 }]]);
    expect(stream.locked).toBe(false);
  });
});
