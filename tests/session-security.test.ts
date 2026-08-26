import { describe, expect, it } from "vitest";
import { POST as verifyRoute } from "@/app/api/learning/verify/route";
import { analyzeMock, recognizeMock, transferCheckMock } from "@/lib/learning/mock-engine";
import { CONSENT_COOKIE, consentRateIdentity, createConsentValue, hasValidConsent, openSession, sealSession, toClientState } from "@/lib/learning/server-state";

describe("无状态学习会话边界", () => {
  it("不向浏览器下发标准答案，且令牌被修改后无法使用", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const state = toClientState(session);
    expect(state.session.nodes.every((node) => node.check.answer === "")).toBe(true);
    expect(openSession(state.stateToken).nodes.some((node) => node.check.answer.length > 0)).toBe(true);
    const parts = state.stateToken.split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    expect(() => openSession(parts.join("."))).toThrow(/损坏|修改/);
  });

  it("拒绝绕过当前节点直接验收原题", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const request = jsonRequest({ stateToken: sealSession(session), nodeId: session.rootNodeId, answer: "300", source: "system" });
    const response = await verifyRoute(request);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("只能验收当前学习节点");
  });

  it("拒绝空迁移答案", async () => {
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const session = { ...base, stage: "transfer_check" as const, originalPassed: true, currentNodeId: null, transferCheck: transferCheckMock("math", "primary") };
    const response = await verifyRoute(jsonRequest({ stateToken: sealSession(session), nodeId: "__transfer__", answer: "" }));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("迁移验收状态不合法");
  });

  it("原子点第一次表示不会只切换讲法，第二次客观检查失败才需真人介入", async () => {
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const current = base.nodes.find((node) => node.kind === "concept")!;
    const session = {
      ...base,
      stage: "learning" as const,
      currentNodeId: current.id,
      nodes: base.nodes.map((node) => node.id === current.id ? { ...node, atomic: true } : node),
    };

    const first = await verifyRoute(jsonRequest({ stateToken: sealSession(session), nodeId: current.id, action: "mark_unknown", source: "system" }));
    expect(first.status).toBe(200);
    const firstData = await first.json() as { data: { session: typeof session; stateToken: string } };
    const afterFirst = firstData.data.session.nodes.find((node) => node.id === current.id)!;
    expect(afterFirst.state).toBe("unknown");
    expect(afterFirst.attempts).toBe(1);

    const second = await verifyRoute(jsonRequest({ stateToken: firstData.data.stateToken, nodeId: current.id, answer: "错误答案", source: "system" }));
    expect(second.status).toBe(200);
    const secondData = await second.json() as { data: { session: typeof session } };
    const afterSecond = secondData.data.session.nodes.find((node) => node.id === current.id)!;
    expect(afterSecond.state).toBe("needs_help");
    expect(secondData.data.session.stage).toBe("needs_help");
  });

  it("同一网络下的监护人同意凭证具有独立限流身份", () => {
    const first = createConsentValue();
    const second = createConsentValue();
    const firstRequest = consentRequest(first);
    const secondRequest = consentRequest(second);
    expect(first).not.toBe(second);
    expect(hasValidConsent(firstRequest)).toBe(true);
    expect(hasValidConsent(secondRequest)).toBe(true);
    expect(consentRateIdentity(firstRequest)).not.toBe(consentRateIdentity(secondRequest));
  });
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/learning/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function consentRequest(value: string): Request {
  return new Request("http://localhost/api/learning/analyze", { headers: { Cookie: `${CONSENT_COOKIE}=${value}` } });
}
