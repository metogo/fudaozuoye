/** A deliberately conservative linear representation, never a visual MathML clipboard. */
export interface CopyMathNode {
  localName: string;
  textContent: string | null;
  children: ArrayLike<CopyMathNode>;
  getAttribute?: (name: string) => string | null;
}

function grouped(node: CopyMathNode, text: string): string {
  const atomic = ["mi", "mn"].includes(node.localName.toLowerCase());
  return atomic && /^[\p{L}\p{N}]+$/u.test(text) ? text : `(${text})`;
}

function script(text: string, upper: boolean): string {
  const alphabet = "0123456789+-=()";
  const replacement = upper ? "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾" : "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎";
  return [...text].every((char) => alphabet.includes(char))
    ? [...text].map((char) => replacement[alphabet.indexOf(char)]).join("")
    : `${upper ? "^" : "_"}(${text})`;
}

function convert(node: CopyMathNode): string {
  const tag = node.localName.toLowerCase();
  if (node.getAttribute?.("mathvariant") || (tag === "mfrac" && node.getAttribute?.("linethickness"))) {
    throw new Error("需保留源公式的数学样式");
  }
  if (["mi", "mn", "mo", "mtext"].includes(tag)) {
    return (node.textContent ?? "").replace(/\u2061/g, " ").replace(/\u2062/g, " × ")
      .replace(/\u2063/g, ", ").replace(/\u2064/g, " + ");
  }
  if (tag === "mspace") return " ";
  if (["annotation", "annotation-xml"].includes(tag)) return "";
  const children = Array.from(node.children);
  if (tag === "semantics") {
    if (!children[0]) throw new Error("空公式");
    return convert(children[0]);
  }
  const values = children.map(convert);
  const requireCount = (count: number) => {
    if (values.length !== count) throw new Error("公式结构不完整");
  };
  if (["math", "mrow", "mstyle"].includes(tag)) return values.join("");
  if (tag === "mfrac") { requireCount(2); return `((${values[0]}) / (${values[1]}))`; }
  if (tag === "msqrt") return `√(${values.join("")})`;
  if (tag === "mroot") { requireCount(2); return `root(${values[1]}, ${values[0]})`; }
  if (tag === "msup" || tag === "msub") {
    requireCount(2);
    return grouped(children[0], values[0]) + script(values[1], tag === "msup");
  }
  if (tag === "msubsup") {
    requireCount(3);
    return grouped(children[0], values[0]) + script(values[1], false) + script(values[2], true);
  }
  // Accents, limits, enclosures and unfamiliar operators must not silently lose meaning.
  throw new Error(`不支持的公式结构: ${tag}`);
}

export function mathTreeToText(math: CopyMathNode | null, latex: string | null): string {
  try {
    if (!math) throw new Error("缺少公式结构");
    const result = convert(math);
    if (!result.trim()) throw new Error("空公式");
    return result;
  } catch (error) {
    if (latex?.trim()) return `\\(${latex}\\)`;
    throw error;
  }
}

export function readableFormula(element: Element): string {
  return mathTreeToText(element.querySelector("math"),
    element.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? null);
}
