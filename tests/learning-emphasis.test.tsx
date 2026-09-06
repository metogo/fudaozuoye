import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emphasisRanges, parseLearningEmphasis, type LearningEmphasis } from "@/lib/learning/learning-emphasis";
import { RichLearningText } from "@/components/rich-learning-text";
import { emphasisPrompt } from "@/lib/learning/providers/emphasis";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { postEmphasis } from "@/lib/learning/http/emphasis";
import { sealSession } from "@/lib/learning/server-state";
import { LiveProviderAdapter, MockProviderAdapter } from "@/lib/learning/providers/adapter";

const source = String.raw`### 关键线索

题目说明**有两个实数根**，所以我们先判断方程的根是否存在，不需要先求出具体的根。

根的判别式应满足 $\Delta=b^2-4ac\geq0$，这是把题目条件转换为参数范围的依据，之后再代入系数计算。

本步只处理第一问，其余小问以后再接着完成。`;
const reason = "这个条件决定先用判别式建立不等式，而不是直接求根。";
const marks: LearningEmphasis[] = [{ kind: "text", target: "有两个实数根", reason }, { kind: "math", target: String.raw`\Delta=b^2-4ac\geq0`, reason }];
const proposed = (mark = marks[0], extras = {}) => ({ ...mark, confidence: .96, evidence: "有两个实数根", ...extras });
afterEach(() => vi.restoreAllMocks());

describe("教学重点选取与渲染", () => {
  it("只画选中的条件和完整公式，不把所有加粗/公式变成划线", () => {
    const html = renderToStaticMarkup(<RichLearningText text={source} emphasis={marks}/>);
    expect(html).toContain('class="learning-emphasis learning-emphasis--text">有两个实数根</mark>');
    expect(html).toContain('class="learning-emphasis learning-emphasis--math"');
    expect(html).toContain('encoding="application/x-tex">\\Delta=b^2-4ac\\geq0');
    expect(renderToStaticMarkup(<RichLearningText text={source}/>)).not.toContain("learning-emphasis--");
  });
  it("不完整公式、不存在原文、重复出现、空泛标题都不画", () => {
    for (const target of ["根的判别式", "关键线索", "凭空新增条件", "最关键的已知条件"]) {
      const input = target === "根的判别式" ? source + "\n\n根的判别式" : source;
      expect(emphasisRanges(input, [{ kind: "text", target, reason }])).toEqual([]);
    }
    expect(emphasisRanges(source, [{ kind: "math", target: "b^2-4ac", reason }])).toEqual([]);
    expect(emphasisRanges(source + String.raw`\n\n$\notARealFormula{x}$`, [{ kind: "math", target: String.raw`\notARealFormula{x}`, reason }])).toEqual([]);
  });
  it("不划代码、标题或带HTML的目标，也不跨Markdown边界拼接", () => {
    for (const sample of ["`有两个实数根`", "### 有两个实数根", "```\n有两个实数根\n```", "有两个**实数根**"]) {
      expect(renderToStaticMarkup(<RichLearningText text={sample + "\n\n" + "普通说明文字。".repeat(20)} emphasis={[marks[0]]}/>)).not.toContain("learning-emphasis--text");
    }
    expect(emphasisRanges(source, [{ kind: "text", target: '<script>x</script>', reason }])).toEqual([]);
  });
  it("低把握、无依据、依据不在原题/讲解里时不画", () => {
    for (const extras of [{ confidence: .7 }, { evidence: "不在原文中的结论" }, { reason: "重要" }, { confidence: 2 }])
      expect(parseLearningEmphasis({ marks: [proposed(marks[0], extras)] }, source, "")).toEqual([]);
    expect(parseLearningEmphasis({ marks: [proposed()] }, source, "")).toEqual([marks[0]]);
  });
  it("模型可引用原文片段编号，避免重抄引文出错；无效编号不接受", () => {
    expect(parseLearningEmphasis({ marks: [proposed(marks[0], { evidence: undefined, evidenceId: "e1" })] }, source, "")).toEqual([marks[0]]);
    expect(parseLearningEmphasis({ marks: [proposed(marks[0], { evidence: undefined, evidenceId: "e999" })] }, source, "")).toEqual([]);
    expect(parseLearningEmphasis({ marks: [proposed(marks[0], { evidence: undefined, evidenceId: "e0" })] }, source, "")).toEqual([]);
  });
  it("同段最多一处，整条最多三处，避免整段被划满", () => {
    expect(emphasisRanges(source, [...marks, { kind: "text", target: "这是把题目条件转换为参数范围的依据", reason }])).toHaveLength(2);
    expect(emphasisRanges("有两个实数根", [marks[0]])).toEqual([]);
    const many = ["条件决定方向", "转换关键关系", "明确系数符号", "后续推导依据"].map((target) => ({ kind: "text" as const, target, reason }));
    expect(emphasisRanges(many.map((m) => m.target + "，这里有一些具体说明说明具体的数学依据如何指导当前解题过程。").join("\n\n"), many)).toHaveLength(3);
  });
  it("流式未结束时不划线；完整独立公式保留KaTeX和MathML", () => {
    expect(renderToStaticMarkup(<RichLearningText text={source} emphasis={marks} streaming/>)).not.toContain("learning-emphasis--");
    const html = renderToStaticMarkup(<RichLearningText text={source.replace('$\\Delta=b^2-4ac\\geq0$', '\n\n$$\\Delta=b^2-4ac\\geq0$$\n\n')} emphasis={[marks[1]]}/>);
    expect(html).toContain('class="learning-emphasis learning-emphasis--math"');
    expect(html).toContain("katex-mathml");
  });
  it("模型上下文含原题和当前问题，而不是只看加粗词", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const prompt = JSON.parse(emphasisPrompt(session, source, "第3问，求斜边"));
    expect(prompt.problem).toContain(session.problem.text);
    expect(prompt.thisExplanationContext).toBe("第3问，求斜边");
    expect(prompt.completedExplanation).toContain("有两个实数根");
  });
  it("真实适配器使用模型判断，结构失效不重试或猜一个重点", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({ marks: [proposed(), proposed(marks[1])] }) } }] }));
    const adapter = new LiveProviderAdapter({ id: "doubao", label: "test", apiKey: "not-real", modelId: "test", baseUrl: "https://example.invalid", protocol: "chat-completions", mock: false }, fetcher);
    expect(await adapter.selectEmphasis(analyzeMock(recognizeMock("math", "junior"), "doubao"), source, "求参数范围")).toEqual(marks);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.max_tokens).toBe(1200);
    expect(body.thinking.type).toBe("disabled");
  });
  it("独立接口不改学习状态，演示模式无模型判断时不伪造重点", async () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const before = JSON.stringify(session);
    const response = await postEmphasis(new Request("http://localhost:3000/learning/emphasis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stateToken: sealSession(session), source, context: "当前条件" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ marks: [] });
    expect(JSON.stringify(session)).toBe(before);
    expect(MockProviderAdapter).toBeDefined();
  });
});
