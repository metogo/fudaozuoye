import type { GeneralTeachingProgram } from "@/lib/learning/teaching-program";
export function genericProgram(quote = "已知a=6"): GeneralTeachingProgram {
  return { version: 2, title: "关系与推导", conditions: [{ id: "c1", quote }], symbols: ["x"], variables: [{ name: "a", expression: "6", refs: ["c1"] }], steps: [
    { id: "s1", title: "已知关系", explanation: "从已知数量出发。", refs: ["c1", "a"], schematic: false, bounds: [-1, -1, 8, 8], checks: [{ kind: "numeric", left: "a*2", right: "12" }], objects: [{ id: "edge", kind: "line", points: [["0", "0"], ["a", "0"]] }] },
    { id: "s2", title: "公式变换", explanation: "两种写法表达相同的多项式关系。", refs: ["s1"], schematic: true, bounds: [-1, -1, 8, 8], checks: [{ kind: "identity", left: "(x-3)^2-3", right: "x^2-6*x+6" }], objects: [{ id: "axis", kind: "axes", points: [] }, { id: "curve", kind: "curve", points: [], expression: "x^2-6*x+6", domain: ["0", "6"] }] },
  ] };
}
