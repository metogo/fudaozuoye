import { describe, expect, it } from "vitest";
import { findMapFocus, mapFocusAncestors } from "@/lib/learning/knowledge-map-preview";
import type { ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";

const nodes = ["速度与路程", "单位量", "乘法的意义", "无关知识"].map((title, i) => ({ id: `n${i}`, title, kind: "concept" }));
const map: ProblemKnowledgeMap = { version: 1, rootId: "core", nodes: nodes.slice(0, 3).map((n, i) => ({ ...n, id: i ? `k${i}` : "core", summary: "", application: "", evidence: "求路程" })), edges: [{ from: "core", to: "k1", kind: "application", reason: "结合使用" }, { from: "k1", to: "k2", kind: "prerequisite", reason: "需要这个基础" }] };
describe("知识脉络入口数据", () => {
  it("只有明确匹配才定位，不猜同义词、不同编号或歧义标题", () => {
    expect(findMapFocus(map.nodes, { title: "单位量" })?.id).toBe("k1");
    expect(findMapFocus(map.nodes, { title: "单位数量" })).toBeUndefined();
    expect(findMapFocus(map.nodes, { title: "单位量", id: "other" })).toBeUndefined();
    expect(findMapFocus([...map.nodes, { ...map.nodes[1], id: "duplicate" }], { title: "单位量" })).toBeUndefined();
    expect([...mapFocusAncestors(map, { title: "乘法的意义" })]).toEqual(["k1", "core"]);
  });
});
