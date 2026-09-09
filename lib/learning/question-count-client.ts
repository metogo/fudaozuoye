export const QUESTION_ENTRY_QUEUE_KEY = "education-question-entries-v1";
export const QUESTION_STATISTICS_CHANGED = "question-statistics-changed";

export function statisticsUrl() {
  return `${process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api"}/learning/statistics`;
}

export async function readQuestionTotal(signal?: AbortSignal): Promise<number> {
  const response = await fetch(statisticsUrl(), { cache: "no-store", signal });
  if (!response.ok) throw new Error("统计暂不可用");
  const data = await response.json() as { total?: unknown };
  if (typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error("统计结果无效");
  return data.total;
}

type ReporterOptions = {
  storage: () => Pick<Storage, "getItem" | "setItem">;
  send: (submissionId: string) => Promise<void>;
  warn: () => void;
};

export function createQuestionEntryReporter({ storage, send, warn }: ReporterOptions) {
  const pending = new Set<string>();
  let loaded = false;
  let active = false;
  let running = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    try { storage().setItem(QUESTION_ENTRY_QUEUE_KEY, JSON.stringify([...pending])); }
    catch { warn(); }
  };
  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = storage().getItem(QUESTION_ENTRY_QUEUE_KEY);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length > 1000 || saved.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("invalid statistics queue");
      saved.forEach(id => pending.add(id));
    } catch { warn(); }
  };
  const flush = async () => {
    if (!active || running || !pending.size) return;
    running = true;
    clearTimeout(timer);
    try {
      for (const id of pending) {
        if (!active) break;
        await send(id);
        pending.delete(id);
        save();
      }
      retry = 0;
    } catch {
      warn();
      retry += 1;
    } finally {
      running = false;
      if (active && pending.size) timer = setTimeout(() => void flush(), Math.min(60_000, 2_000 * 2 ** Math.min(retry, 5)));
    }
  };
  return {
    start() { load(); active = true; void flush(); },
    stop() { active = false; clearTimeout(timer); },
    resume() { retry = 0; void flush(); },
    enqueue() {
      load();
      try { pending.add(crypto.randomUUID()); save(); void flush(); }
      catch { warn(); }
    },
  };
}
