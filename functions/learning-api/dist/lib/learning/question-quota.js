"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAILY_QUESTION_MESSAGE = exports.DAILY_QUESTION_LIMIT = void 0;
exports.quotaDay = quotaDay;
exports.questionHash = questionHash;
exports.createQuestionQuotaStore = createQuestionQuotaStore;
exports.questionQuotaStore = questionQuotaStore;
exports.authorizeQuestionEntry = authorizeQuestionEntry;
const node_crypto_1 = require("node:crypto");
const errors_1 = require("./errors");
const question_statistics_1 = require("./question-statistics");
exports.DAILY_QUESTION_LIMIT = 30;
exports.DAILY_QUESTION_MESSAGE = "今天已经开启了 30 道题。先把学过的题消化一下吧，明天北京时间 0 点后，小逗号继续陪你学。当前题目仍可继续追问和查看讲解。";
const DAY_MS = 86_400_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
function quotaDay(now = Date.now()) {
    return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
}
function questionHash(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function signingKey() {
    const key = process.env.SESSION_STATE_SECRET?.trim();
    if (!key)
        throw new Error("QUESTION_QUOTA_SECRET_MISSING");
    return key;
}
function sign(ticket) {
    const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
    return `${body}.${(0, node_crypto_1.createHmac)("sha256", signingKey()).update(`question-entry-v1:${body}`).digest("base64url")}`;
}
function openTicket(raw, now) {
    const invalid = () => new errors_1.ServiceError("发题页面已更新或凭据已失效，请刷新页面后重新发题。已打开的题目仍可继续学习。", 403, "QUESTION_ENTRY_INVALID");
    if (typeof raw !== "string" || raw.length > 1200)
        throw invalid();
    const [body, signature, extra] = raw.split(".");
    if (!body || !signature || extra !== undefined)
        throw invalid();
    const expected = (0, node_crypto_1.createHmac)("sha256", signingKey()).update(`question-entry-v1:${body}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !(0, node_crypto_1.timingSafeEqual)(actual, expected))
        throw invalid();
    let ticket;
    try {
        ticket = JSON.parse(Buffer.from(body, "base64url").toString());
    }
    catch {
        throw invalid();
    }
    if (!ticket || !UUID.test(ticket.deviceId) || !UUID.test(ticket.entryId) || !HASH.test(ticket.inputHash) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(ticket.day) || !Number.isFinite(ticket.expires) || ticket.expires <= now)
        throw invalid();
    return ticket;
}
function validateEntries(data, day) {
    if (!data || typeof data !== "object" || !("list" in data) || !Array.isArray(data.list) || data.list.length !== 1)
        throw new Error("QUESTION_QUOTA_INVALID_DOCUMENT");
    const row = data.list[0];
    if (!row || row.day !== day || row.metric !== "daily_question_entries" || !Array.isArray(row.entries) || row.entries.length > exports.DAILY_QUESTION_LIMIT ||
        !row.entries.every((e) => e && UUID.test(e.id) && HASH.test(e.inputHash) && (e.fullHash === undefined || HASH.test(e.fullHash))) ||
        new Set(row.entries.map((e) => e.id)).size !== row.entries.length)
        throw new Error("QUESTION_QUOTA_INVALID_DOCUMENT");
    return row.entries;
}
function createQuestionQuotaStore(db) {
    const docId = (deviceId, day) => `quota_${questionHash(`${deviceId}:${day}`)}`;
    return {
        async admit(deviceId, entryId, inputHash, now = Date.now()) {
            if (!UUID.test(deviceId) || !UUID.test(entryId) || !HASH.test(inputHash))
                throw new errors_1.ServiceError("发题信息不完整，请重试。", 400, "QUESTION_ENTRY_INVALID");
            deviceId = deviceId.toLowerCase();
            entryId = entryId.toLowerCase();
            const day = quotaDay(now);
            // Validate signing configuration before reserving any quota.
            const entryTicket = sign({ deviceId, entryId, inputHash, day, expires: now + 2 * DAY_MS });
            const used = await db.runTransaction(async (transaction) => {
                const document = transaction.collection(question_statistics_1.STATISTICS_COLLECTION).doc(docId(deviceId, day));
                let entries;
                let exists = true;
                try {
                    const result = await document.get();
                    if (result.code)
                        throw new Error("QUESTION_QUOTA_READ_FAILED");
                    entries = validateEntries(result.data, day);
                }
                catch (error) {
                    if (!(error && typeof error === "object" && "code" in error && error.code === "DOCUMENT_NOT_FOUND"))
                        throw error;
                    entries = [];
                    exists = false;
                }
                const previous = entries.find(entry => entry.id === entryId);
                if (previous) {
                    if (previous.inputHash !== inputHash)
                        throw new errors_1.ServiceError("题目已变化，请重新发题。", 409, "QUESTION_ENTRY_CHANGED");
                    return entries.length;
                }
                if (entries.length >= exports.DAILY_QUESTION_LIMIT)
                    throw new errors_1.ServiceError(exports.DAILY_QUESTION_MESSAGE, 429, "DAILY_QUESTION_LIMIT");
                const next = [...entries, { id: entryId, inputHash }];
                const row = { metric: "daily_question_entries", day, entries: next, expiresAt: new Date(now + 3 * DAY_MS).toISOString() };
                const result = exists ? await document.update(row) : await document.set(row);
                if (result.code || (exists ? result.updated !== 1 : result.upsert_id !== docId(deviceId, day)))
                    throw new Error("QUESTION_QUOTA_WRITE_FAILED");
                return next.length;
            }, 5);
            return { entryTicket, used, limit: exports.DAILY_QUESTION_LIMIT, day };
        },
        async authorize(raw, stage, hash, now = Date.now()) {
            const ticket = openTicket(raw, now);
            if (stage !== "full") {
                if (ticket.inputHash !== hash)
                    throw new errors_1.ServiceError("题目已变化，请重新发题。", 409, "QUESTION_ENTRY_CHANGED");
                return;
            }
            // One admission may prepare only one confirmed question, not arbitrary new questions.
            await db.runTransaction(async (transaction) => {
                const document = transaction.collection(question_statistics_1.STATISTICS_COLLECTION).doc(docId(ticket.deviceId, ticket.day));
                const result = await document.get();
                if (result.code)
                    throw new Error("QUESTION_QUOTA_READ_FAILED");
                const entries = validateEntries(result.data, ticket.day);
                const entry = entries.find(item => item.id === ticket.entryId && item.inputHash === ticket.inputHash);
                if (!entry)
                    throw new errors_1.ServiceError("本次发题记录已失效，请重新发题。", 403, "QUESTION_ENTRY_INVALID");
                if (entry.fullHash === hash)
                    return;
                if (entry.fullHash)
                    throw new errors_1.ServiceError("题目已变化，请重新发题。", 409, "QUESTION_ENTRY_CHANGED");
                const update = await document.update({ entries: entries.map(item => item === entry ? { ...item, fullHash: hash } : item) });
                if (update.code || update.updated !== 1)
                    throw new Error("QUESTION_QUOTA_WRITE_FAILED");
            }, 5);
        },
    };
}
function questionQuotaStore() { return createQuestionQuotaStore((0, question_statistics_1.statisticsDatabase)()); }
async function authorizeQuestionEntry(form, stage, value) {
    try {
        await questionQuotaStore().authorize(form.get("entryTicket"), stage, questionHash(value));
    }
    catch (error) {
        if (error instanceof errors_1.ServiceError)
            throw error;
        throw new errors_1.ServiceError("暂时无法核对今日解题次数，请稍后重试。已打开的题目不受影响。", 503, "QUESTION_QUOTA_UNAVAILABLE", true);
    }
}
