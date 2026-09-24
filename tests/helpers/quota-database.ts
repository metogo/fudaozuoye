import type { StatisticsDatabase } from "@/lib/learning/question-statistics";

/** Serial transactions with commit/rollback, matching the deployed SDK response shape. */
export function quotaDatabase() {
  const rows = new Map<string, unknown>();
  let lock = Promise.resolve();
  let unavailable = false;
  const collections = (data: Map<string, unknown>) => ({ collection: (name: string) => ({ doc: (id: string) => ({
    get: async () => {
      if (unavailable) throw new Error("private database failure");
      if (!data.has(`${name}/${id}`)) throw Object.assign(new Error("missing"), { code: "DOCUMENT_NOT_FOUND" });
      return { data: { list: [data.get(`${name}/${id}`)] } };
    },
    set: async (row: object) => { data.set(`${name}/${id}`, structuredClone(row)); return { upsert_id: id }; },
    update: async (row: object) => { data.set(`${name}/${id}`, { ...data.get(`${name}/${id}`) as object, ...structuredClone(row) }); return { updated: 1 }; },
  }) }) });
  const db: StatisticsDatabase = {
    ...collections(rows),
    runTransaction(work) {
      const result = lock.then(async () => {
        const staged = new Map(structuredClone([...rows]));
        const value = await work(collections(staged));
        rows.clear(); staged.forEach((row, id) => rows.set(id, row));
        return value;
      });
      lock = result.then(() => {}, () => {});
      return result;
    },
  };
  return { db, rows, fail: () => { unavailable = true; } };
}
