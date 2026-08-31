import { describe, expect, it } from "vitest";
import { postTutor } from "@/lib/learning/http/tutor";
import { sse } from "@/lib/learning/http/sse";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { sealSession } from "@/lib/learning/server-state";

function tutorRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/learning/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("上下文追问 SSE", () => {
  it("流式失败不向学生暴露课程节点 ID 和内部校验字段", async () => {
    const response = sse(async () => { throw new Error("节点 physics.optics.refraction 的简化理由没有联系已引用的真实原文"); });
    const body = await response.text();
    expect(body).toContain("知识关系没有通过可靠性检查");
    expect(body).not.toContain("physics.optics.refraction");
    expect(body).not.toContain("简化理由");
  });

  it("围绕原题引导逐段输出并正常结束", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const response = await postTutor(tutorRequest({
      stateToken: sealSession(session),
      scope: { kind: "problem" },
      question: "为什么不能直接用 180 除以 5？",
    }));
    const body = await response.text();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(body).toContain("event: delta");
    expect(deltaText(body)).toContain("为什么不能直接用 180 除以 5");
    expect(body).toContain("event: complete");
  });

  it("指定原题引导段落时只把该段作为追问焦点", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const response = await postTutor(tutorRequest({
      stateToken: sealSession(session),
      scope: { kind: "problem", section: "keyClue" },
      question: "为什么这条线索重要？",
    }));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(deltaText(body)).toContain("先抓住这条线索");
    expect(deltaText(body)).toContain(session.problemGuide.keyClue);
  });

  it("围绕会话中的知识节点回答", async () => {
    const session = analyzeMock(recognizeMock("physics", "junior"), "doubao");
    const node = session.nodes.find((item) => item.kind === "concept");
    const response = await postTutor(tutorRequest({
      stateToken: sealSession(session),
      scope: { kind: "node", nodeId: node?.id },
      question: "能换一个生活里的例子吗？",
    }));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(deltaText(body)).toContain(node?.teaching.example);
    expect(body).toContain("event: complete");
  });

  it.each([
    [{ kind: "node", nodeId: "missing-node" }, "问题", "追问的知识节点不存在"],
    [{ kind: "problem" }, "   ", "请输入想问的问题"],
    [{ kind: "problem" }, "怎么做\u0001", "问题中含有不支持的控制字符"],
    [{ kind: "problem", section: "answer" }, "为什么？", "追问的原题段落不存在"],
    [{ kind: "problem" }, "问".repeat(301), "问题请控制在 300 字以内"],
  ])("拒绝非法范围或问题", async (scope, question, message) => {
    const session = analyzeMock(recognizeMock("chemistry", "junior"), "doubao");
    const response = await postTutor(tutorRequest({ stateToken: sealSession(session), scope, question }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain(message);
  });

  it("模型配置变化后拒绝让旧会话被另一个模型续写", async () => {
    const session = { ...analyzeMock(recognizeMock("math", "primary"), "doubao"), modelId: "stale-model-id" };
    const response = await postTutor(tutorRequest({
      stateToken: sealSession(session),
      scope: { kind: "problem" },
      question: "第一步看哪里？",
    }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("模型配置已变化");
  });

  it("运行模式变化后拒绝让实时会话静默切到演示模板", async () => {
    const session = { ...analyzeMock(recognizeMock("math", "primary"), "doubao"), mode: "live" as const };
    const response = await postTutor(tutorRequest({
      stateToken: sealSession(session),
      scope: { kind: "problem" },
      question: "第一步看哪里？",
    }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("模型配置已变化");
  });
});

function deltaText(body: string): string {
  return [...body.matchAll(/event: delta\ndata: (.+)/g)]
    .map((match) => (JSON.parse(match[1]) as { text: string }).text)
    .join("");
}
