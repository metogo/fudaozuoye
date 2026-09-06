import { describe, expect, it, vi } from "vitest";
import { parseTeachingProgram, verifyTeachingProgram } from "@/lib/learning/teaching-verifier";
import { generateGeneralTeaching, assembleGeneralLesson } from "@/lib/learning/providers/general-teaching";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { genericProgram } from "./fixtures/general-teaching";

const session = () => { const s = analyzeMock(recognizeMock("math", "primary"), "doubao"); s.problem.text = "已知a=6"; return s; };
const auditPass = async () => '{"verdict":"pass","issues":[]}';
describe("通用协议与隔离核验", () => {
  it("核验数值、多项式并只传采样点到浏览器", async () => {
    const p = parseTeachingProgram(JSON.stringify(genericProgram()), "已知a=6");
    const result = await verifyTeachingProgram(p);
    expect(result[0].checks[0].status).toBe("verified"); expect(result[1].checks[0].status).toBe("verified");
    expect(result[1].objects[1].points).toHaveLength(81);
    const lesson = assembleGeneralLesson(session(), p, result);
    expect(lesson.frames.every(f => f.verification?.some(c => c.status === "unknown"))).toBe(true);
    expect(JSON.stringify(lesson.frames[1].scene)).not.toContain("expression");
  });
  it.each(["x/x", "sqrt(x^2)", "abs(x)"])("定义域或非多项式%s不假称证明", async expression => {
    const p = genericProgram(); p.steps[0].checks = [{ kind: "identity", left: expression, right: "x" }];
    expect((await verifyTeachingProgram(p))[0].checks[0].status).toBe("unknown");
  });
  it.each(["constructor(1)", "import(1)", "a=1", "a.constructor", "[1,2]", "2^999999", "unknown(1)", "q+1", "1/0", "sqrt(-1)", "x".repeat(300), `${"(".repeat(25)}1${")".repeat(25)}`])("拒绝危险或无效表达式%s", async expression => {
    const p = genericProgram(); p.variables[0].expression = expression;
    await expect(verifyTeachingProgram(p)).rejects.toThrow();
  });
  it("遗漏符号声明只补充自由符号，不给符号伪造数值", async () => {
    const p = genericProgram(); p.symbols = []; p.steps[1].checks = [{ kind: "identity", left: "x+x", right: "2*x" }];
    const result = await verifyTeachingProgram(p);
    expect(result[1].checks[0].status).toBe("verified");
    expect(result[1].inferredSymbols).toContain("x");
    p.steps[0].objects[0].points[1][0] = "q";
    await expect(verifyTeachingProgram(p)).rejects.toThrow("Undefined symbol");
  });
  it("明确错误不通过，接近的大数不误判", async () => {
    const p = genericProgram(); p.steps[0].checks = [{ kind: "numeric", left: "1000000000", right: "999999999.5" }];
    expect((await verifyTeachingProgram(p))[0].checks[0].status).toBe("error");
  });
  it("极小非零数与零不相等，恒等式中的明确常量矛盾不能降级展示", async () => {
    const p = genericProgram(); p.steps[0].checks = [
      { kind: "numeric", left: "1e-20", right: "0" },
      { kind: "identity", left: "2+2", right: "5" },
      { kind: "identity", left: "x+1", right: "x+2" },
    ];
    expect((await verifyTeachingProgram(p))[0].checks.map(c => c.status)).toEqual(["error", "error", "error"]);
    expect(() => parseTeachingProgram(JSON.stringify(genericProgram("   ")), "已知a=6")).toThrow("原题证据");
  });
  it("多项式系数精确比较，不能用近似化简消掉非零项", async () => {
    const p = genericProgram(); p.steps[0].checks = [
      { kind: "identity", left: "x+1e-20", right: "x" },
      { kind: "identity", left: "x+0.1+0.2", right: "x+0.30000000000000004" },
      { kind: "identity", left: "(x+1)^3", right: "x^3+3*x^2+3*x+1" },
      { kind: "identity", left: "0.1*x+0.2*x", right: "0.3*x" },
    ];
    expect((await verifyTeachingProgram(p))[0].checks.map(c => c.status)).toEqual(["error", "error", "verified", "verified"]);
  });
  it.each(["1/0", "sqrt(-1)"])("无定义的常量恒等检查%s不能降为未知后放行", async left => {
    const p = genericProgram(); p.steps[0].checks = [{ kind: "identity", left, right: left }];
    await expect(verifyTeachingProgram(p)).rejects.toThrow();
  });
  it("单位不会用浮点容差把不同量值标为相等", async () => {
    const p = genericProgram(); p.steps[0].checks = [{ kind: "unit", left: "1 m", right: "1.0000000000001 m" }];
    expect((await verifyTeachingProgram(p))[0].checks[0].status).toBe("error");
    p.steps[0].checks[0].left = "0.10000000000000001 m";
    await expect(verifyTeachingProgram(p)).rejects.toThrow("精度");
  });
  it.each([["32 degF", "0 degC"], ["0 degC", "0 K"]])("带偏移温标%s与%s不错误判定相等或不等", async (left, right) => {
    const p = genericProgram(); p.steps[0].checks = [{ kind: "unit", left, right }];
    expect((await verifyTeachingProgram(p))[0].checks[0].status).toBe("unknown");
  });
  it.each(["1/(x-0.01)", "tan(x)"])("采样间的间断点%s不能连成连续曲线", async expression => {
    const p = genericProgram(); p.steps[1].objects[1].expression = expression; p.steps[1].objects[1].domain = ["-2", "2"];
    await expect(verifyTeachingProgram(p)).rejects.toThrow(/区间|间断/);
  });
  it.each(["0.10000000000000001", "1e-999"])("常量%s不能先舍入再假称精确相等", async left => {
    const p = genericProgram(); p.steps[0].checks = [{ kind: "numeric", left, right: "0.1" }];
    await expect(verifyTeachingProgram(p)).rejects.toThrow("精度");
  });
  it("单位等量和一般推理范围分开", async () => {
    const p = genericProgram(); p.steps[0].checks = [{ kind: "unit", left: "1 m", right: "100 cm" }, { kind: "reasoning", left: "勾股定理", right: "适用于直角三角形" }];
    expect((await verifyTeachingProgram(p))[0].checks.map(c => c.status)).toEqual(["verified", "unknown"]);
  });
  it("符号参数可通过别名传递，但不能当成已知绘图数值", async () => {
    const p = genericProgram(); p.symbols.push("k");
    p.variables.push({ name: "delta", expression: "a^2-4*k", refs: ["c1", "a"] });
    p.steps[0].checks = [{ kind: "identity", left: "delta", right: "36-4*k" }];
    expect((await verifyTeachingProgram(p))[0].checks[0].status).toBe("verified");
    p.steps[0].objects[0].points[1][0] = "delta";
    await expect(verifyTeachingProgram(p)).rejects.toThrow("Undefined symbol");
  });
  it("小数和分数四则精确核验，不显示浮点尾数", async () => {
    const p = genericProgram(); p.steps[0].checks = [
      { kind: "numeric", left: "0.1+0.2", right: "0.3" },
      { kind: "identity", left: "2+2", right: "4" },
      { kind: "numeric", left: "sqrt(24)^2", right: "24" },
    ];
    const checks = (await verifyTeachingProgram(p))[0].checks;
    expect(checks.map(c => c.status)).toEqual(["verified", "verified", "verified"]);
    expect(checks[0].detail).toContain("精确"); expect(checks[2].detail).not.toContain("999999");
  });
  it("紧凑协议的机械字段由程序绑定，单点和空曲线点列规范化不改数值", async () => {
    const p = parseTeachingProgram(JSON.stringify({ title: "图形关系", steps: [{ title: "同源数量", explanation: "边表示已知数量。", checks: [{ kind: "numeric", left: "6", right: "6" }], objects: [
      { kind: "polygon", points: [[0, 0], [6, 0], [0, 3]], edgeLabels: ["长边", "斜边", "短边"] },
      { kind: "point", points: [0, 0] }, { kind: "curve", expression: "x", domain: ["0", "6"] },
    ] }] }), "已知a=6");
    expect(p.conditions[0].quote).toBe("已知a=6"); expect(p.steps[0].refs).toEqual(["source"]);
    expect(p.steps[0].objects[1].points).toEqual([["0", "0"]]); expect(p.steps[0].objects[2].points).toEqual([]);
    const lesson = assembleGeneralLesson(session(), p, await verifyTeachingProgram(p));
    expect(lesson.frames[0].scene?.shapes.some(s => s.kind === "label" && s.text === "斜边")).toBe(true);
    expect(lesson.frames[0].id).toBe("frame-1"); expect(lesson.frames[0].imageUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });
  it("来源缺失、前向引用、污染键及资源超限被拒绝", () => {
    expect(() => parseTeachingProgram(JSON.stringify(genericProgram("别的题")), "已知a=6")).toThrow("原题证据");
    const p = genericProgram(); p.steps[0].refs = ["s2"];
    expect(() => parseTeachingProgram(JSON.stringify(p), "已知a=6")).toThrow("引用");
    expect(() => parseTeachingProgram('{"__proto__":{}}', "")).toThrow("禁止");
    expect(() => parseTeachingProgram(" ".repeat(60001), "")).toThrow("大小");
    const huge = genericProgram(); huge.steps[0].objects[0].points = Array.from({ length: 25 }, () => ["0", "0"]);
    expect(() => parseTeachingProgram(JSON.stringify(huge), "已知a=6")).toThrow();
  });
  it("退化多边形与虚假直角被拦截，合法直角才绘制标记", async () => {
    const p = genericProgram();
    p.steps[0].objects = [{ id: "triangle", kind: "polygon", points: [["0", "0"], ["3", "0"], ["0", "4"]], rightAngleAt: 0 }];
    const result = await verifyTeachingProgram(p);
    expect(result[0].checks.some(c => c.status === "verified" && c.detail.includes("垂直"))).toBe(true);
    expect(assembleGeneralLesson(session(), p, result).frames[0].scene?.shapes.some(s => s.id === "triangle_right")).toBe(true);
    p.steps[0].objects[0].points[2] = ["1", "4"];
    await expect(verifyTeachingProgram(p)).rejects.toThrow("并非直角");
    p.steps[0].objects[0].points[2] = ["1", "0"];
    await expect(verifyTeachingProgram(p)).rejects.toThrow("退化");
  });
  it("边长标签与坐标不能各说各话", async () => {
    const p = genericProgram();
    p.steps[0].objects = [{ id: "triangle", kind: "polygon", points: [["0", "0"], ["3", "0"], ["0", "4"]], edgeLabels: ["a=3", "c=5", "b=4"] }];
    expect((await verifyTeachingProgram(p))[0].checks.filter(c => c.detail.includes("标注一致"))).toHaveLength(3);
    p.steps[0].objects[0].edgeLabels = ["b=4", "c=√25", "a=3"];
    expect((await verifyTeachingProgram(p))[0].objects[0].edgeLabels).toEqual(["a=3", "c=√25", "b=4"]);
    p.steps[0].objects[0].edgeLabels![0] = "a=6";
    await expect(verifyTeachingProgram(p)).rejects.toThrow("不一致");
  });
  it("变量按依赖展开而非要求模型排序，循环引用仍拒绝", async () => {
    const p = genericProgram(); p.variables = [{ name: "a", expression: "b*2", refs: ["c1"] }, { name: "b", expression: "3", refs: ["c1"] }];
    expect((await verifyTeachingProgram(p))[0].checks[0].status).toBe("verified");
    p.variables[1].expression = "a";
    await expect(verifyTeachingProgram(p)).rejects.toThrow("循环引用");
  });
  it("原题的显式已知量不能互换，模型不能覆盖服务端提取结果", async () => {
    const p = genericProgram(); p.conditions[0].quote = "已知a=6，AC=3，BC=4";
    p.steps[0].explanation = "AC=4，BC=3，面积仍为6。";
    p.sourceValues = { AC: "4", BC: "3" };
    const parsed = parseTeachingProgram(JSON.stringify(p), p.conditions[0].quote);
    expect(parsed.sourceValues).toMatchObject({ AC: "3", BC: "4" });
    await expect(verifyTeachingProgram(parsed)).rejects.toThrow("原题已知");
    p.steps[0].explanation = "AC=3，BC=4";
    const equation = parseTeachingProgram(JSON.stringify(p), `${p.conditions[0].quote}，x^2 - 6*x + k = 0`);
    expect(equation.sourceValues).not.toHaveProperty("k");
  });
  it("来源不会截断表达式，小数已知量也用精确四则核对", async () => {
    for (const expression of ["1e3", "3b", "2π", "3√2"]) {
      const p = genericProgram(`a=${expression}`);
      expect(parseTeachingProgram(JSON.stringify(p), p.conditions[0].quote).sourceValues).not.toHaveProperty("a");
    }
    const p = genericProgram("已知a=0.3"); p.variables[0].expression = "0.1+0.2";
    p.steps[0].checks[0] = { kind: "numeric", left: "a", right: "0.3" };
    await expect(verifyTeachingProgram(parseTeachingProgram(JSON.stringify(p), p.conditions[0].quote))).resolves.toBeDefined();
  });
  it("点集不能通过协议后静默消失，每步检查不可为空", async () => {
    const p = genericProgram(); p.steps = [p.steps[0]];
    p.steps[0].objects = [{ id: "points", kind: "point", points: [["0", "0"], ["3", "4"]], text: "两个已知点" }];
    const lesson = assembleGeneralLesson(session(), p, await verifyTeachingProgram(p));
    expect(lesson.frames[0].scene?.shapes.filter(s => s.kind === "circle")).toHaveLength(2);
    p.steps[0].checks = [];
    expect(() => parseTeachingProgram(JSON.stringify(p), "已知a=6")).toThrow("至少需要一个检查");
    const dependent = genericProgram();
    expect(assembleGeneralLesson(session(), dependent, [{ checks: [], objects: [] }, { checks: [], objects: [] }]).frames[1].sourceQuotes).toEqual(["已知a=6"]);
  });
  it("单位后缀不会作为同名变量参与边长校验", async () => {
    const p = genericProgram(); p.variables.push({ name: "s", expression: "24", refs: ["c1"] });
    p.steps[0].objects = [{ id: "area", kind: "polygon", points: [["0", "0"], ["4", "0"], ["0", "12"]], edgeLabels: ["t=4s", "", ""] }];
    await expect(verifyTeachingProgram(p)).resolves.toBeDefined();
    p.steps[0].objects[0].edgeLabels = ["", "", "t=4s"];
    await expect(verifyTeachingProgram(p)).rejects.toThrow("与坐标长度");
    p.steps[0].objects[0].edgeLabels = ["", "", "s=24m"];
    await expect(verifyTeachingProgram(p)).rejects.toThrow("与坐标长度");
    p.steps[0].objects[0].edgeLabels = ["m(O2)=32", "", ""];
    expect((await verifyTeachingProgram(p))[0].checks.some(c => c.detail.includes("标注一致"))).toBe(false);
  });
  it("不支持的单位说明只标未验证，不伪造单位等量证明", async () => {
    const p = genericProgram(); p.steps[0].checks = [{ kind: "unit", left: "斜边平方", right: "24" }];
    expect((await verifyTeachingProgram(p))[0].checks[0].status).toBe("unknown");
  });
  it("数值检查含自由参数只标未知，绘图仍不能使用未知数；点集逐点绘制", async () => {
    const p = genericProgram(); p.symbols.push("k");
    p.steps[0].checks = [{ kind: "numeric", left: "36-4*k", right: "0" }];
    p.steps[0].objects.push({ id: "roots", kind: "point", points: [["1", "0"], ["5", "0"]] });
    const validated = parseTeachingProgram(JSON.stringify(p), "已知a=6");
    const result = await verifyTeachingProgram(validated);
    expect(result[0].checks[0].status).toBe("unknown");
    expect(assembleGeneralLesson(session(), validated, result).frames[0].scene?.shapes.filter(s => s.kind === "circle")).toHaveLength(2);
    p.steps[0].objects[0].points[1][0] = "k";
    await expect(verifyTeachingProgram(p)).rejects.toThrow("Undefined symbol");
  });
  it("worker超时可终止且取消立即结束", async () => {
    await expect(verifyTeachingProgram(genericProgram(), undefined, 1)).rejects.toThrow("资源预算");
    const c = new AbortController(); const promise = verifyTeachingProgram(genericProgram(), c.signal); c.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
  it("一次修复明确算错，不使用模板兜底", async () => {
    const bad = genericProgram(); bad.steps[0].checks[0].right = "13";
    const request = vi.fn().mockResolvedValueOnce(JSON.stringify(bad)).mockResolvedValueOnce(JSON.stringify(genericProgram()));
    const lesson = await generateGeneralTeaching(session(), request, auditPass);
    expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[1][1]).toContain("13");
    expect(lesson.generationMetrics?.repairCount).toBe(1);
    await expect(generateGeneralTeaching(session(), vi.fn().mockResolvedValue(JSON.stringify(bad)), auditPass)).rejects.toThrow("算术");
  });
  it("不同学科输入沿同一链路，不按题型拒绝", async () => {
    for (const subject of ["math", "physics", "chemistry"] as const) {
      const s = session(); s.problem.subject = subject;
      const request = vi.fn().mockResolvedValue(JSON.stringify(genericProgram()));
      expect((await generateGeneralTeaching(s, request, auditPass)).frames).toHaveLength(2); expect(request).toHaveBeenCalledOnce();
    }
  });
  it("缺条件直接提示，不调用第二次修复", async () => {
    const request = vi.fn().mockResolvedValue('{"clarification":"补充边长"}');
    await expect(generateGeneralTeaching(session(), request, auditPass)).rejects.toThrow("补充边长"); expect(request).toHaveBeenCalledOnce();
  });
  it("低置信关键图条件要求确认", async () => {
    const s = session(); s.problem.visualContext = { related: true, affectsSolving: true, confidence: 0.5, summary: "边长不清", facts: [{ text: "可能为3", confidence: 0.5, source: "printed_label" }] };
    const request = vi.fn(); await expect(generateGeneralTeaching(s, request, auditPass)).rejects.toThrow("关键标注"); expect(request).not.toHaveBeenCalled();
  });
  it("整体35秒预算可结束不响应取消的请求", async () => {
    vi.useFakeTimers();
    try {
      const pending = expect(generateGeneralTeaching(session(), () => new Promise(() => {}), auditPass)).rejects.toThrow("35秒");
      await vi.advanceTimersByTimeAsync(35000); await pending;
    } finally { vi.useRealTimers(); }
  });
});
