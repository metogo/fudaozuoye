import { setTimeout as delay } from "node:timers/promises";

/** Code upload completion does not mean all serving instances have switched yet. */
export async function waitForKnowledgeMapBackend(apiBase, fetcher = fetch, pause = delay) {
  const deadline = Date.now() + 60000;
  let consecutive = 0;
  while (Date.now() < deadline) {
    try {
      const response = await fetcher(`${apiBase}/providers?releaseCheck=${Date.now()}`, {
        cache: "no-store", headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(Math.min(5000, deadline - Date.now())),
      });
      if (response.ok && (await response.json()).capabilities?.knowledgeMapStream === 1) consecutive++;
      else consecutive = 0;
      if (consecutive === 2) return;
    } catch { consecutive = 0; /* An unavailable deployment still fails at the fixed deadline below. */ }
    await pause(Math.min(2000, Math.max(0, deadline - Date.now())));
  }
  throw new Error("线上后端未稳定提供逐节点图谱协议，禁止发布前端");
}
