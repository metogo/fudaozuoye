import { describe, expect, it } from "vitest";
import { connectionSegments, latestConnectionMessage, parseGeneratedConnection, parseKnowledgeConnection } from "@/lib/learning/knowledge-connection";
import type { ChatMessage } from "@/lib/learning/types";
import { connection, source, evidence } from "./fixtures/knowledge-connection";
const message = { id: "m", role: "assistant", kind: "assistant", status: "complete", text: source } as ChatMessage;
describe("模型明确绑定讲解中的知识连接", () => {
  it("正文没有任何概念名称、也没有诊断节点，仍接受有依据的连接", () => {
    expect(source).not.toContain(connection.foundation.title);
    expect(source).not.toContain(connection.target.title);
    expect(parseKnowledgeConnection(connection, source, evidence)).toEqual(connection);
  });
  it("用明确段落与证据编号绑定，不做关键词猜测", () => {
    const value = { ...connection, relevant: true, anchorId: "p1", evidenceId: "e1" };
    expect(parseGeneratedConnection(value, source, [{ id: "e1", text: evidence }])).toEqual(connection);
    expect(() => parseGeneratedConnection({ ...value, anchorId: "p9" }, source, [{ id: "e1", text: evidence }])).toThrow();
    expect(() => parseGeneratedConnection({ ...value, evidenceId: "e9" }, source, [{ id: "e1", text: evidence }])).toThrow();
  });
  it("不相关可明确不展示，但损坏响应不是没有关系", () => {
    expect(parseGeneratedConnection({ relevant: false }, source, [])).toBeNull();
    expect(() => parseGeneratedConnection({}, source, [])).toThrow();
    expect(() => parseKnowledgeConnection({}, source, evidence)).toThrow();
  });
  it("拒绝其他讲解、伪造原题证据、重复概念和损坏公式", () => {
    expect(() => parseKnowledgeConnection({ ...connection, anchor: "另一段讲解" }, source, evidence)).toThrow();
    expect(() => parseKnowledgeConnection({ ...connection, evidence: "" }, source, evidence)).toThrow();
    expect(() => parseKnowledgeConnection({ ...connection, evidence: "每小时走100千米" }, source, evidence)).toThrow();
    expect(() => parseKnowledgeConnection({ ...connection, target: connection.foundation }, source, evidence)).toThrow();
    expect(() => parseKnowledgeConnection({ ...connection, reason: "计算这里的乘法关系应当使用$x" }, source, evidence)).toThrow();
  });
  it("只处理最新一轮已完成正文，流式、失败、用户或板书都不能触发", () => {
    expect(latestConnectionMessage([message])).toEqual(message);
    for (const status of ["streaming", "finishing", "error"] as const) expect(latestConnectionMessage([message, { ...message, id: "new", status }])).toBeUndefined();
    expect(latestConnectionMessage([message, { ...message, role: "user" }])).toBeUndefined();
    expect(latestConnectionMessage([{ ...message, surface: "board" }])).toBeUndefined();
  });
  it("保留原文段落，不改写公式或把标题当匹配关键词", () => {
    expect(connectionSegments("标题\n\n第一段。\n\n第二段。").map(p => p.id)).toEqual(["p1", "p2", "p3"]);
  });
});
