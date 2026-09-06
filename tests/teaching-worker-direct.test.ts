import Module, { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { teachingWorkerMain } from "@/lib/learning/teaching-worker";
import { parseTeachingProgram } from "@/lib/learning/teaching-verifier";
import { genericProgram } from "./fixtures/general-teaching";

const nodeRequire = createRequire(import.meta.url);
const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;

function run(program: unknown) {
  let message: unknown;
  (Module as unknown as { _load: (...args: unknown[]) => unknown })._load = ((id: string, ...rest: unknown[]) => {
    if (id === "node:worker_threads") return { parentPort: { postMessage: (value: unknown) => { message = value; } }, workerData: { program, mathPath: nodeRequire.resolve("mathjs") } };
    return originalLoad(id, ...rest);
  }) as never;
  try { teachingWorkerMain(); } finally { (Module as unknown as { _load: (...args: unknown[]) => unknown })._load = originalLoad; }
  return message as { result?: Array<{ checks: Array<{ status: string }>; objects: Array<{ points: number[][] }> }>; error?: string };
}

describe("教学 Worker 协议", () => {
  afterEach(() => { (Module as unknown as { _load: (...args: unknown[]) => unknown })._load = originalLoad; });

  it("直接执行受限数学核验，保留精确检查和曲线采样结果", () => {
    const program = parseTeachingProgram(JSON.stringify(genericProgram()), "已知a=6");
    const outcome = run(program);
    expect(outcome.error).toBeUndefined();
    expect(outcome.result?.[0].checks[0].status).toBe("verified");
    expect(outcome.result?.[1].objects[1].points).toHaveLength(81);
  });

  it("对不安全的除零表达式返回明确失败，而不是执行任意代码", () => {
    const raw = genericProgram();
    raw.steps[0].checks = [{ kind: "numeric", left: "1/0", right: "1" }];
    const outcome = run(parseTeachingProgram(JSON.stringify(raw), "已知a=6"));
    expect(outcome.error).toMatch(/分母|有限实数|定义域|Division by Zero/);
  });

  it("核验单位、推理边界、直角三角形和边长标注", () => {
    const raw = genericProgram();
    raw.steps[0].checks = [
      { kind: "unit", left: "1 m", right: "100 cm" },
      { kind: "reasoning", left: "勾股定理", right: "直角三角形" },
    ];
    raw.steps[0].objects = [{ id: "triangle", kind: "polygon", points: [["0", "0"], ["3", "0"], ["0", "4"]], edgeLabels: ["3", "5", "4"], rightAngleAt: 0 }];
    const outcome = run(parseTeachingProgram(JSON.stringify(raw), "已知a=6"));
    expect(outcome.error).toBeUndefined();
    expect(outcome.result?.[0].checks.map(check => check.status)).toContain("verified");
    expect(outcome.result?.[0].checks.map(check => check.status)).toContain("unknown");
  });

  it("对恒等式使用多项式系数核验，并准确报告不相等的表达式", () => {
    const equal = genericProgram();
    equal.steps[0].checks = [{ kind: "identity", left: "(x+2)^2", right: "x^2+4*x+4" }];
    const pass = run(parseTeachingProgram(JSON.stringify(equal), "已知a=6"));
    expect(pass.result?.[0].checks[0]).toMatchObject({ status: "verified" });

    const unequal = genericProgram();
    unequal.steps[0].checks = [{ kind: "identity", left: "(x+2)^2", right: "x^2+4*x+3" }];
    const fail = run(parseTeachingProgram(JSON.stringify(unequal), "已知a=6"));
    expect(fail.result?.[0].checks[0]).toMatchObject({ status: "error" });
  });

  it("把定义域无法保证的表达式标为未知，而不是把采样当证明", () => {
    const raw = genericProgram();
    raw.steps[0].checks = [{ kind: "identity", left: "sqrt(x)", right: "sqrt(x)" }];
    const outcome = run(parseTeachingProgram(JSON.stringify(raw), "已知a=6"));
    expect(outcome.error).toBeUndefined();
    expect(outcome.result?.[0].checks[0]).toMatchObject({ status: "unknown", detail: expect.stringContaining("定义域") });
  });

  it("单位不等、偏移单位与非标准单位格式不会被误判为相等", () => {
    const raw = genericProgram();
    raw.steps[0].checks = [
      { kind: "unit", left: "1 m", right: "2 m" },
      { kind: "unit", left: "1 °C", right: "274 K" },
      { kind: "unit", left: "一米", right: "1 m" },
    ];
    const outcome = run(parseTeachingProgram(JSON.stringify(raw), "已知a=6"));
    expect(outcome.error).toBeUndefined();
    expect(outcome.result?.[0].checks.map(check => check.status)).toEqual(["error", "unknown", "unknown"]);
  });

  it("拒绝退化图形、错误边长标签和伪造直角", () => {
    const degenerate = genericProgram();
    degenerate.steps[0].objects = [{ id: "flat", kind: "polygon", points: [["0", "0"], ["1", "0"], ["2", "0"]] }];
    expect(run(parseTeachingProgram(JSON.stringify(degenerate), "已知a=6")).error).toContain("退化");

    const label = genericProgram();
    label.steps[0].objects = [{ id: "wrong_label", kind: "polygon", points: [["0", "0"], ["3", "0"], ["0", "4"]], edgeLabels: ["3", "4", "99"] }];
    expect(run(parseTeachingProgram(JSON.stringify(label), "已知a=6")).error).toContain("标注");

    const angle = genericProgram();
    angle.steps[0].objects = [{ id: "not_right", kind: "polygon", points: [["0", "0"], ["2", "0"], ["1", "1"]], rightAngleAt: 0 }];
    expect(run(parseTeachingProgram(JSON.stringify(angle), "已知a=6")).error).toContain("并非直角");
  });

  it("曲线的非法区间或跨零分母会被拦截", () => {
    const invalidDomain = genericProgram();
    invalidDomain.steps[0].objects = [{ id: "curve", kind: "curve", points: [], expression: "x^2", domain: ["2", "1"] }];
    expect(run(parseTeachingProgram(JSON.stringify(invalidDomain), "已知a=6")).error).toContain("区间无效");

    const discontinuous = genericProgram();
    discontinuous.steps[0].objects = [{ id: "curve", kind: "curve", points: [], expression: "1/x", domain: ["-1", "1"] }];
    expect(run(parseTeachingProgram(JSON.stringify(discontinuous), "已知a=6")).error).toContain("零分母");
  });

  it("变量来源和值不能被演示文本偷偷改写", () => {
    const claim = genericProgram();
    claim.steps[0].explanation = "a=7。";
    const claimedProgram = parseTeachingProgram(JSON.stringify(claim), "已知a=6。");
    claimedProgram.sourceValues = { a: "6" };
    expect(run(claimedProgram).error).toContain("已知a=6");

    const definition = genericProgram();
    definition.variables[0].expression = "7";
    const definedProgram = parseTeachingProgram(JSON.stringify(definition), "已知a=6。");
    definedProgram.sourceValues = { a: "6" };
    expect(run(definedProgram).error).toContain("不一致");
  });

  it("对常量、未赋值参数与不可符号化等式采用不同且保守的核验结果", () => {
    const raw = genericProgram();
    raw.steps[0].checks = [
      { kind: "numeric", left: "0.1+0.2", right: "0.3" },
      { kind: "numeric", left: "1", right: "2" },
      { kind: "numeric", left: "u", right: "u" },
      { kind: "identity", left: "2/3", right: "4/6" },
      { kind: "identity", left: "sqrt(x^2)", right: "x" },
      { kind: "identity", left: "sin(x)", right: "sin(x)" },
    ];
    const outcome = run(parseTeachingProgram(JSON.stringify(raw), "已知a=6"));
    expect(outcome.error).toBeUndefined();
    expect(outcome.result?.[0].checks.map((check) => check.status)).toEqual([
      "verified", "error", "unknown", "verified", "unknown", "unknown",
    ]);
  });

  it("安全曲线会生成采样，定义域、间断点和资源限制会被拒绝", () => {
    const safe = genericProgram();
    safe.steps[0].objects = [
      { id: "sine", kind: "curve", points: [], expression: "sin(x)", domain: ["0", "1"] },
      { id: "absolute", kind: "curve", points: [], expression: "abs(x)", domain: ["-2", "3"] },
      { id: "root", kind: "curve", points: [], expression: "sqrt(x)", domain: ["0", "4"] },
      { id: "log", kind: "curve", points: [], expression: "log(x)", domain: ["1", "2"] },
    ];
    const verified = run(parseTeachingProgram(JSON.stringify(safe), "已知a=6"));
    expect(verified.error).toBeUndefined();
    expect(verified.result?.[0].objects.every((object) => object.points.length === 81)).toBe(true);

    for (const expression of ["sqrt(x)", "log(x)", "x^0.5"]) {
      const invalid = genericProgram();
      invalid.steps[0].objects = [{ id: "bad", kind: "curve", points: [], expression, domain: ["-1", "1"] }];
      expect(run(parseTeachingProgram(JSON.stringify(invalid), "已知a=6")).error).toBeTruthy();
    }
    const tangent = genericProgram();
    tangent.steps[0].objects = [{ id: "tan", kind: "curve", points: [], expression: "tan(x)", domain: ["-2", "2"] }];
    expect(run(parseTeachingProgram(JSON.stringify(tangent), "已知a=6")).error).toContain("间断点");
  });

  it("几何标注会按真实边长重新放置，单位、根式与非标量注释不会被猜测", () => {
    const reordered = genericProgram();
    reordered.steps[0].objects = [{
      id: "triangle", kind: "polygon", points: [["0", "0"], ["3", "0"], ["0", "4"]],
      edgeLabels: ["4", "3", "5"], rightAngleAt: 0,
    }];
    const result = run(parseTeachingProgram(JSON.stringify(reordered), "已知a=6"));
    expect(result.error).toBeUndefined();
    expect((result.result?.[0].objects[0] as { edgeLabels?: string[] }).edgeLabels).toEqual(["3", "5", "4"]);

    const annotations = genericProgram();
    annotations.steps[0].objects = [{
      id: "annotated", kind: "polygon", points: [["0", "0"], ["3", "0"], ["0", "4"]],
      edgeLabels: ["3 cm", "m(O2)=32", "√16"],
    }];
    const checked = run(parseTeachingProgram(JSON.stringify(annotations), "已知a=6"));
    expect(checked.error).toBeUndefined();
    expect(checked.result?.[0].checks.some((check) => (check as { detail?: string }).detail?.includes("3 cm"))).toBe(true);
  });

  it("对可恢复的自由符号保持未知，对前向引用、循环引用和危险语法明确拒绝", () => {
    const free = genericProgram();
    free.symbols = [];
    free.steps[0].checks = [{ kind: "numeric", left: "u", right: "u" }];
    const unknown = run(parseTeachingProgram(JSON.stringify(free), "已知a=6"));
    expect(unknown.result?.[0].checks[0]).toMatchObject({ status: "unknown" });

    const cyclic = genericProgram();
    cyclic.variables = [
      { name: "a", expression: "b+1", refs: ["c1"] },
      { name: "b", expression: "a+1", refs: ["c1"] },
    ];
    expect(run(parseTeachingProgram(JSON.stringify(cyclic), "已知a=6")).error).toContain("循环引用");

    const unsafe = genericProgram();
    unsafe.steps[0].checks = [{ kind: "numeric", left: "constructor", right: "1" }];
    expect(run(parseTeachingProgram(JSON.stringify(unsafe), "已知a=6")).error).toMatch(/未声明|禁止|函数/);
  });

  it("会保守处理表达式、单位和曲线的边界定义域", () => {
    const long = genericProgram();
    long.steps[0].checks = [{ kind: "numeric", left: "1".repeat(257), right: "1" }];
    expect(() => parseTeachingProgram(JSON.stringify(long), "已知a=6")).toThrow("检查项不合法");

    const unsupportedUnit = genericProgram();
    unsupportedUnit.steps[0].checks = [{ kind: "unit", left: "1 madeup", right: "1 madeup" }];
    expect(run(parseTeachingProgram(JSON.stringify(unsupportedUnit), "已知a=6")).result?.[0].checks[0]).toMatchObject({ status: "unknown" });

    const exponential = genericProgram();
    exponential.steps[0].objects = [{ id: "exp", kind: "curve", points: [], expression: "exp(x)", domain: ["0", "1"] }];
    expect(run(parseTeachingProgram(JSON.stringify(exponential), "已知a=6")).result?.[0].objects[0].points).toHaveLength(81);
  });
});
