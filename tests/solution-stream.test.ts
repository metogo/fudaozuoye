import { describe, expect, it } from "vitest";
import { POST as solutionRoute } from "@/app/api/learning/solution/route";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { sealSession } from "@/lib/learning/server-state";

describe("原题答案 SSE", () => {
  it("以 delta 事件输出并以 complete 结束", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const request = new Request("http://localhost/api/learning/solution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stateToken: sealSession(session) }),
    });
    const response = await solutionRoute(request);
    const body = await response.text();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: delta");
    expect(body).toContain("event: complete");
    expect(body).toContain("先求单位量");
  });
});
