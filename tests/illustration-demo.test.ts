import { afterEach, describe, expect, it, vi } from "vitest";
import { canReuseIllustration } from "@/components/education-chat-app";
import { illustrationFingerprint } from "@/lib/learning/illustration-fingerprint";
import { understandingGate } from "@/lib/learning/flow";
import { postTurn } from "@/lib/learning/http/turn";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { LiveProviderAdapter, MockProviderAdapter } from "@/lib/learning/providers/adapter";
import { assembleTeachingLesson, compileTeachingProgram } from "@/lib/learning/providers/teaching-compiler";
import { sealSession } from "@/lib/learning/server-state";
import { teachingSceneSvg, type TeachingShape } from "@/lib/learning/teaching-scene";
import type { ClientSessionState, IllustrationLesson, LearningSession, LearningTurnInput } from "@/lib/learning/types";
import { genericProgram } from "./fixtures/general-teaching";

const garden = "一个长方形菜园，长18米，宽12米。如果长增加4米，宽不变。1.新菜园的周长是多少米？2.新菜园的面积比原来增加了多少平方米？";
const cases = [
  [garden, "新周长68米，面积增加48平方米", "rectangle"],
  ["长方形长8米，宽3米，求周长和面积。", "周长22米，面积24平方米", "rectangle"],
  ["长方形长1.5米，宽20厘米，求面积。", "面积0.3平方米", "rectangle"],
  ["每盒有6支铅笔，4盒一共有多少支？", "24支", "groups"],
  ["每袋有9颗糖，3袋共有多少颗？", "27颗", "groups"],
  ["24本书平均分给6人，每人多少本？", "4本", "sharing"],
  ["35个苹果平均分成5份，每份有多少个？", "7个", "sharing"],
  ["一辆车3小时行驶180千米，照这样的速度，5小时行驶多少千米？", "300千米", "rate"],
  ["一辆车4小时行驶240千米，速度不变，2小时行驶多少千米？", "120千米", "rate"],
  ["小明有12本书，小红有8本书，两人相差多少本？", "4本", "comparison"],
  ["小明有0.1元，小红有0.2元，一共有多少元？", "0.3元", "comparison"],
  ["有24个苹果，其中的3/4是多少个？", "18个", "fraction"],
] as const;

describe("可核验分步演示", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });
  it.each(cases)("跨题型：%s", (text, answer, template) => {
    const s = sessionFor(text, answer), p = compileTeachingProgram(s), lesson = assembleTeachingLesson(s, p);
    expect(p.template).toBe(template);
    expect(lesson.frameCount).toBeGreaterThanOrEqual(2);
    expect(lesson.frameCount).toBeLessThanOrEqual(6);
    expect(new Set(lesson.frames.map((f) => teachingSceneSvg(f.scene!))).size).toBe(lesson.frameCount);
    expect(lesson.frames.every((f) => f.scene?.worldId === p.worldId)).toBe(true);
    expect(lesson.frames.at(-1)!.calculation).toContain(p.results.at(-1)!.value);
  });
  it("真实18:12:4尺寸在步骤间保持一致，周长只描外边界", () => {
    const lesson = lessonFor(garden, "68米，48平方米");
    const shapes = lesson.frames[1].scene!.shapes;
    const original = shapes.find((s) => s.id === "original") as Extract<TeachingShape, { kind: "rect" }>;
    const added = shapes.find((s) => s.id === "added") as Extract<TeachingShape, { kind: "rect" }>;
    expect(original.width / original.height).toBeCloseTo(18 / 12);
    expect(added.width / original.width).toBeCloseTo(4 / 18);
    expect(added.height).toBe(original.height);
    expect(added.x).toBe(original.x + original.width);
    for (const frame of lesson.frames) expect(frame.scene!.shapes.find((s) => s.id === "original")).toEqual(original);
    expect(lesson.frames.at(-1)!.calculation).toContain("4 × 12 = 48");
    expect(lesson.frames[2].calculation).toContain("内部接缝不计入周长");
  });
  it("改变题目参数改变图形；改变帧序号不改变数学尺寸", () => {
    const a = lessonFor(garden, "68米，48平方米"), b = lessonFor(garden.replace("增加4米", "增加6米"), "72米，72平方米");
    expect(a.frames[1].scene!.shapes).not.toEqual(b.frames[1].scene!.shapes);
    const s = sessionFor(garden, "68米，48平方米");
    const merged = assembleTeachingLesson(s, compileTeachingProgram(s), { groups: [["given", "extend"], ["perimeter"], ["area"]] });
    expect(merged.frames[0].scene!.shapes).toEqual(a.frames[1].scene!.shapes);
  });
  it("等份图数量真实，分数图只高亮分子指定的份数", () => {
    expect(lessonFor(cases[3][0], cases[3][1]).frames[0].scene!.shapes.filter((s) => s.kind === "rect")).toHaveLength(4);
    const parts = lessonFor(cases[11][0], cases[11][1]).frames.at(-1)!.scene!.shapes;
    expect(parts.filter((s) => s.kind === "rect")).toHaveLength(4);
    expect(parts.filter((s) => s.kind === "rect" && s.color === "change")).toHaveLength(3);
  });
  it.each(["圆的半径3米求面积", "长方形长18米宽12米，长增加4米宽增加2米，求周长", "3小时行驶180千米，加速后5小时行驶多少千米", "24个苹果平均分给5人，每人多少个还剩几个", "每盒6支，4盒，又买3支，一共多少支"])("未知或复杂条件拒绝：%s", (text) => {
    expect(() => compileTeachingProgram(sessionFor(text, "68米，48平方米，24支，300千米"))).toThrow();
  });
  it("串题答案和错误单位不允许完成", () => {
    expect(() => compileTeachingProgram(sessionFor(garden, "300千米"))).toThrow("核对一致");
    expect(() => compileTeachingProgram(sessionFor(garden, "68平方米，48米"))).toThrow("核对一致");
    expect(() => compileTeachingProgram(sessionFor(garden, "-68米，48平方米"))).toThrow("核对一致");
  });
  it("模型可以合并连续步骤，不能跳步、重复或调序", () => {
    const s = sessionFor(garden, "68米，48平方米"), p = compileTeachingProgram(s);
    expect(assembleTeachingLesson(s, p).frameCount).toBe(4);
    expect(assembleTeachingLesson(s, p, { groups: [["given", "extend"], ["perimeter"], ["area"]] }).frameCount).toBe(3);
    expect(() => assembleTeachingLesson(s, p, { groups: [["given", "extend"], ["perimeter", "area"]] })).toThrow("对应画面");
    for (const groups of [[["given"], ["area"]], [["given", "given"], ["perimeter", "area"]], [["area"], ["given", "extend"], ["perimeter"]]]) expect(() => assembleTeachingLesson(s, p, { groups })).toThrow();
  });
  it("标签转义", () => {
    const scene = lessonFor(garden, "68米，48平方米").frames[0].scene!;
    scene.shapes.push({ id: "unsafe", kind: "label", x: 0, y: 0, text: '<script>alert("x")</script>' });
    expect(teachingSceneSvg(scene)).not.toContain("<script>");
  });
  it("真实适配器请求通用协议，计算与采样在隔离进程完成", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => Response.json({ choices: [{ message: { content: String(init?.body).includes("独立的原题") ? '{"verdict":"pass","issues":[]}' : JSON.stringify(genericProgram(garden)) } }] }));
    const onFrame = vi.fn(), lesson = await live(fetcher).generateIllustrationLesson(sessionFor(garden, "68米，48平方米"), onFrame);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(lesson.frameCount).toBe(2);
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(lesson)).not.toContain("错误");
    expect(JSON.stringify(lesson)).not.toContain("server-only-key");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("images");
    const auditBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(auditBody.max_tokens).toBe(350);
    expect(JSON.stringify(auditBody)).not.toContain("submit_teaching_program");
    expect(lesson.generationMetrics?.auditCount).toBe(1);
  });
  it("通用规划35秒超时无模板兜底；外部取消立即停止", async () => {
    vi.useFakeTimers();
    const fetcher: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener("abort", abort, { once: true });
    });
    const s = sessionFor(garden, "68米，48平方米"), onFrame = vi.fn();
    const pending = expect(live(fetcher).generateIllustrationLesson(s, onFrame)).rejects.toThrow("35秒");
    await vi.advanceTimersByTimeAsync(35000);
    await pending;
    expect(onFrame).not.toHaveBeenCalled();
    onFrame.mockClear();
    const c = new AbortController();
    const rejection = expect(live(fetcher).generateIllustrationLesson(s, onFrame, c.signal)).rejects.toMatchObject({ name: "AbortError" });
    c.abort(); await rejection;
    expect(onFrame).not.toHaveBeenCalled();
  });
  it("未知题型进入通用模型链路，失败最多修复一次", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ choices: [{ message: { content: "{}" } }] }));
    await expect(live(fetcher).generateIllustrationLesson(sessionFor("三角形求角度", "30度"), vi.fn())).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("生成完成签发凭证，关闭才进入回忆，伪造凭证拒绝", async () => {
    const s = sessionFor(garden, "68米，48平方米"), body = await turn(s);
    const lesson = event<IllustrationLesson>(body, "illustration.complete"), next = event<ClientSessionState>(body, "flow.update");
    expect(lesson.receipt).toBeTruthy(); expect(next.session.flow.viewedSolution).toBe(false);
    const ack = { type: "acknowledge_illustration" as const, gateId: next.session.flow.activeGate!.id, receipt: lesson.receipt! };
    const final = event<ClientSessionState>(await (await postTurn(request(next.stateToken, ack))).text(), "flow.update");
    expect(final.session.flow.viewedSolution).toBe(true); expect(final.session.flow.activeGate?.kind).toBe("solution_review");
    expect(await (await postTurn(request(next.stateToken, { ...ack, receipt: "fake" }))).text()).toContain("凭证无效");
  });
  it("失败不会产生完成凭证或推进学习状态", async () => {
    const s = sessionFor(garden, "68米，48平方米");
    vi.spyOn(MockProviderAdapter.prototype, "generateIllustrationLesson").mockRejectedValue(new Error("没有匹配的演示"));
    const body = await turn(s);
    expect(body).not.toContain("event: illustration.complete"); expect(body).not.toContain("event: flow.update");
    expect(s.flow.viewedSolution).toBe(false);
  });
  it("缓存在JSON往返后保持一致，并拒绝跨题与无凭证结果", () => {
    const s = sessionFor(garden, "68米，48平方米"); s.problem.learnerBand = undefined;
    const lesson = { ...assembleTeachingLesson(s, compileTeachingProgram(s)), receipt: "signed" }, browser = JSON.parse(JSON.stringify(s));
    expect(illustrationFingerprint(browser)).toBe(illustrationFingerprint(s)); expect(canReuseIllustration(lesson, browser)).toBe(true);
    expect(canReuseIllustration({ ...lesson, receipt: undefined }, s)).toBe(false);
    expect(canReuseIllustration(lesson, { ...s, requestId: "another" })).toBe(false);
  });
  it("通用演示1至10帧都能复用，仍拒绝跨题和重复帧", () => {
    const s = sessionFor(garden, "68米，48平方米");
    const base = { ...assembleTeachingLesson(s, compileTeachingProgram(s)), receipt: "signed" };
    for (const count of [1, 3, 7, 10]) {
      const lesson = { ...base, frameCount: count, frames: Array.from({ length: count }, (_, i) => ({ ...base.frames[0], id: `frame-${i + 1}`, index: i + 1 })) };
      expect(canReuseIllustration(lesson, s)).toBe(true);
      expect(canReuseIllustration(lesson, { ...s, requestId: "different" })).toBe(false);
    }
  });
});

function sessionFor(text: string, answer: string): LearningSession {
  const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
  return { ...base, problem: { ...base.problem, text, visualContext: undefined }, nodes: base.nodes.map((node) => node.id === base.rootNodeId ? { ...node, check: { ...node.check, answer, explanation: `根据题目条件计算，${answer}。` } } : node), flow: { ...base.flow, stage: "core_explanation", activeGate: understandingGate("核心思路听懂了吗？") } };
}
function lessonFor(text: string, answer: string) { const s = sessionFor(text, answer); return assembleTeachingLesson(s, compileTeachingProgram(s)); }
function live(fetcher: typeof fetch) { return new LiveProviderAdapter({ id: "doubao", label: "豆包", apiKey: "server-only-key", modelId: "test", baseUrl: "https://text.invalid/chat", protocol: "chat-completions", mock: false }, fetcher); }
function request(stateToken: string, input: LearningTurnInput) { return new Request("http://localhost/api/learning/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stateToken, input }) }); }
async function turn(s: LearningSession) { return (await postTurn(request(sealSession(s), { type: "choose", gateId: s.flow.activeGate!.id, choice: "view_illustration" }))).text(); }
function event<T>(body: string, name: string): T { const block = body.split("\n\n").find((item) => item.startsWith(`event: ${name}\n`)); if (!block) throw new Error(`missing ${name}: ${body.slice(0, 500)}`); return JSON.parse(block.match(/^data: (.+)$/m)?.[1] ?? "null") as T; }
