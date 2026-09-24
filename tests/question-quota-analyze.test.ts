import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { quotaDatabase } from "./helpers/quota-database";
import { createQuestionQuotaStore, questionHash } from "@/lib/learning/question-quota";
import { postAnalyze } from "@/lib/learning/http/analyze";
import { CONSENT_COOKIE, createConsentValue } from "@/lib/learning/server-state";
import * as statistics from "@/lib/learning/question-statistics";
import { getProviderAdapter } from "@/lib/learning/providers";

vi.mock("@/lib/learning/providers", () => ({
  isProviderId: (id: unknown) => id === "doubao",
  getProviderAdapter: vi.fn(() => ({ mode: "live", modelId: "test", recognizeTextProblem: vi.fn(async (text: string) => ({ text })), recognizeProblem: vi.fn(async () => ({ text: "图片题目" })), prepareChatSession: vi.fn() })),
}));
afterEach(() => vi.restoreAllMocks());

it.each(["小学语文：请找出句子中的动词。", "初中英语：Please fill in the blank.", "高中物理：匀速运动的汽车行驶多少米？"])("发题配额与学科学段无关：%s", async text => {
  const store = setup();
  const admitted = await store.admit(randomUUID(), randomUUID(), questionHash(text));
  const response = await postAnalyze(request("recognize_text", text, admitted.entryTicket));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("event: recognized");
  expect(vi.mocked(getProviderAdapter).mock.results.at(-1)!.value.recognizeTextProblem).toHaveBeenCalledOnce();
});

it("未经过入口、凭据篡改、换题复用均在模型调用前拒绝", async () => {
  const store = setup(); const admitted = await store.admit(randomUUID(), randomUUID(), questionHash("第一道题"));
  for (const ticket of [undefined, "fake", admitted.entryTicket]) {
    const response = await postAnalyze(request("recognize_text", "第二道题", ticket));
    expect(response.status).toBe(ticket === admitted.entryTicket ? 409 : 403);
    expect(vi.mocked(getProviderAdapter).mock.results.at(-1)!.value.recognizeTextProblem).not.toHaveBeenCalled();
  }
});

it("拍照、相册、白板的同一图片字节凭据均有效，换图不能冒用", async () => {
  const store = setup(); const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const admitted = await store.admit(randomUUID(), randomUUID(), questionHash(image));
  const form = new FormData(); form.set("provider", "doubao"); form.set("reasoningLevel", "light"); form.set("stage", "recognize"); form.set("entryTicket", admitted.entryTicket);
  form.set("image", new File([image], "q.png", { type: "image/png" }));
  const response = await postAnalyze(new Request("http://localhost/api/learning/analyze", { method: "POST", headers: { Cookie: `${CONSENT_COOKIE}=${createConsentValue()}` }, body: form }));
  expect(response.status).toBe(200); expect(await response.text()).toContain("图片题目");
});

function setup() {
  const fake = quotaDatabase();
  vi.spyOn(statistics, "statisticsDatabase").mockReturnValue(fake.db);
  return createQuestionQuotaStore(fake.db);
}
function request(stage: string, text: string, ticket?: string) {
  const form = new FormData();
  form.set("provider", "doubao"); form.set("reasoningLevel", "light"); form.set("stage", stage); form.set("text", text);
  if (ticket) form.set("entryTicket", ticket);
  return new Request("http://localhost/api/learning/analyze", { method: "POST", headers: { Cookie: `${CONSENT_COOKIE}=${createConsentValue()}` }, body: form });
}
