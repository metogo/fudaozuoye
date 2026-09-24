// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQuestionAdmission, browserQuestionIdentity } from "@/lib/browser/question-admission";

beforeEach(() => { localStorage.clear(); vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
it("刷新页面、换标签、重新同意均复用同一个浏览器标识", () => {
  const first = browserQuestionIdentity();
  expect(browserQuestionIdentity()).toBe(first);
  sessionStorage.clear();
  expect(browserQuestionIdentity()).toBe(first);
});
it("入口请求断线重试复用提交编号；成功后再发同题算新的一道", async () => {
  const fetcher = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ entryTicket: "test" })))
    .mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  const access = createQuestionAdmission(); const signal = new AbortController().signal;
  await expect(access.admit("题目", signal)).rejects.toThrow("offline");
  await access.admit("题目", signal);
  await access.admit("题目", signal);
  const bodies = fetcher.mock.calls.map(call => JSON.parse(String(call[1].body)));
  expect(bodies[0].entryId).toBe(bodies[1].entryId);
  expect(bodies[2].entryId).not.toBe(bodies[1].entryId);
  expect(new Set(bodies.map(body => body.deviceId)).size).toBe(1);
  expect(access.ticket).toBe("test");
});
it("额度已满不取得解题凭据，明确提示恢复时间", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "今天已经开启了 30 道题，明天 0 点恢复。" } }), { status: 429 })));
  const access = createQuestionAdmission();
  await expect(access.admit("题目", new AbortController().signal)).rejects.toThrow("明天 0 点");
  expect(access.ticket).toBe("");
});
it("浏览器禁止保存标识时不能静默换身份、放行新题", () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
  expect(() => browserQuestionIdentity(broken)).toThrow("blocked");
});
it("取消后的迟到响应不能覆盖下一题凭据", async () => {
  let resolveFirst!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveFirst = resolve; }))
    .mockImplementation(async () => Response.json({ entryTicket: "new-ticket" }));
  vi.stubGlobal("fetch", fetcher);
  const access = createQuestionAdmission(); const controller = new AbortController();
  const first = access.admit("第一道题", controller.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  controller.abort();
  await access.admit("第二道题", new AbortController().signal);
  resolveFirst(Response.json({ entryTicket: "stale-ticket" }));
  await rejected;
  expect(access.ticket).toBe("new-ticket");
});
