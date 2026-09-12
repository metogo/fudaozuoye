import type { Root, PhrasingContent } from "mdast";

const sectionTitle = /^(结论|最终答案|最后结果|答案与结论|结果与结论)$/;
const numberedAnswer = /^[（(]\d+[)）]\s*\S/;
const plainText = (nodes: PhrasingContent[]): string => nodes.map((node) =>
  "children" in node ? plainText(node.children as PhrasingContent[]) : "value" in node ? node.value : "",
).join("");

// Split only prose between answers. Math, code and their source stay intact.
function separateAnswers(nodes: PhrasingContent[]): PhrasingContent[] {
  return nodes.flatMap((node): PhrasingContent[] => {
    if (node.type === "strong" || node.type === "emphasis") {
      node.children = separateAnswers(node.children);
    }
    if (node.type !== "text") return [node];
    const parts = node.value.split(/(?<=[；;。])\s*(?=[（(]\d+[)）])/u);
    if (parts.length === 1) return [node];
    return parts.flatMap((value, index): PhrasingContent[] => [
      ...(index ? [{ type: "break" as const }] : []), { type: "text", value },
    ]);
  });
}

/** A Markdown underline after an answer must not turn it into a large title. */
export function remarkConclusionLayout({ source }: { source: string }) {
  return (tree: Root) => {
    let conclusionLevel = 0;
    tree.children = tree.children.map((node) => {
      if (node.type === "heading") {
        const title = plainText(node.children).trim().replace(/[：:]$/, "");
        if (sectionTitle.test(title)) { conclusionLevel = node.depth; return node; }
        if (/^(易错提醒|易错题型|易错点|常见误区|解题思路|分步推导)$/.test(title)) {
          conclusionLevel = 0;
          return node;
        }
        if (conclusionLevel) {
          const raw = source.slice(node.position?.start.offset, node.position?.end.offset);
          const underlined = /\n[ \t]*(?:-{2,}|=+)[ \t]*$/.test(raw);
          if (underlined || numberedAnswer.test(title)) {
            return { type: "paragraph", children: separateAnswers(node.children), position: node.position };
          }
          if (node.depth <= conclusionLevel) conclusionLevel = 0;
        }
      }
      if (conclusionLevel && node.type === "paragraph" && numberedAnswer.test(plainText(node.children).trim())) {
        node.children = separateAnswers(node.children);
      }
      return node;
    });
  };
}
