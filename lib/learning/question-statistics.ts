import { createHash } from "node:crypto";
import cloudbase from "@cloudbase/js-sdk";

export const STATISTICS_COLLECTION = "learning_statistics";
export const SUBMISSIONS_COLLECTION = "learning_submissions";
export const QUESTION_COUNTER_ID = "question_entries";

type DbResult = { code?: string; data?: unknown; updated?: number; upsert_id?: string };
type Document = { get(): Promise<DbResult>; update(data: object): Promise<DbResult>; set(data: object): Promise<DbResult> };
type Transaction = { collection(name: string): { doc(id: string): Document } };
// Verified against js-sdk 3.8.2: ordinary reads return data[], transaction reads
// return data.list[]. Missing transaction documents throw DOCUMENT_NOT_FOUND.
export interface StatisticsDatabase extends Transaction {
  runTransaction<T>(work: (transaction: Transaction) => Promise<T>, retries?: number): Promise<T>;
}

export interface QuestionStatisticsStore {
  total(): Promise<number>;
  record(submissionId: string): Promise<{ total: number; counted: boolean }>;
}

function checked(result: DbResult): unknown {
  if (result.code) throw new Error(`STATISTICS_DATABASE_${result.code}`);
  return result.data;
}

async function transactionDocument(document: Document, optional = false): Promise<unknown> {
  let data: unknown;
  try { data = checked(await document.get()); }
  catch (error) {
    if (optional && error && typeof error === "object" && "code" in error && error.code === "DOCUMENT_NOT_FOUND") return null;
    throw error;
  }
  if (!data || typeof data !== "object" || !("list" in data) || !Array.isArray(data.list) || data.list.length !== 1)
    throw new Error("STATISTICS_INVALID_TRANSACTION_DOCUMENT");
  return data.list[0];
}

function counter(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("STATISTICS_NOT_INITIALIZED");
  const item = value as Record<string, unknown>;
  const { baseline, actualCount } = item;
  if (item.version !== 1 || item.metric !== "conversation_entry" ||
      typeof baseline !== "number" || !Number.isSafeInteger(baseline) || baseline < 0 ||
      typeof actualCount !== "number" || !Number.isSafeInteger(actualCount) || actualCount < 0 ||
      !Number.isSafeInteger(baseline + actualCount + 1)) throw new Error("STATISTICS_INVALID_COUNTER");
  return { baseline, actualCount, total: baseline + actualCount };
}

export function createQuestionStatisticsStore(db: StatisticsDatabase, counterId = QUESTION_COUNTER_ID): QuestionStatisticsStore {
  return {
    async total() {
      const data = checked(await db.collection(STATISTICS_COLLECTION).doc(counterId).get());
      if (!Array.isArray(data) || data.length !== 1) throw new Error("STATISTICS_NOT_INITIALIZED");
      return counter(data[0]).total;
    },
    record(submissionId) {
      const eventId = createHash("sha256").update(`${counterId}:${submissionId}`).digest("hex");
      return db.runTransaction(async transaction => {
        const aggregate = transaction.collection(STATISTICS_COLLECTION).doc(counterId);
        const event = transaction.collection(SUBMISSIONS_COLLECTION).doc(eventId);
        const current = counter(await transactionDocument(aggregate));
        const existing = await transactionDocument(event, true);
        if (existing !== null) {
          if (!existing || typeof existing !== "object" || (existing as Record<string, unknown>).counterId !== counterId)
            throw new Error("STATISTICS_INVALID_SUBMISSION");
          return { total: current.total, counted: false };
        }
        const inserted = await event.set({ counterId, createdAt: new Date().toISOString() });
        checked(inserted);
        if (inserted.upsert_id !== eventId) throw new Error("STATISTICS_SUBMISSION_INSERT_FAILED");
        const result = await aggregate.update({ actualCount: current.actualCount + 1 });
        checked(result);
        if (result.updated !== 1) throw new Error("STATISTICS_COUNTER_UPDATE_FAILED");
        return { total: current.total + 1, counted: true };
      }, 5);
    },
  };
}

let store: QuestionStatisticsStore | undefined;
export function questionStatisticsStore(): QuestionStatisticsStore {
  if (store) return store;
  const env = process.env.CLOUDBASE_ENV_ID?.trim();
  const accessKey = process.env.CLOUDBASE_APIKEY?.trim();
  if (!env || !accessKey) throw new Error("STATISTICS_CONFIGURATION_MISSING");
  const app = cloudbase.init({ env, accessKey, region: "ap-shanghai", timeout: 5_000 });
  const db: unknown = app.database();
  if (!db || typeof db !== "object" || !("runTransaction" in db) || typeof db.runTransaction !== "function" ||
      !("collection" in db) || typeof db.collection !== "function") throw new Error("STATISTICS_TRANSACTIONS_UNSUPPORTED");
  store = createQuestionStatisticsStore(db as StatisticsDatabase);
  return store;
}
