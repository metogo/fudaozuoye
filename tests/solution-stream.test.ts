import { afterEach, describe, expect, it, vi } from "vitest";
import { postSolution as solutionRoute } from "@/lib/learning/http/solution";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { MockProviderAdapter } from "@/lib/learning/providers/adapter";
import { sealSession } from "@/lib/learning/server-state";
import { describeDetailedSolutionIssues, inspectDetailedSolution, isDetailedSolution } from "@/lib/learning/solution-quality";

function completeSingleQuestionSolution(extraDerivation = "") {
  return `### 解题思路
先整理题目给出的条件和最终要解决的问题，再选择能够直接连接已知量与未知量的方法。这里说明方法为什么适用，避免只写答案。
### 分步推导
1. 把题目中的有效条件写成清楚的数量关系，并检查单位和对象是否一致。
2. 按照数量关系逐步计算，再把结果代回题目条件进行核对。${extraDerivation}
### 结论
已经得到符合全部题目条件的结果，并完成单位与数量级检查。
### 易错提醒
不要把题号或已知条件的序号当成独立小问，也不要漏掉决定结果的关键关系。`;
}

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

  it.each([
    "6. 如图，一块正方形草地两侧铺了石子路，求整块长方形地的周长。",
    "1. 一辆汽车行驶120千米用了2小时，求平均速度。",
  ])("单独整题题号不触发小问覆盖验收：%s", (problem) => {
    const inspection = inspectDetailedSolution(completeSingleQuestionSolution(), problem);

    expect(inspection.missingSubQuestions).toEqual([]);
    expect(inspection.valid).toBe(true);
  });

  it("外层题号加内层小问时只验收内部小问", () => {
    const problem = "6. 已知三角形ABC满足题设条件。（1）求边AB的长度；（2）说明三角形ABC为什么是直角三角形。";
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n（1）第一问先根据已知关系求出边AB，并代回原式检查。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
    expect(describeDetailedSolutionIssues(inspection)).toContain("第 2 问");
    expect(describeDetailedSolutionIssues(inspection)).not.toContain("第 6 问");
  });

  it("外层题号加裸编号小问时只验收内部连续序列", () => {
    const problem = "6. 已知三角形ABC满足题设条件。1. 求边AB的长度；2. 说明它为什么是直角三角形。";
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n第1问：先根据已知关系求出边AB，并代回原式检查。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
  });

  it("外层题号为1且引出裸编号小问时仍识别内部序列", () => {
    const problem = "1. 求下列各题：1. 速度；2. 方向。";
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n第1问：先求出速度。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
  });

  it("编号条件清单不被识别为多个小问", () => {
    const problem = "6. 已知长方形的条件：\n1. 长为15米；\n2. 宽为12米。\n问这个长方形的周长是多少？";
    const inspection = inspectDetailedSolution(completeSingleQuestionSolution(), problem);

    expect(inspection.missingSubQuestions).toEqual([]);
    expect(inspection.valid).toBe(true);
  });

  it("括号编号的已知条件清单不被识别为多个小问", () => {
    const problem = "已知下列条件：（1）长为15米；（2）宽为12米。问周长。";
    const inspection = inspectDetailedSolution(completeSingleQuestionSolution(), problem);

    expect(inspection.missingSubQuestions).toEqual([]);
    expect(inspection.valid).toBe(true);
  });

  it.each([
    "第1问：求物体的速度。第2问：判断物体的运动方向。",
    "问题1：计算电路中的电流。问题2：说明电流变化的原因。",
  ])("显式多问仍要求逐项覆盖：%s", (problem) => {
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n第1问：先根据题目条件完成计算并核对结果。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
    expect(inspection.issues).toContain("missing_sub_questions");
  });

  it("回指前一问不会被当成新的小问编号", () => {
    const problem = "第1问：证明等式成立。第2问：利用第1问的结论计算目标值。";
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n第1问：先根据条件完成证明。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
  });

  it("显式小问与括号小问混排时仍按同一组验收", () => {
    const problem = "第1问：求长方形的长。（2）再说明周长的计算方法。";
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n第1问：先求出长方形的长。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
  });

  it("第二问回指第一问时不把引用编号重复计入结构", () => {
    const problem = "第1问：求出x。第2问：利用上述第1问的结果，说明y的取值。";
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n第1问：先求出x。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
  });

  it("显式或括号小问即使使用名词短语也保持严格验收", () => {
    for (const problem of ["第1问：速度；第2问：方向。", "（1）速度；（2）方向。"]) {
      const inspection = inspectDetailedSolution(
        completeSingleQuestionSolution("\n第1问：先求出速度。"),
        problem,
      );

      expect(inspection.missingSubQuestions).toEqual(["2"]);
    }
  });

  it("方程编号不会被当成小问编号", () => {
    const problem = "由方程（1）求出x，再由方程（2）求出y，最后求x与y的和。";
    const inspection = inspectDetailedSolution(completeSingleQuestionSolution(), problem);

    expect(inspection.missingSubQuestions).toEqual([]);
    expect(inspection.valid).toBe(true);
  });

  it.each([
    "可选项为：（1）甲；（2）乙。请选择正确选项。",
    "由x+y=3（1），x-y=1（2），求x与y。",
  ])("选项或公式编号不被当成多个小问：%s", (problem) => {
    const inspection = inspectDetailedSolution(completeSingleQuestionSolution(), problem);

    expect(inspection.missingSubQuestions).toEqual([]);
    expect(inspection.valid).toBe(true);
  });

  it("常见任务动词仍能触发多小问验收", () => {
    const problem = "（1）化简代数式；（2）解方程并验证结果。";
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n第1问：完成代数式化简并检查定义域。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
  });

  it("跨学科表述任务仍能触发裸编号多问验收", () => {
    const problem = "1. 简述光合作用的意义；2. 阐述呼吸作用的过程。";
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n第1问：说明光合作用的意义。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
  });

  it.each([
    "解答下列各小题：1. 求物体的速度；2. 并说明运动方向。",
    "解答下列各小题：（一）求物体的速度；（二）说明运动方向。",
  ])("题组引导语和中文编号能够识别：%s", (problem) => {
    const inspection = inspectDetailedSolution(
      completeSingleQuestionSolution("\n第1问：先求出速度。"),
      problem,
    );

    expect(inspection.missingSubQuestions).toEqual(["2"]);
  });

  it("任务术语出现在条件名称中时不误判成小问", () => {
    const problem = "已知条件：\n1. 求和公式为Sn=n(a1+an)/2；\n2. 判断准则为判别式大于0。问参数范围。";
    const inspection = inspectDetailedSolution(completeSingleQuestionSolution(), problem);

    expect(inspection.missingSubQuestions).toEqual([]);
    expect(inspection.valid).toBe(true);
  });

  it.each([
    "1. 求物体的速度；3. 判断物体的运动方向。",
    "1. 求物体的速度；1. 判断物体的运动方向。",
    "1. 求A；1. 求B；2. 求C。",
  ])("跳号或重复编号不臆造多小问结构：%s", (problem) => {
    const inspection = inspectDetailedSolution(completeSingleQuestionSolution(), problem);

    expect(inspection.missingSubQuestions).toEqual([]);
    expect(inspection.valid).toBe(true);
  });

  it("多小问标题允许 Markdown 加粗和中文序号，不把完整讲解误判为漏题", () => {
    const problem = "已知条件。1. 证明结论；2. 推导递推关系；3. 计算目标比值。";
    const solution = "### 解题思路\n先梳理三个小问的承接关系：先完成证明，再建立递推式，最后代入计算。这里补充必要说明，确保方法选择和后续过程能够对应。\n### 分步推导\n**第1问：证明结论**\n1. 根据已知条件完成等价变形，并写明使用的依据。\n**第二问：推导递推关系**\n2. 把第一问结论代入定义，逐项相加得到所需递推式。\n#### **第3问：计算目标比值**\n3. 依次代入对应下标并化简，得到目标比值。\n### 结论\n三个小问均已逐项作答，结论与题目条件一致。\n### 易错提醒\n不要把推导步骤编号误认为小问编号，也不能跳过递推式的适用下标。";
    const inspection = inspectDetailedSolution(solution, problem);

    expect(inspection.missingSubQuestions).toEqual([]);
    expect(inspection.valid).toBe(true);
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
