import { describe, expect, it, vi } from "vitest";
import { verifyQuestionStatistics } from "../scripts/verify-question-statistics-release.mjs";

describe("统计发布门禁", () => {
  it("真实接口未就绪时阻止前端发布", async () => {
    await expect(verifyQuestionStatistics("https://api.example/api", async () => new Response("", { status: 503 }))).rejects.toThrow("停止前端发布");
    await expect(verifyQuestionStatistics("https://api.example/api", async () => Response.json({ total: "10000" }))).rejects.toThrow("返回无效");
  });
  it("仅查询真实总数，不提交测试题污染统计", async () => {
    const request = vi.fn(async () => Response.json({ total: 10005 }));
    expect(await verifyQuestionStatistics("https://api.example/api/", request)).toBe(10005);
    expect(request).toHaveBeenCalledWith("https://api.example/api/learning/statistics", expect.objectContaining({ cache: "no-store" }));
    expect(request.mock.calls[0]).not.toContainEqual(expect.objectContaining({ method: "POST" }));
  });
});
