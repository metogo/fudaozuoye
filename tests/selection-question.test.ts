import { describe, expect, it } from "vitest";
import { parseTurnRequest } from "@/lib/learning/http/turn-request";

function request(quote: unknown) {
  return new Request("http://localhost/api/learning/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken: "token", input: { type: "question", text: "为什么？", quote } }) });
}
describe("选中文字提问协议", () => {
  it.each(["根", "有两个实数根", "第一段\n第二段：x²-6x+k=0", "长段落".repeat(1000)])("保留不同长度的用户选区 %s", async (quote) => {
    const result = await parseTurnRequest(request(quote), false);
    expect(result.input).toEqual({ type: "question", text: "为什么？", quote });
  });
  it.each(["", 123, "字".repeat(12001)])("拒绝无效或超长引用而不静默截断", async (quote) => {
    await expect(parseTurnRequest(request(quote), false)).rejects.toThrow();
  });
  it("普通提问无需引用", async () => {
    expect((await parseTurnRequest(request(undefined), false)).input).toEqual({ type: "question", text: "为什么？" });
  });
});
