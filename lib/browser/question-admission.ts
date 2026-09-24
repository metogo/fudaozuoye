import { learningApiUrl } from "@/lib/learning/api-url";

const DEVICE_KEY = "learning-browser-id-v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function browserQuestionIdentity(storage: Storage = localStorage): string {
  const previous = storage.getItem(DEVICE_KEY);
  if (previous && UUID.test(previous)) return previous;
  const id = crypto.randomUUID();
  storage.setItem(DEVICE_KEY, id);
  if (storage.getItem(DEVICE_KEY) !== id) throw new Error("请允许浏览器保存必要的网站数据后再发题。");
  return id;
}

export function createQuestionAdmission() {
  let pending: { inputHash: string; entryId: string } | null = null;
  let activeTicket = "";
  return {
    get ticket() { return activeTicket; },
    async admit(input: string | Blob, signal: AbortSignal) {
      const bytes = typeof input === "string" ? new TextEncoder().encode(input.trim()) : await input.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      signal.throwIfAborted();
      const inputHash = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      if (pending?.inputHash !== inputHash) pending = { inputHash, entryId: crypto.randomUUID() };
      const attempt = pending;
      let deviceId: string;
      try {
        deviceId = navigator.locks
          ? await navigator.locks.request("learning-browser-identity", () => browserQuestionIdentity())
          : browserQuestionIdentity();
      } catch { throw new Error("请允许浏览器保存必要的网站数据后再发题。当前题目仍可继续学习。"); }
      signal.throwIfAborted();
      const response = await fetch(learningApiUrl("/learning/question-entry"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, ...attempt }), signal,
      });
      const result = await response.json() as { entryTicket?: string; error?: { message?: string } };
      signal.throwIfAborted();
      if (!response.ok) throw new Error(result.error?.message || "暂时无法核对今日解题次数，请稍后重试。");
      if (!result.entryTicket) throw new Error("发题凭据未准备好，请重试。");
      activeTicket = result.entryTicket;
      if (pending === attempt) pending = null;
    },
  };
}
