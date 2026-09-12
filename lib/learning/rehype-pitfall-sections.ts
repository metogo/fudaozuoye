import type { Element, ElementContent, Root, RootContent } from "hast";

const headingLevel = (node: RootContent) => node.type === "element" && /^h[1-6]$/.test(node.tagName) ? Number(node.tagName[1]) : 0;
const text = (node: RootContent): string => node.type === "text" ? node.value : node.type === "element" ? node.children.map(text).join("") : "";

/** Fold only an explicit section, retaining its Markdown AST, formulas and emphasis. */
export function rehypePitfallSections({ enabled = false }: { enabled?: boolean } = {}) {
  return (tree: Root) => {
    if (!enabled) return;
    const output: RootContent[] = [];
    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i], level = headingLevel(node);
      const title = text(node).trim().replace(/^\d+[.、)）]\s*/, "").replace(/[：:]$/, "");
      if (!level || !/^(易错题型|易错提醒|易错点|常见误区)$/.test(title)) { output.push(node); continue; }
      const children: ElementContent[] = [];
      while (i + 1 < tree.children.length) {
        const next = tree.children[i + 1], nextLevel = headingLevel(next);
        if (nextLevel && nextLevel <= level) break;
        if (next.type !== "doctype") children.push(next);
        i++;
      }
      output.push({ type: "element", tagName: "details", properties: { className: ["learning-pitfalls"] }, children: [
        { type: "element", tagName: "summary", properties: { className: ["learning-pitfalls-toggle"], "data-selection-exclude": "true" }, children: (node as Element).children },
        { type: "element", tagName: "div", properties: { className: ["learning-pitfalls-body"] }, children },
      ] });
    }
    tree.children = output;
  };
}
