import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createQuestionQuotaStore, questionHash, quotaDay } from "@/lib/learning/question-quota";
import { questionEntryHandler } from "@/lib/learning/http/question-entry";
import { createConsentValue, CONSENT_COOKIE } from "@/lib/learning/server-state";
import { quotaDatabase } from "./helpers/quota-database";

const now = Date.parse("2026-09-24T07:00:00Z");
describe("每日 30 道新题的服务端配额", () => {
  it("30 道允许，第 31 道拒绝；更换服务实例、并发、多标签也不能超额", async () => {
    const { db } = quotaDatabase(); const device = randomUUID();
    const results = await Promise.allSettled(Array.from({ length: 40 }, (_, i) =>
      createQuestionQuotaStore(db).admit(device, randomUUID(), questionHash(`题目${i}`), now)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(30);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429, code: "DAILY_QUESTION_LIMIT" });
    await expect(createQuestionQuotaStore(db).admit(device, randomUUID(), questionHash("31"), now)).rejects.toMatchObject({ code: "DAILY_QUESTION_LIMIT" });
    expect((await createQuestionQuotaStore(db).admit(randomUUID(), randomUUID(), questionHash("other"), now)).used).toBe(1);
  });
  it("重复发送同一入口请求、断线重试、识别到讲解都只计一道，达到上限后旧题照常继续", async () => {
    const fake = quotaDatabase(); const store = createQuestionQuotaStore(fake.db);
    const device = randomUUID(); const entry = randomUUID(); const hash = questionHash("小学语文示例");
    const admitted = await Promise.all(Array.from({ length: 8 }, () => store.admit(device, entry, hash, now)));
    expect(admitted.every(r => r.used === 1)).toBe(true);
    for (let i = 1; i < 30; i++) await store.admit(device, randomUUID(), questionHash(String(i)), now);
    const ticket = admitted[0].entryTicket;
    await store.authorize(ticket, "recognize_text", hash, now);
    await store.authorize(ticket, "full", questionHash("confirmed"), now);
    await store.authorize(ticket, "full", questionHash("confirmed"), now);
    expect((await store.admit(device, entry, hash, now)).used).toBe(30);
    expect(fake.rows.size).toBe(1);
    expect(JSON.stringify([...fake.rows.values()])).not.toContain("小学语文");
  });
  it("按北京时间零点恢复，跨天旧题后续分析不占新一天额度", async () => {
    const store = createQuestionQuotaStore(quotaDatabase().db); const device = randomUUID();
    const before = Date.parse("2026-09-24T15:59:59Z"); const after = before + 1000;
    expect(quotaDay(before)).toBe("2026-09-24"); expect(quotaDay(after)).toBe("2026-09-25");
    const first = await store.admit(device, randomUUID(), questionHash("a"), before);
    const next = await store.admit(device, randomUUID(), questionHash("b"), after);
    expect(next.used).toBe(1);
    await expect(store.authorize(first.entryTicket, "full", questionHash("c"), after)).resolves.toBeUndefined();
  });
  it("不能篡改或复用同一入口凭据给另一道题，不能直接绕过入口调识别", async () => {
    const store = createQuestionQuotaStore(quotaDatabase().db); const device = randomUUID(); const entry = randomUUID();
    const { entryTicket } = await store.admit(device, entry, questionHash("a"), now);
    for (const ticket of [null, "fake", `${entryTicket}tamper`]) await expect(store.authorize(ticket, "recognize", questionHash("a"), now)).rejects.toMatchObject({ status: 403 });
    await expect(store.authorize(entryTicket, "recognize", questionHash("b"), now)).rejects.toMatchObject({ status: 409 });
    await store.authorize(entryTicket, "full", questionHash("first"), now);
    await expect(store.authorize(entryTicket, "full", questionHash("second"), now)).rejects.toMatchObject({ status: 409 });
    await expect(store.admit(device, entry, questionHash("changed"), now)).rejects.toMatchObject({ status: 409 });
    await expect(store.authorize(entryTicket, "full", questionHash("first"), now + 2 * 86400000)).rejects.toMatchObject({ status: 403 });
  });
  it("数据库不可用时禁止新模型消费，不伪装成次数已满，不泄露内部错误", async () => {
    const fake = quotaDatabase(); fake.fail();
    const handler = questionEntryHandler(() => createQuestionQuotaStore(fake.db));
    const response = await handler(request());
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error.code).toBe("QUESTION_QUOTA_UNAVAILABLE");
    expect(payload.error.message).toContain("已打开的题目不受影响");
    expect(JSON.stringify(payload)).not.toContain("private database failure");
  });
  it("未同意、非法输入不创建计数记录", async () => {
    const fake = quotaDatabase(); const handler = questionEntryHandler(() => createQuestionQuotaStore(fake.db));
    expect((await handler(request(false))).status).toBe(403);
    const malformed = request();
    const response = await handler(new Request(malformed.url, { method: "POST", headers: malformed.headers, body: '{"deviceId":"bad","entryId":"bad","inputHash":"bad"}' }));
    expect(response.status).toBe(400); expect(fake.rows.size).toBe(0);
  });
});

function request(consent = true) {
  return new Request("http://localhost/api/learning/question-entry", { method: "POST",
    headers: { Origin: "http://localhost", ...(consent ? { Cookie: `${CONSENT_COOKIE}=${createConsentValue()}` } : {}) },
    body: JSON.stringify({ deviceId: randomUUID(), entryId: randomUUID(), inputHash: questionHash("题目") }),
  });
}
