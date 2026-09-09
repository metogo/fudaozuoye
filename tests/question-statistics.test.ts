import { describe, expect, it, vi } from "vitest";
import { createQuestionStatisticsStore, type StatisticsDatabase } from "@/lib/learning/question-statistics";
import { statisticsHandlers } from "@/lib/learning/http/question-statistics";
import { CONSENT_COOKIE, createConsentValue } from "@/lib/learning/server-state";

function database(initial: unknown = { baseline: 10000, actualCount: 0, version: 1, metric: "conversation_entry" }) {
  const rows = new Map<string, unknown>([["learning_statistics/question_entries", initial]]);
  let lock = Promise.resolve();
  let failUpdate = false;
  const documents = (data: Map<string, unknown>, transaction: boolean) => ({
    collection: (name: string) => ({ doc: (id: string) => {
      const key = `${name}/${id}`;
      return {
        get: async () => {
          if (transaction && !data.has(key)) throw Object.assign(new Error("Document not found"), { code: "DOCUMENT_NOT_FOUND" });
          return { data: transaction ? { list: [data.get(key)] } : (data.has(key) ? [data.get(key)] : []) };
        },
        set: async (item: object) => { data.set(key, item); return { upsert_id: id }; },
        update: async (item: object) => {
          if (failUpdate) throw new Error("database failure");
          data.set(key, { ...data.get(key) as object, ...item }); return { updated: 1 };
        },
      };
    } }),
  });
  const db: StatisticsDatabase = {
    ...documents(rows, false),
    runTransaction(work) {
      const result = lock.then(async () => {
        const staged = new Map(rows);
        const value = await work(documents(staged, true));
        rows.clear(); staged.forEach((item, key) => rows.set(key, item));
        return value;
      });
      lock = result.then(() => {}, () => {});
      return result;
    },
  };
  return { db, rows, fail: () => { failUpdate = true; } };
}

describe("全站解题统计", () => {
  it("基数与真实新增分开，并发同一提交只加一次，不同题分别计数", async () => {
    const fake = database(); const store = createQuestionStatisticsStore(fake.db);
    expect(await store.total()).toBe(10000);
    const responses = await Promise.all(Array.from({ length: 20 }, () => store.record("same-question")));
    expect(responses.filter(result => result.counted)).toHaveLength(1);
    expect(await store.record("another-question")).toEqual({ counted: true, total: 10002 });
    expect(fake.rows.get("learning_statistics/question_entries")).toMatchObject({ baseline: 10000, actualCount: 2 });
    expect([...fake.rows.keys()].filter(key => key.startsWith("learning_submissions/"))).toHaveLength(2);
    expect(JSON.stringify([...fake.rows.values()])).not.toContain("same-question");
  });
  it("进程重建后仍以数据库去重，不依赖内存计数", async () => {
    const { db } = database(); await createQuestionStatisticsStore(db).record("persisted");
    expect(await createQuestionStatisticsStore(db).record("persisted")).toEqual({ total: 10001, counted: false });
  });
  it("总数更新失败时连同去重记录一起回滚，不能漏计", async () => {
    const fake = database(); fake.fail();
    await expect(createQuestionStatisticsStore(fake.db).record("question")).rejects.toThrow("database failure");
    expect(fake.rows.size).toBe(1); expect(await createQuestionStatisticsStore(fake.db).total()).toBe(10000);
  });
  it.each([null, { baseline: 10000, actualCount: -1 }, { baseline: "10000", actualCount: 0 }])("数据未初始化或损坏不能伪造默认统计 %j", async value => {
    await expect(createQuestionStatisticsStore(database(value).db).total()).rejects.toThrow();
  });
  it("SDK 返回错误对象而非抛出时仍判失败", async () => {
    const fake = database(); fake.db.collection = () => ({ doc: () => ({ get: async () => ({ code: "INVALID_CREDENTIALS", data: { list: [] } }), update: async () => ({}), set: async () => ({}) }) });
    await expect(createQuestionStatisticsStore(fake.db).total()).rejects.toThrow("INVALID_CREDENTIALS");
  });
  it("真实事务响应结构必须是 data.list，不能用普通对象或空列表冒充成功", async () => {
    for (const value of [{ baseline: 10000, actualCount: 0, version: 1, metric: "conversation_entry" }, { list: [] }, null]) {
      const { db } = database();
      db.runTransaction = work => work({ collection: () => ({ doc: () => ({ get: async () => ({ data: value }), set: async () => ({}), update: async () => ({}) }) }) });
      await expect(createQuestionStatisticsStore(db).record("question")).rejects.toThrow("STATISTICS_INVALID_TRANSACTION_DOCUMENT");
    }
  });
  it("读取提交记录时鉴权或网络失败不能当作不存在继续写入", async () => {
    for (const code of ["INVALID_CREDENTIALS", "NETWORK_ERROR"]) {
      const { db } = database(); const write = vi.fn();
      db.runTransaction = work => work({ collection: name => ({ doc: () => ({
        get: async () => {
          if (name === "learning_submissions") throw Object.assign(new Error(code), { code });
          return { data: { list: [{ baseline: 10000, actualCount: 0, version: 1, metric: "conversation_entry" }] } };
        }, set: write, update: write,
      }) }) });
      await expect(createQuestionStatisticsStore(db).record("question")).rejects.toThrow(code);
      expect(write).not.toHaveBeenCalled();
    }
  });
});

describe("统计 API 边界", () => {
  const submissionId = "12345678-1234-4234-8234-123456789012";
  function request(body: unknown, cookie = createConsentValue(), origin = "http://localhost") {
    return new Request("http://localhost/api/learning/statistics", { method: "POST", headers: { Origin: origin, Cookie: `${CONSENT_COOKIE}=${cookie}` }, body: JSON.stringify(body) });
  }
  it("只读接口不要求登录，不暴露明细", async () => {
    const handler = statisticsHandlers(() => createQuestionStatisticsStore(database().db));
    const result = await handler.get(); expect(await result.json()).toEqual({ total: 10000 });
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it("有同意凭据的提交可计数，换凭据重试也不能重复计数", async () => {
    const store = createQuestionStatisticsStore(database().db); const handler = statisticsHandlers(() => store);
    expect(await (await handler.post(request({ submissionId }))).json()).toEqual({ total: 10001, counted: true });
    expect(await (await handler.post(request({ submissionId: submissionId.toUpperCase() }))).json()).toEqual({ total: 10001, counted: false });
  });
  it("拒绝跨站、未同意、额外字段、伪造次数和超大请求", async () => {
    const getStore = vi.fn(); const handler = statisticsHandlers(getStore);
    expect((await handler.post(request({ submissionId }, "bad"))).status).toBe(403);
    expect((await handler.post(request({ submissionId }, createConsentValue(), "https://evil.example"))).status).toBe(403);
    for (const body of [{ submissionId: "x" }, { submissionId, count: 100 }, { submissionId, text: "x".repeat(300) }, null])
      expect((await handler.post(request(body))).status).toBe(400);
    expect(getStore).not.toHaveBeenCalled();
  });
  it("后端不可用返回明确失败，不返回假数字和密钥", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const handler = statisticsHandlers(() => { throw new Error("sensitive value"); });
      for (const response of [await handler.get(), await handler.post(request({ submissionId }))]) {
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: "统计暂不可用" });
      }
      expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive value");
    } finally { log.mockRestore(); }
  });
  it("限制同一个同意身份短时间内批量刷计数", async () => {
    const cookie = createConsentValue(); const handler = statisticsHandlers(() => createQuestionStatisticsStore(database().db));
    let result: Response | undefined;
    for (let n = 0; n < 31; n++) result = await handler.post(request({ submissionId }, cookie));
    expect(result!.status).toBe(429);
  });
});
