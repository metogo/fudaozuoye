import { describe, expect, it } from "vitest";
import { BOARD_CACHE_VERSION, isStoredBoardCache, isStoredBoardLesson } from "@/lib/learning/board-cache-schema";

const blocks = [
  { id: "orient", label: "找到条件", content: "先看题干条件。", tone: "plain" },
  { id: "reason", label: "建立关系", content: "再用关系求解。", tone: "key" },
];

const lesson = {
  title: "分步讲解", subtitle: "围绕原题", returnLabel: "回到对话", layout: "steps", blocks, annotations: [],
  plan: {
    version: 2, contentRevision: 2, subject: "math", discipline: "math", thesis: "先抓住题干中的数量关系再列式求解。", learningGoal: "理解数量关系", sourceMessageIds: ["m1"],
    scenes: [
      { ...blocks[0], title: blocks[0].label, intent: "extract", sourceMessageIds: ["m1"], role: "orient", purpose: "定位本题需要使用的已知条件", why: "已知条件决定后续如何建立数量关系。", selfCheck: "能说出题干给了什么。", move: "提取条件" },
      { ...blocks[1], title: blocks[1].label, intent: "derive", sourceMessageIds: ["m1"], role: "reason", purpose: "把已知条件连接成可计算的关系", why: "关系建立后才能按照同一规则完成推导。", selfCheck: "能写出对应关系。", move: "建立关系" },
    ],
  },
};

describe("板书缓存结构", () => {
  it("接受完整的本地板书和带定位信息的缓存", () => {
    expect(isStoredBoardLesson(lesson)).toBe(true);
    expect(isStoredBoardCache({ version: BOARD_CACHE_VERSION, requestId: "r", lesson }, "r")).toBe(true);
  });

  it("拒绝错题缓存、重复区块和不完整的原生教学场景", () => {
    expect(isStoredBoardCache({ version: 1, requestId: "r", lesson }, "r")).toBe(false);
    expect(isStoredBoardCache({ version: BOARD_CACHE_VERSION, requestId: "other", lesson }, "r")).toBe(false);
    expect(isStoredBoardLesson({ ...lesson, blocks: [blocks[0], { ...blocks[0] }] })).toBe(false);
    expect(isStoredBoardLesson({ ...lesson, plan: { ...lesson.plan, scenes: lesson.plan.scenes.map(({ why, ...scene }) => scene) } })).toBe(false);
  });

  it("校验语义图形的节点与边必须对应本板书的有效标识", () => {
    const visual = { kind: "concept_graph", title: "关系", evidence: "题干", caption: "关系图", direction: "top-down", nodes: [{ id: "a", label: "条件", role: "given" }, { id: "b", label: "结论", role: "step" }], edges: [{ from: "a", to: "b" }] };
    expect(isStoredBoardLesson({ ...lesson, plan: { ...lesson.plan, scenes: lesson.plan.scenes.map((scene, index) => index ? scene : { ...scene, visual }) } })).toBe(true);
    expect(isStoredBoardLesson({ ...lesson, plan: { ...lesson.plan, scenes: lesson.plan.scenes.map((scene, index) => index ? scene : { ...scene, visual: { ...visual, edges: [{ from: "a", to: "missing" }] } }) } })).toBe(false);
  });

  it("恢复各种可渲染的语义图，并拒绝结构不完整的图", () => {
    const withVisual = (visual: object) => isStoredBoardLesson({ ...lesson, plan: { ...lesson.plan, scenes: lesson.plan.scenes.map((scene, index) => index ? scene : { ...scene, visual }) } });
    expect(withVisual({ kind: "formula_chain", title: "变形", evidence: "题干", caption: "推导", steps: [
      { id: "a", expression: "x+1", explanation: "代入条件" }, { id: "b", expression: "2", explanation: "得到结论" },
    ] })).toBe(true);
    expect(withVisual({ kind: "function_plot", title: "函数", evidence: "题干", caption: "图像", domain: [-2, 2], series: [
      { id: "f", label: "y=x", coefficients: [1, 0], color: "emerald" },
    ] })).toBe(true);
    expect(withVisual({ kind: "evidence_chain", title: "依据", evidence: "题干", caption: "链路", links: [
      { id: "a", quote: "已知", meaning: "条件" }, { id: "b", quote: "所以", meaning: "结论" },
    ] })).toBe(true);
    expect(withVisual({ kind: "timeline", title: "过程", evidence: "题干", caption: "顺序", events: [
      { id: "a", time: "开始", event: "列式" }, { id: "b", time: "结束", event: "求值" },
    ] })).toBe(true);
    expect(withVisual({ kind: "process_flow", title: "流程", evidence: "题干", caption: "步骤", steps: [
      { id: "a", label: "条件", evidence: "题干" }, { id: "b", label: "结论", evidence: "关系" },
    ] })).toBe(true);
    expect(withVisual({ kind: "comparison_matrix", title: "比较", evidence: "题干", caption: "对照", columns: ["左", "右"], rows: [
      { id: "a", aspect: "方法", left: "代入", right: "消元" },
    ] })).toBe(true);
    expect(withVisual({ kind: "formula_chain", title: "变形", evidence: "题干", caption: "推导", steps: [{ id: "a", expression: "x", explanation: "仅一步" }] })).toBe(false);
    expect(withVisual({ kind: "function_plot", title: "函数", evidence: "题干", caption: "图像", domain: [0, Infinity], series: [] })).toBe(false);
  });

  it("恢复几何图及兼容旧版视觉缓存", () => {
    const geometry = { kind: "geometry_model", title: "直角三角形", evidence: "两直角边", caption: "边的关系", points: [
      { id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" },
    ], objects: [
      { type: "segment", from: "a", to: "b" }, { type: "right_angle", vertex: "a", from: "b", to: "c" }, { type: "circle", center: "a", radius: 2 },
    ] };
    const legacy = { kind: "geometry", title: "旧图", evidence: "题干", caption: "示意", elements: [{ type: "line", x: 1, y: 2 }] };
    expect(isStoredBoardLesson({ ...lesson, visual: legacy })).toBe(true);
    expect(isStoredBoardLesson({ ...lesson, visual: { ...legacy, elements: [{ type: "line", x: "1", y: 2 }] } })).toBe(false);
    expect(isStoredBoardLesson({ ...lesson, plan: { ...lesson.plan, scenes: lesson.plan.scenes.map((scene, index) => index ? scene : { ...scene, visual: geometry }) } })).toBe(true);
    expect(isStoredBoardLesson({ ...lesson, plan: { ...lesson.plan, scenes: lesson.plan.scenes.map((scene, index) => index ? scene : { ...scene, visual: { ...geometry, objects: [{ type: "circle", center: "a", through: "missing" }] } }) } })).toBe(false);
  });
});
