import { readableFormula } from "./copy-math-text";

export interface LearningClipboardContent {
  html: string;
  text: string;
}

const omittedContent = "button, input, textarea, select, .streaming-indicator, [data-copy-exclude]";
const proseStyles = [
  "font-family", "font-size", "font-weight", "font-style", "line-height", "color",
  "text-align", "text-decoration", "white-space", "margin-top", "margin-bottom",
  "padding-left", "border-left", "list-style-type", "list-style-position",
] as const;

function plainText(node: Node, protect: (text: string) => string, listDepth = 0): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  if (element.matches(omittedContent)) return "";
  if (element.tagName === "PRE") return `\n\n${protect(element.textContent ?? "")}\n\n`;
  if (element.tagName === "CODE") return protect(element.textContent ?? "");
  if (element.matches(".katex")) {
    const formula = readableFormula(element);
    return element.closest(".katex-display") ? `\n${formula}\n` : formula;
  }
  if (element.tagName === "BR") return "\n";
  if (element.tagName === "HR") return "\n\n---\n\n";
  const isList = element.tagName === "UL" || element.tagName === "OL";
  const childDepth = listDepth + (isList ? 1 : 0);
  const content = Array.from(element.childNodes, (child) => plainText(child, protect, childDepth)).join("");
  if (element.tagName === "LI") {
    const list = element.parentElement;
    const index = list ? Array.from(list.children).indexOf(element) : 0;
    const start = Number(list?.getAttribute("start") ?? 1);
    const marker = list?.tagName === "OL" ? `${start + index}.` : "•";
    const indent = "  ".repeat(Math.max(0, listDepth - 1));
    return `\n${indent}${marker} ${content.trim()}\n`;
  }
  if (isList) return `\n${content}\n`;
  if (/^(P|H[1-6]|BLOCKQUOTE|DIV|SUMMARY|DETAILS)$/.test(element.tagName)) return `\n\n${content.trim()}\n\n`;
  return content;
}

/** Keep code verbatim while normalizing only the surrounding prose's block separators. */
export function learningPlainText(source: HTMLElement): string {
  let prefix = "\uE000code:";
  while (source.textContent?.includes(prefix)) prefix += ":";
  const fragments: string[] = [];
  const protect = (text: string) => {
    const marker = `${prefix}${fragments.length}\uE001`;
    fragments.push(text);
    return marker;
  };
  const prose = plainText(source, protect).replace(/\n{3,}/g, "\n\n").trim();
  return prose.replace(new RegExp(`${prefix}(\\d+)\uE001`, "g"), (_, index: string) => fragments[Number(index)]);
}

/** Export only the rendered prose; never put UI controls or KaTeX's twin renderings on the clipboard. */
export function buildLearningClipboardContent(source: HTMLElement): LearningClipboardContent {
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...Array.from(source.querySelectorAll("*"))];
  const copies = [clone, ...Array.from(clone.querySelectorAll("*"))];
  const view = source.ownerDocument.defaultView;
  if (!view) throw new Error("无法读取正文样式");

  originals.forEach((element, index) => {
    const copy = copies[index];
    // Export formulas as readable text, never as positioned spans or MathML.
    if (!element.closest(".katex")) {
      const computed = view.getComputedStyle(element);
      const style = proseStyles.map((property) => `${property}:${computed.getPropertyValue(property)}`).join(";");
      copy.setAttribute("style", style);
    }
    copy.removeAttribute("class");
    copy.removeAttribute("id");
    copy.removeAttribute("tabindex");
  });

  // Query source classes before their copies were stripped.
  originals.forEach((element, index) => {
    if (element.matches(omittedContent)) copies[index].remove();
    if (!element.matches(".katex")) return;
    const formula = source.ownerDocument.createElement("span");
    formula.textContent = readableFormula(element);
    formula.style.whiteSpace = "normal";
    copies[index].replaceWith(formula);
  });

  // A collapsed reading affordance must never hide content in pasted documents.
  originals.forEach((element, index) => {
    if (!element.matches("details.learning-pitfalls")) return;
    const block = source.ownerDocument.createElement("div");
    block.append(...Array.from(copies[index].childNodes));
    const summary = block.querySelector("summary");
    if (summary) { const heading = source.ownerDocument.createElement("h3"); heading.append(...Array.from(summary.childNodes)); summary.replaceWith(heading); }
    copies[index].replaceWith(block);
  });
  return {
    html: clone.outerHTML,
    text: learningPlainText(source),
  };
}

/** A plain-text fallback is reported explicitly, not presented as rich-copy success. */
export async function writeLearningClipboard(content: LearningClipboardContent): Promise<"rich" | "plain"> {
  const clipboard = navigator.clipboard;
  if (!clipboard) throw new Error("当前浏览器无法访问剪贴板");
  if (typeof ClipboardItem !== "undefined" && typeof clipboard.write === "function") {
    try {
      await clipboard.write([new ClipboardItem({
        "text/html": new Blob([content.html], { type: "text/html" }),
        "text/plain": new Blob([content.text], { type: "text/plain" }),
      })]);
      return "rich";
    } catch (error) {
      if (typeof clipboard.writeText !== "function") throw error;
    }
  }
  if (typeof clipboard.writeText !== "function") throw new Error("当前浏览器不支持复制");
  await clipboard.writeText(content.text);
  return "plain";
}
