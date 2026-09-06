import type { Node } from "unist";
import { emphasisRanges, type LearningEmphasis } from "./learning-emphasis";

interface TreeNode extends Node { value?: string; children?: TreeNode[]; data?: Record<string, unknown> }

/** Before KaTeX: wrap whole math nodes, never edit their TeX or MathML. */
export function remarkLearningEmphasis(options: { source: string; marks: LearningEmphasis[] }) {
  return (tree: TreeNode) => {
    const ranges = emphasisRanges(options.source, options.marks);
    const used = new Set<number>();
    function walk(parent: TreeNode) {
      if (!parent.children || ["heading", "code", "inlineCode", "link", "image", "html"].includes(parent.type)) return;
      parent.children = parent.children.flatMap((node): TreeNode[] => {
        const start = node.position?.start.offset, end = node.position?.end.offset;
        const match = ranges.findIndex((range, i) => !used.has(i) && start !== undefined && end !== undefined && (
          range.mark.kind === "math" ? ["math", "inlineMath"].includes(node.type) && node.value?.trim() === range.mark.target && start === range.start && end === range.end
            : node.type === "text" && range.start >= start && range.end <= end && node.value?.includes(range.mark.target)
        ));
        if (match < 0) { walk(node); return [node]; }
        const { mark } = ranges[match];
        used.add(match);
        const wrap = (children: TreeNode[]): TreeNode => ({ type: "learningEmphasis", data: { hName: node.type === "math" ? "div" : "mark", hProperties: { className: ["learning-emphasis", `learning-emphasis--${mark.kind}`] } }, children });
        if (mark.kind === "math") return [wrap([node])];
        const index = node.value!.indexOf(mark.target);
        return [
          ...(index ? [{ type: "text", value: node.value!.slice(0, index) }] : []),
          wrap([{ type: "text", value: mark.target }]),
          ...(index + mark.target.length < node.value!.length ? [{ type: "text", value: node.value!.slice(index + mark.target.length) }] : []),
        ];
      });
    }
    walk(tree);
  };
}
