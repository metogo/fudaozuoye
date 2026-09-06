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
});
