"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUESTION_STATISTICS_CHANGED = exports.QUESTION_ENTRY_QUEUE_KEY = void 0;
exports.statisticsUrl = statisticsUrl;
exports.readQuestionTotal = readQuestionTotal;
exports.createQuestionEntryReporter = createQuestionEntryReporter;
exports.QUESTION_ENTRY_QUEUE_KEY = "education-question-entries-v1";
exports.QUESTION_STATISTICS_CHANGED = "question-statistics-changed";
function statisticsUrl() {
    return `${process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api"}/learning/statistics`;
}
async function readQuestionTotal(signal) {
    const response = await fetch(statisticsUrl(), { cache: "no-store", signal });
    if (!response.ok)
        throw new Error("统计暂不可用");
    const data = await response.json();
    if (typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total < 0)
        throw new Error("统计结果无效");
    return data.total;
}
function createQuestionEntryReporter({ storage, send, warn }) {
    const pending = new Set();
    let loaded = false;
    let active = false;
    let running = false;
    let retry = 0;
    let nextAttempt = 0;
    const maxFailures = 3;
    let timer;
    const save = () => {
        try {
            storage().setItem(exports.QUESTION_ENTRY_QUEUE_KEY, JSON.stringify([...pending]));
        }
        catch {
            warn();
        }
    };
    const load = () => {
        if (loaded)
            return;
        loaded = true;
        try {
            const raw = storage().getItem(exports.QUESTION_ENTRY_QUEUE_KEY);
            if (!raw)
                return;
            const saved = JSON.parse(raw);
            if (!Array.isArray(saved) || saved.length > 1000 || saved.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)))
                throw new Error("invalid statistics queue");
            saved.forEach(id => pending.add(id));
        }
        catch {
            warn();
        }
    };
    const flush = async () => {
        if (!active || running || !pending.size || retry >= maxFailures)
            return;
        if (Date.now() < nextAttempt) {
            clearTimeout(timer);
            timer = setTimeout(() => void flush(), nextAttempt - Date.now());
            return;
        }
        running = true;
        clearTimeout(timer);
        try {
            for (const id of pending) {
                if (!active)
                    break;
                await send(id);
                pending.delete(id);
                save();
            }
            retry = 0;
            nextAttempt = 0;
        }
        catch {
            if (retry === 0)
                warn();
            retry += 1;
            nextAttempt = Date.now() + (retry >= maxFailures ? 60_000 : 2_000 * 2 ** retry);
        }
        finally {
            running = false;
            if (active && pending.size && retry < maxFailures)
                timer = setTimeout(() => void flush(), Math.max(0, nextAttempt - Date.now()));
        }
    };
    return {
        start() { load(); active = true; void flush(); },
        stop() { active = false; clearTimeout(timer); },
        resume() { if (Date.now() < nextAttempt)
            return; retry = 0; void flush(); },
        enqueue() {
            load();
            try {
                pending.add(crypto.randomUUID());
                save();
                void flush();
            }
            catch {
                warn();
            }
        },
    };
}
