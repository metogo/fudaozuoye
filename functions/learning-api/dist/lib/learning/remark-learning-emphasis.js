"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remarkLearningEmphasis = remarkLearningEmphasis;
const learning_emphasis_1 = require("./learning-emphasis");
/** Before KaTeX: wrap whole math nodes, never edit their TeX or MathML. */
function remarkLearningEmphasis(options) {
    return (tree) => {
        const ranges = (0, learning_emphasis_1.emphasisRanges)(options.source, options.marks);
        const used = new Set();
        function walk(parent) {
            if (!parent.children || ["heading", "code", "inlineCode", "link", "image", "html"].includes(parent.type))
                return;
            parent.children = parent.children.flatMap((node) => {
                const start = node.position?.start.offset, end = node.position?.end.offset;
                const match = ranges.findIndex((range, i) => !used.has(i) && start !== undefined && end !== undefined && (range.mark.kind === "math" ? ["math", "inlineMath"].includes(node.type) && node.value?.trim() === range.mark.target && start === range.start && end === range.end
                    : node.type === "text" && range.start >= start && range.end <= end && node.value?.includes(range.mark.target)));
                if (match < 0) {
                    walk(node);
                    return [node];
                }
                const { mark } = ranges[match];
                used.add(match);
                const wrap = (children) => ({ type: "learningEmphasis", data: { hName: node.type === "math" ? "div" : "mark", hProperties: { className: ["learning-emphasis", `learning-emphasis--${mark.kind}`] } }, children });
                if (mark.kind === "math")
                    return [wrap([node])];
                const index = node.value.indexOf(mark.target);
                return [
                    ...(index ? [{ type: "text", value: node.value.slice(0, index) }] : []),
                    wrap([{ type: "text", value: mark.target }]),
                    ...(index + mark.target.length < node.value.length ? [{ type: "text", value: node.value.slice(index + mark.target.length) }] : []),
                ];
            });
        }
        walk(tree);
    };
}
