/** Shared by the model scheduler, server stream and browser watchdog. */
export const MAP_NODE_CONCURRENCY = 2;
export const MAP_NODE_TIMEOUT_MS = 30000;
export const MAP_PLAN_TIMEOUT_MS = 45000;
// Leave 10 seconds for a clean error response before the configured 180s function limit.
const TOTAL_TIMEOUT_MS = 170000;

export function createMapDeadline(transportGraceMs = 0) {
  const controller = new AbortController();
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout>;
  const arm = (milliseconds: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new DOMException("图谱生成超时", "TimeoutError")), Math.max(0, milliseconds) + transportGraceMs);
  };
  arm(MAP_PLAN_TIMEOUT_MS);
  return {
    signal: controller.signal,
    planned(total: number) {
      if (!Number.isInteger(total) || total < 2 || total > 16) throw new Error("知识清单数量不合法");
      const remaining = Math.ceil((total - 1) / MAP_NODE_CONCURRENCY) * MAP_NODE_TIMEOUT_MS + 5000;
      arm(Math.min(remaining, TOTAL_TIMEOUT_MS - (Date.now() - started)));
    },
    clear() { clearTimeout(timer); },
  };
}
