import { describe, expect, it } from "vitest";
import { createIllustrationReceipt, hasValidIllustrationReceipt } from "@/lib/learning/server-state";

describe("插画请求回执", () => {
  it("只接受同一题目、同一会话且签名未被改动的回执", () => {
    const receipt = createIllustrationReceipt("request-a", "fingerprint-a");
    expect(hasValidIllustrationReceipt(receipt, "request-a", "fingerprint-a")).toBe(true);
    expect(hasValidIllustrationReceipt(receipt, "request-b", "fingerprint-a")).toBe(false);
    expect(hasValidIllustrationReceipt(receipt, "request-a", "fingerprint-b")).toBe(false);
    expect(hasValidIllustrationReceipt("illustration-v1.bad.request-a.fingerprint-a.sig", "request-a", "fingerprint-a")).toBe(false);
    expect(hasValidIllustrationReceipt(`${receipt}x`, "request-a", "fingerprint-a")).toBe(false);
    expect(hasValidIllustrationReceipt(null, "request-a", "fingerprint-a")).toBe(false);
  });
});
