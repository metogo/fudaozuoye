import { afterEach, describe, expect, it, vi } from "vitest";
import { postSolution as solutionRoute } from "@/lib/learning/http/solution";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { MockProviderAdapter } from "@/lib/learning/providers/adapter";
import { sealSession } from "@/lib/learning/server-state";
import { describeDetailedSolutionIssues, inspectDetailedSolution, isDetailedSolution } from "@/lib/learning/solution-quality";

describe("原题答案 SSE", () => {
  afterEach(() => vi.restoreAllMocks());

  it("以 delta 事件输出并以 complete 结束", async () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const request = new Request("http://localhost/api/learning/solution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stateToken: sealSession(session) }),
    });
    const response = await solutionRoute(request);
    const body = await response.text();
    const solution = body.split("\n\n").filter((block) => block.includes("event: delta")).map((block) => {
      const raw = block.match(/^data: (.+)$/m)?.[1];
      return raw ? (JSON.parse(raw) as { text: string }).text : "";
    }).join("");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: delta");
    expect(body).toContain("event: complete");
    expect(solution).toContain("### 解题思路");
    expect(solution).toContain("### 分步推导");
    expect(solution).toContain("### 易错提醒");
  });

  it("旧接口也拒绝把短答案当作完整讲解", async () => {
    vi.spyOn(MockProviderAdapter.prototype, "streamSolution").mockImplementation(async (_problem, onDelta) => onDelta("答案是 300。"));
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const response = await solutionRoute(new Request("http://localhost/api/learning/solution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stateToken: sealSession(session) }),
    }));
    const body = await response.text();
    expect(body).toContain("event: error");
    expect(body).not.toContain("event: complete");
  });

  it("多小问题目要求讲解逐项覆盖", () => {
    const problem = "已知条件。1. 求速度；2. 判断方向。";
    const missingSecond = "### 解题思路\n先分析两个要求之间的关系，并从已知条件中选择适用的方法。这里补充足够的背景说明，确保讲解本身不是只有一句结论。\n### 分步推导\n1. 求速度时先写出关系式，再代入题目给出的数值，并检查使用的单位是否统一。\n2. 对第一问的结果进行验算，确认它符合题目情境和数量级。\n### 结论\n第一问已经得到可核验结果。\n### 易错提醒\n还需要处理题目的其余小问，不能在这里只给一个结果。";
    expect(isDetailedSolution(missingSecond, problem)).toBe(false);
  });

  it("允许等价标题，但不降低完整内容要求", () => {
    const solution = "### 思路分析\n先判断已知量与待求量之间的关系，再选择对应公式。这里说明为什么这个公式适用，而不是只给最终数值。\n### 解题步骤\n1. 先写出题目条件对应的关系式，并把待求量单独留在等号一侧。\n2. 再代入题目给出的数值与单位，逐步完成计算，并反向检查结果是否符合题意。\n### 最终答案\n得到与题目条件一致、单位完整的最终结果。\n### 注意事项\n不要漏写单位，也不要跳过决定答案的中间关系；代入前还要检查各个量的单位是否统一。";
    expect(isDetailedSolution(solution, "求一个物理量。")).toBe(true);
  });

  it("接受自然等价标题和中文步骤编号，但仍要求四段完整结构", () => {
    const solution = "**解法分析**\n先整理条件和目标之间的关系，再选择可以直接连接两者的方法。这里解释选择依据，避免只报最终答案。\n\n**解答过程**\n第一步 先写出已知量与待求量的关系，检查每个符号的意义与单位。\n第二步 代入题目条件逐步计算，并把中间结果代回原关系进行核对。\n\n**答案与结论**\n得到的结果满足题目所有条件，单位与数量级也一致。\n\n**验算与提醒**\n不要漏掉决定答案的中间关系，代入前统一单位，结束后再反向检查一次。";
    expect(isDetailedSolution(solution, "求出题目中的未知量。")).toBe(true);
  });

  it("验收失败会给自动重写提供具体缺项，而不是只有笼统错误", () => {
    const inspection = inspectDetailedSolution("答案是 2。", "1+1=?");
    expect(inspection.valid).toBe(false);
    expect(inspection.issues).toContain("missing_derivation");
    expect(describeDetailedSolutionIssues(inspection)).toContain("缺少分步推导");
  });
});
