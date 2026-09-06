import type { Element, Root, RootContent } from "hast";

/** Runs after KaTeX. Preserve MathML/copy content; only wrap the visual unit. */
export function rehypeReadableMath() {
  return (tree: Root) => {
    function walk(parent: Root | Element) {
      parent.children = parent.children.map((node): RootContent => {
        if (node.type !== "element") return node;
        const classes = node.properties.className;
        const names = Array.isArray(classes) ? classes : [];
        if (names.includes("katex-error")) {
          return { type: "element", tagName: "span", properties: { className: ["learning-math-error"], role: "note" }, children: [
            { type: "text", value: "公式格式需核对：" },
            { type: "element", tagName: "code", properties: {}, children: node.children },
          ] };
        }
        if (names.includes("katex")) {
          const formula = findFormula(node);
          const visibleLength = formula.replace(/\\[A-Za-z]+|[{}\s]/g, "").length;
          const long = visibleLength > 32 || (visibleLength > 18 && (formula.match(/=/g)?.length ?? 0) > 1);
          return { type: "element", tagName: "span", properties: { className: ["learning-math", ...(long ? ["learning-math--long"] : [])], tabIndex: 0, title: "公式；较长时可左右滑动查看" }, children: [node] };
        }
        walk(node);
        return node;
      });
    }
    walk(tree);
  };
}

function findFormula(node: Element): string {
  if (node.tagName === "annotation") return node.children.map((child) => child.type === "text" ? child.value : "").join("");
  for (const child of node.children) {
    if (child.type === "element") { const formula = findFormula(child); if (formula) return formula; }
  }
  return "";
}
