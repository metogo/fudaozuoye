import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTeachingAudit, teachingAuditInput } from "@/lib/learning/teaching-audit";
import { generateGeneralTeaching, assembleGeneralLesson } from "@/lib/learning/providers/general-teaching";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { genericProgram } from "./fixtures/general-teaching";
import { illustrationFingerprint } from "@/lib/learning/illustration-fingerprint";

vi.mock("@/lib/learning/teaching-verifier", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/learning/teaching-verifier")>();
  return { ...original, verifyTeachingProgram: vi.fn(async () => [
    { checks: [], objects: [{ id: "shape", kind: "line", points: [[0, 0], [6, 0]], text: "a=6" }] },
    { checks: [], objects: [] },
  ]) };
});
const session = () => { const s = analyzeMock(recognizeMock("math", "primary"), "doubao"); s.problem.text = "已知a=6"; return s; };
const pass = '{"verdict":"pass","issues":[]}';
const reject = '{"verdict":"reject","issues":["步骤1把a=6换为4"]}';
const generation = () => vi.fn().mockResolvedValue(JSON.stringify(genericProgram()));
afterEach(() => vi.useRealTimers());

describe("独立语义校对与共享预算", () => {
  it("较长的拒绝理由仍保持拒绝，并限制修复反馈长度", () => {
    const result = parseTeachingAudit(JSON.stringify({ verdict: "reject", issues: ["错".repeat(300)] }));
    expect(result.verdict).toBe("reject");
    expect(result.issues[0]).toHaveLength(180);
  });
  it.each(['{}', '{"verdict":"pass","issues":["错"]}', '{"verdict":"reject","issues":[]}', '{"verdict":"uncertain","issues":[]}', '```json\n{"verdict":"pass","issues":[]}\n```', '{"verdict":"pass","issues":[],"extra":1}'])("拒绝非法响应%s", raw => expect(() => parseTeachingAudit(raw)).toThrow("未放行"));
  it("pass才返回；普通成功只增加一次短校对", async () => {
    const request = generation(), audit = vi.fn().mockResolvedValue(pass);
    const lesson = await generateGeneralTeaching(session(), request, audit);
    expect(request).toHaveBeenCalledOnce(); expect(audit).toHaveBeenCalledOnce();
    expect(lesson.generationMetrics).toMatchObject({ auditCount: 1, auditVersion: 1, repairCount: 0 });
    expect(audit.mock.calls[0][2]).toBeLessThanOrEqual(8000);
    expect(audit.mock.calls[0][1]).toContain("disciplineObjects");
    expect(audit.mock.calls[0][1]).not.toContain("base64");
    expect(lesson.frames[0].verification?.some(c => c.status === "unknown")).toBe(true);
  });
  it("拒绝后只修复一次并重新审核，诊断送回生成模型", async () => {
    const request = generation(), audit = vi.fn().mockResolvedValueOnce(reject).mockResolvedValue(pass);
    const lesson = await generateGeneralTeaching(session(), request, audit);
    expect(request).toHaveBeenCalledTimes(2); expect(audit).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1]).toContain("把a=6换为4");
    expect(lesson.generationMetrics).toMatchObject({ auditCount: 2, repairCount: 1 });
  });
  it.each([reject, '{"verdict":"uncertain","issues":["图意不足"]}', '{}'])("不确定/格式异常/再次拒绝不能放行%s", async response => {
    const request = generation(), audit = vi.fn().mockResolvedValue(response);
    await expect(generateGeneralTeaching(session(), request, audit)).rejects.toThrow("校对");
    expect(audit).toHaveBeenCalledTimes(response === reject ? 2 : 1);
  });
  it("校对不响应取消也被累计8秒终止", async () => {
    vi.useFakeTimers();
    const request = generation(), audit = vi.fn(() => new Promise<string>(() => {}));
    const pending = expect(generateGeneralTeaching(session(), request, audit)).rejects.toThrow("8秒");
    await vi.advanceTimersByTimeAsync(8000); await pending;
    expect(request).toHaveBeenCalledOnce(); expect(audit.mock.calls).toHaveLength(1);
  });
  it("修复后的审核共享8秒而非重新计时", async () => {
    vi.useFakeTimers();
    const audit = vi.fn().mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(reject), 6000))).mockImplementation(() => new Promise(() => {}));
    const pending = expect(generateGeneralTeaching(session(), generation(), audit)).rejects.toThrow("8秒");
    await vi.advanceTimersByTimeAsync(8000); await pending;
    expect(audit.mock.calls[1][2]).toBe(2000);
  });
  it("生成/校对/修复全部共享35秒", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(JSON.stringify(genericProgram())), 30000))).mockImplementation(() => new Promise(() => {}));
    const audit = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(reject), 3000)));
    const pending = expect(generateGeneralTeaching(session(), request, audit)).rejects.toThrow("35秒");
    await vi.advanceTimersByTimeAsync(35000); await pending;
    expect(request.mock.calls[1][2]).toBe(2000);
  });
  it("在审核中取消立即终止且不修复", async () => {
    const c = new AbortController(), request = generation();
    const audit = vi.fn(async () => { c.abort(); return pass; });
    await expect(generateGeneralTeaching(session(), request, audit, c.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(request).toHaveBeenCalledOnce();
  });
  it("审查覆盖实际标签与数学边长，曲线不会伪装成端点直线", () => {
    const p = genericProgram(), s = session();
    const evaluated = p.steps.map(step => ({ checks: [], objects: step.objects.map(o => ({ ...o, radius: undefined, points: o.kind === "curve" ? Array.from({ length: 81 }, (_, i) => [i, i * i]) : [[0, 0], [6, 0], [0, 4]] })) }));
    const lesson = assembleGeneralLesson(s, p, evaluated);
    const input = JSON.parse(teachingAuditInput("原题", p, evaluated, lesson));
    expect(input.steps[1].disciplineObjects.find((o: {kind:string}) => o.kind === "curve").curveSamples).toHaveLength(9);
    expect(input.steps[1].displayScene.find((o: {kind:string}) => o.kind === "curve").points).toBeUndefined();
    expect(input.variables[0].expression).toBe("6");
    expect(illustrationFingerprint(s)).not.toBe(illustrationFingerprint({ ...s, requestId: "other" }));
  });
});
