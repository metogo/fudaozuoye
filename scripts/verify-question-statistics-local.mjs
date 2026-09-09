// Real SDK verification. Each run writes only its unique verification counter.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import cloudbase from "@cloudbase/js-sdk";

const require = createRequire(import.meta.url);
const { createQuestionStatisticsStore, QUESTION_COUNTER_ID } = require("../functions/learning-api/dist/lib/learning/question-statistics.js");

async function main() {
  const env = process.env.CLOUDBASE_ENV_ID?.trim();
  const accessKey = process.env.CLOUDBASE_APIKEY?.trim();
  assert(env && accessKey, "缺少本地数据库配置");
  const db = cloudbase.init({ env, accessKey, timeout: 10_000 }).database();
  const testId = `verify_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  assert.notEqual(testId, QUESTION_COUNTER_ID);
  const production = createQuestionStatisticsStore(db);
  const before = await production.total();
  const setup = await db.collection("learning_statistics").doc(testId).set({
    baseline: 10000, actualCount: 0, version: 1, metric: "conversation_entry",
    verificationOnly: true, createdAt: new Date().toISOString(),
  });
  assert(!setup.code, "无法创建隔离测试计数器");
  const store = createQuestionStatisticsStore(db, testId);
  assert.equal(await store.total(), 10000);
  const id = randomUUID();
  const first = await store.record(id);
  assert.deepEqual(first, { total: 10001, counted: true });
  assert.deepEqual(await store.record(id), { total: 10001, counted: false });
  const concurrentId = randomUUID();
  const concurrent = await Promise.all(Array.from({ length: 3 }, () => store.record(concurrentId)));
  assert.equal(concurrent.filter(item => item.counted).length, 1);
  assert.equal(await store.total(), 10002);
  assert.deepEqual(await createQuestionStatisticsStore(db, testId).record(id), { total: 10002, counted: false });

  // Fail after the event is written, before the aggregate is updated. The real
  // SDK must roll back both; retrying the same id must still count it once.
  const rollbackId = randomUUID();
  const failingStore = createQuestionStatisticsStore({
    collection: name => db.collection(name),
    runTransaction: (work, retries) => db.runTransaction(tx => work({
      collection: name => ({ doc: docId => {
        const document = tx.collection(name).doc(docId);
        return {
          get: () => document.get(), set: data => document.set(data),
          update: () => { throw new Error("VERIFICATION_ROLLBACK"); },
        };
      } }),
    }), retries),
  }, testId);
  await assert.rejects(() => failingStore.record(rollbackId), /VERIFICATION_ROLLBACK/);
  assert.equal(await store.total(), 10002);
  assert.deepEqual(await store.record(rollbackId), { total: 10003, counted: true });
  console.log(JSON.stringify({
    passed: true, testCounterId: testId,
    checks: ["真实读取", "新提交加一", "重复去重", "并发首次提交去重", "实例重建去重", "真实事务回滚后重试"],
    testTotal: await store.total(), productionBefore: before, productionAfter: await production.total(),
  }));
}

main().then(() => process.exit(0)).catch(error => {
  // SDK errors can contain credentials or signed URLs. Never print the raw error.
  const code = typeof error?.code === "string" && /^[A-Z_]{3,60}$/.test(error.code) ? error.code : "VERIFICATION_FAILED";
  console.error(JSON.stringify({ passed: false, code }));
  process.exit(1);
});
