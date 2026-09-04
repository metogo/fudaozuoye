import { describe, expect, it } from "vitest";
import { mathTreeToText, type CopyMathNode } from "../lib/learning/copy-math-text";

const node = (localName: string, ...children: CopyMathNode[]): CopyMathNode => ({ localName, children, textContent: null });
const token = (textContent: string): CopyMathNode => ({ localName: "mi", children: [], textContent });

describe("公式复制线性表达", () => {
  it("保留复合底数和嵌套分式优先级", () => {
    const sum = node("mrow", token("a"), token("+"), token("b"));
    expect(mathTreeToText(node("msup", sum, token("2")), null)).toBe("(a+b)²");
    expect(mathTreeToText(node("msup", node("mrow", token("x"), token("y")), token("2")), null)).toBe("(xy)²");
    expect(mathTreeToText(node("mfrac", token("a"), node("mfrac", token("b"), token("c"))), null)).toBe("((a) / (((b) / (c))))");
    expect(mathTreeToText(node("mrow", token("a"), node("mfrac", token("b"), token("c")), token("d")), null)).toBe("a((b) / (c))d");
  });
  it("数字脚标可读，字母和复合脚标明确界定", () => {
    expect(mathTreeToText(node("msub", token("S"), token("11")), null)).toBe("S₁₁");
    expect(mathTreeToText(node("msubsup", token("x"), token("n"), token("2")), null)).toBe("x_(n)²");
  });
  it("根号可读，矩阵和分段完整保留源式以避免误判对齐语义", () => {
    expect(mathTreeToText(node("msqrt", token("x+1")), null)).toBe("√(x+1)");
    expect(mathTreeToText(node("mroot", token("x"), token("3")), null)).toBe("root(3, x)");
    const row = (a: string, b: string) => node("mtr", node("mtd", token(a)), node("mtd", token(b)));
    const matrix = "\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}";
    expect(mathTreeToText(node("mtable", row("1", "2"), row("3", "4")), matrix)).toBe(`\\(${matrix}\\)`);
    const cases = "\\begin{cases}x&x>0\\\\0&x\\le0\\end{cases}";
    expect(mathTreeToText(node("mrow", token("{"), node("mtable", row("x", "x>0"), row("0", "x≤0"))), cases)).toBe(`\\(${cases}\\)`);
  });
  it("未知结构完整保留源表达，不拼接错误数学含义", () => {
    expect(mathTreeToText(node("mover", token("x"), token("→")), "\\vec{x}")).toBe("\\(\\vec{x}\\)");
    expect(mathTreeToText(null, "x^2")).toBe("\\(x^2\\)");
    expect(() => mathTreeToText(node("unknown", token("x")), null)).toThrow("不支持");
  });
  it("semantics只复制表达，不重复源代码", () => {
    expect(mathTreeToText(node("semantics", token("x"), node("annotation", token("x"))), null)).toBe("x");
  });
  it("函数名与变量之间保留分隔", () => {
    expect(mathTreeToText(node("mrow", token("sin"), node("mspace"), token("x")), null)).toBe("sin x");
    expect(mathTreeToText(node("mrow", token("a"), token("\u2062"), token("b")), null)).toBe("a × b");
    expect(mathTreeToText(node("mrow", token("a"), token("\u2063"), token("b")), null)).toBe("a, b");
    expect(mathTreeToText(node("mrow", token("2"), token("\u2064"), token("x")), null)).toBe("2 + x");
  });
  it("无横线组合数不能被改成除法", () => {
    const binomial = Object.assign(node("mfrac", token("5"), token("2")), {
      getAttribute: (name: string) => name === "linethickness" ? "0px" : null,
    });
    expect(mathTreeToText(binomial, "\\binom{5}{2}")).toBe("\\(\\binom{5}{2}\\)");
  });
  it("保留黑板体集合及粗体向量的区别", () => {
    for (const variant of ["double-struck", "bold", "normal"]) {
      const styled = Object.assign(token("R"), { getAttribute: (name: string) => name === "mathvariant" ? variant : null });
      expect(mathTreeToText(node("mrow", token("x∈"), styled), "x\\in\\mathbb{R}")).toBe("\\(x\\in\\mathbb{R}\\)");
    }
  });
});
