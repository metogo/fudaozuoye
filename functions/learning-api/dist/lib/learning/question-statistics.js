"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUESTION_COUNTER_ID = exports.SUBMISSIONS_COLLECTION = exports.STATISTICS_COLLECTION = void 0;
exports.createQuestionStatisticsStore = createQuestionStatisticsStore;
exports.questionStatisticsStore = questionStatisticsStore;
const node_crypto_1 = require("node:crypto");
const js_sdk_1 = __importDefault(require("@cloudbase/js-sdk"));
exports.STATISTICS_COLLECTION = "learning_statistics";
exports.SUBMISSIONS_COLLECTION = "learning_submissions";
exports.QUESTION_COUNTER_ID = "question_entries";
function checked(result) {
    if (result.code)
        throw new Error(`STATISTICS_DATABASE_${result.code}`);
    return result.data;
}
async function transactionDocument(document, optional = false) {
    let data;
    try {
        data = checked(await document.get());
    }
    catch (error) {
        if (optional && error && typeof error === "object" && "code" in error && error.code === "DOCUMENT_NOT_FOUND")
            return null;
        throw error;
    }
    if (!data || typeof data !== "object" || !("list" in data) || !Array.isArray(data.list) || data.list.length !== 1)
        throw new Error("STATISTICS_INVALID_TRANSACTION_DOCUMENT");
    return data.list[0];
}
function counter(value) {
    if (!value || typeof value !== "object")
        throw new Error("STATISTICS_NOT_INITIALIZED");
    const item = value;
    const { baseline, actualCount } = item;
    if (item.version !== 1 || item.metric !== "conversation_entry" ||
        typeof baseline !== "number" || !Number.isSafeInteger(baseline) || baseline < 0 ||
        typeof actualCount !== "number" || !Number.isSafeInteger(actualCount) || actualCount < 0 ||
        !Number.isSafeInteger(baseline + actualCount + 1))
        throw new Error("STATISTICS_INVALID_COUNTER");
    return { baseline, actualCount, total: baseline + actualCount };
}
function createQuestionStatisticsStore(db, counterId = exports.QUESTION_COUNTER_ID) {
    return {
        async total() {
            const data = checked(await db.collection(exports.STATISTICS_COLLECTION).doc(counterId).get());
            if (!Array.isArray(data) || data.length !== 1)
                throw new Error("STATISTICS_NOT_INITIALIZED");
            return counter(data[0]).total;
        },
        record(submissionId) {
            const eventId = (0, node_crypto_1.createHash)("sha256").update(`${counterId}:${submissionId}`).digest("hex");
            return db.runTransaction(async (transaction) => {
                const aggregate = transaction.collection(exports.STATISTICS_COLLECTION).doc(counterId);
                const event = transaction.collection(exports.SUBMISSIONS_COLLECTION).doc(eventId);
                const current = counter(await transactionDocument(aggregate));
                const existing = await transactionDocument(event, true);
                if (existing !== null) {
                    if (!existing || typeof existing !== "object" || existing.counterId !== counterId)
                        throw new Error("STATISTICS_INVALID_SUBMISSION");
                    return { total: current.total, counted: false };
                }
                const inserted = await event.set({ counterId, createdAt: new Date().toISOString() });
                checked(inserted);
                if (inserted.upsert_id !== eventId)
                    throw new Error("STATISTICS_SUBMISSION_INSERT_FAILED");
                const result = await aggregate.update({ actualCount: current.actualCount + 1 });
                checked(result);
                if (result.updated !== 1)
                    throw new Error("STATISTICS_COUNTER_UPDATE_FAILED");
                return { total: current.total + 1, counted: true };
            }, 5);
        },
    };
}
let store;
function questionStatisticsStore() {
    if (store)
        return store;
    const env = process.env.CLOUDBASE_ENV_ID?.trim();
    const accessKey = process.env.CLOUDBASE_APIKEY?.trim();
    if (!env || !accessKey)
        throw new Error("STATISTICS_CONFIGURATION_MISSING");
    const app = js_sdk_1.default.init({ env, accessKey, region: "ap-shanghai", timeout: 5_000 });
    const db = app.database();
    if (!db || typeof db !== "object" || !("runTransaction" in db) || typeof db.runTransaction !== "function" ||
        !("collection" in db) || typeof db.collection !== "function")
        throw new Error("STATISTICS_TRANSACTIONS_UNSUPPORTED");
    store = createQuestionStatisticsStore(db);
    return store;
}
