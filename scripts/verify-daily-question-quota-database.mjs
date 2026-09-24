// Real database transactions; fresh synthetic browser identity, no model calls or global counter writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const { questionQuotaStore, questionHash } = require("../functions/learning-api/dist/lib/learning/question-quota.js");

try {
  const store = questionQuotaStore(); const device = randomUUID(); const entry = randomUUID();
  const hash = questionHash("isolated quota verification");
  const first = await store.admit(device, entry, hash);
  assert.equal(first.used, 1);
  const duplicate = await Promise.all(Array.from({ length: 3 }, () => questionQuotaStore().admit(device, entry, hash)));
  assert(duplicate.every(result => result.used === 1));
  for (let i = 1; i < 29; i++) assert.equal((await store.admit(device, randomUUID(), questionHash(String(i)))).used, i + 1);
  const boundary = await Promise.allSettled(Array.from({ length: 3 }, () => questionQuotaStore().admit(device, randomUUID(), hash)));
  assert.equal(boundary.filter(result => result.status === "fulfilled").length, 1);
  for (const result of boundary) if (result.status === "rejected") assert.equal(result.reason.code, "DAILY_QUESTION_LIMIT");
  assert.equal((await store.admit(device, entry, hash)).used, 30);
  await store.authorize(first.entryTicket, "recognize_text", hash);
  await store.authorize(first.entryTicket, "full", hash);
  await questionQuotaStore().authorize(first.entryTicket, "full", hash);
  await assert.rejects(() => store.authorize(first.entryTicket, "full", questionHash("different")), { code: "QUESTION_ENTRY_CHANGED" });
  console.log(JSON.stringify({ passed: true, checks: ["真实云数据库创建", "并发重试去重", "跨实例计数", "29到30并发边界", "31拒绝", "上限后同题分析与重试", "换题复用拒绝"], modelCalls: 0, globalCounterWrites: 0, retainedTestDocuments: 1 }));
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({ passed: false, code: typeof error?.code === "string" && /^[A-Z_]{3,60}$/.test(error.code) ? error.code : "VERIFICATION_FAILED" }));
  process.exit(1);
}
