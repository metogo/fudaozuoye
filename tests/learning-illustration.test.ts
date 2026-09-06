import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LearningIllustration } from "@/components/learning-illustration";
import { generalTeachingSystem } from "@/lib/learning/providers/general-teaching";
import { teachingAuditSystem } from "@/lib/learning/teaching-audit";
import type { IllustrationFrame, IllustrationLesson } from "@/lib/learning/types";

const frame: IllustrationFrame = {
  id: "frame-1", index: 1, title: "用两根的平方和求斜边", calculation: "两条直角边的平方和为24，因此斜边c=2√6。",
  transition: "机械承接标记", alt: "两根作为直角边的三角形", imageUrl: "data:image/svg+xml;base64,PHN2Zy8+", schematic: true,
  visualNotes: ["曲线 y = x^2，横纵坐标分别缩放。"], sourceQuotes: ["重复来源标记"],
  verification: [{ status: "verified", detail: "内部obj1顶点0数值检查" }, { status: "unknown", detail: "非符号证明诊断" }],
  scene: { version: 1, template: "general", worldId: "world", stageIds: ["step-1"], sourceQuotes: [], shapes: [{ kind: "path", id: "triangle", points: [[0, 0], [6, 0], [0, 4]], closed: true, color: "base" }] },
};
const lesson: IllustrationLesson = { version: 1, requestId: "request", problemFingerprint: "fingerprint", title: "原题图解", frameCount: 2, frames: [frame, { ...frame, id: "frame-2", index: 2, title: "得到结论" }] };
const base = { lesson: null, frames: [], expectedCount: 0, busy: false, loadingLabel: "", error: "", canClose: true, onClose: () => {}, onRegenerate: () => {} };
const render = (props: Partial<Parameters<typeof LearningIllustration>[0]> = {}) => renderToStaticMarkup(createElement(LearningIllustration, { ...base, ...props }));

describe("插画只做完整图解", () => {
  it("旧核验数据保留但不展示，图文及必要图义仍可见", () => {
    const before = JSON.stringify(lesson);
    const html = render({ lesson });
    expect(html).toContain(frame.calculation);
    expect(html).toContain(frame.alt);
    expect(html).toContain("示意图不按比例");
    expect(html).toContain("曲线 y = x^2");
    for (const text of ["核验范围", "内部obj1", "非符号证明", "机械承接标记", "重复来源标记", "步骤承接", "本步引用", "复用", "调用模型", "想一想"]) expect(html).not.toContain(text);
    expect(JSON.stringify(lesson)).toBe(before);
  });
  it("保留关闭、步骤切换、前后导航与重新生成", () => {
    const html = render({ lesson });
    for (const text of ["关闭", "插画步骤", "得到结论", "上一幅", "下一幅", "重新生成"]) expect(html).toContain(text);
    expect(html).toContain('aria-current="step"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>上一幅/);
    expect(html).not.toContain("重试");
  });
  it("纯公式步没有空画布或图示比例提示", () => {
    const html = render({ lesson: { ...lesson, frames: [{ ...frame, scene: { ...frame.scene!, shapes: [] }, visualNotes: [] }] } });
    expect(html).toContain(frame.calculation);
    expect(html).not.toContain("aspect-[4/3]");
    expect(html).not.toContain("示意图不按比例");
  });
  it("加载中不泄露旧进度诊断，也不出现作答控件", () => {
    const html = render({ busy: true, loadingLabel: "内部核验obj1未证明（总预算30秒）", canClose: false });
    expect(html).toContain("正在把原题拆成分步图解");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("内部核验");
    expect(html).not.toContain("总预算");
    expect(html).not.toContain("重试");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>关闭/);
  });
  it.each([
    ["图题校对失败: obj1 sqrt(6) 未通过", "未能生成可靠的图解"],
    ["校对预算超时", "生成用时较长"],
    ["条件不足请补充原图", "部分条件还不清楚"],
    ["fetch failed 503", "无法连接生成服务"],
  ])("失败仍明确展示但不把原始诊断%s交给学生", (error, summary) => {
    const html = render({ error });
    expect(html).toContain('role="alert"');
    expect(html).toContain(summary);
    expect(html).toContain("重试");
    expect(html).not.toContain(error);
    expect(html).not.toContain("重新生成");
  });
  it("生成和现有审核共同要求直接完整图解，不新增调用", () => {
    for (const text of ["覆盖所有小问", "最终结论", "不出现“想一想”", "必要算式", "同一对象、变量和颜色"]) expect(generalTeachingSystem).toContain(text);
    expect(teachingAuditSystem).toContain("不要求学生作答、自算或确认理解");
    expect(teachingAuditSystem).toContain("不因问号本身拒绝");
  });
  it("缺条件时保留具体补充要求，不把诊断后缀交给学生", () => {
    const html = render({ error: "需要补充条件：请补充边AB的长度。（上次核验：obj1非法）" });
    expect(html).toContain("还需要确认：请补充边AB的长度。");
    expect(html).not.toContain("obj1");
  });
});
