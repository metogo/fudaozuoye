import { learningPlainText } from "./copy-rich-text";

/** Read again on activation, because selectionchange rendering is debounced. */
export function selectionSnapshot(area: HTMLElement | null) {
  const selected = window.getSelection();
  if (!area || !selected?.rangeCount || selected.isCollapsed) return null;
  const range = selected.getRangeAt(0);
  const element = (node: Node) => node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const start = element(range.startContainer), end = element(range.endContainer);
  const blocked = "button,input,textarea,select,[data-selection-exclude]";
  if (!area.contains(range.startContainer) || !area.contains(range.endContainer) || start?.closest(blocked) || end?.closest(blocked)) return null;
  if (area.querySelector(".chat-message")) {
    const prose = start?.closest(".copyable-learning-text__prose");
    if (!prose || prose !== end?.closest(".copyable-learning-text__prose")) return null;
  }
  const fragment = document.createElement("div");
  fragment.append(range.cloneContents());
  if (fragment.querySelector(blocked)) return null;
  // Quotes are rendered again, unlike clipboard plain text. Preserve the source
  // formula instead of flattening superscripts or duplicating KaTeX's two trees.
  fragment.querySelectorAll(".katex").forEach((formula) => {
    const tex = formula.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (tex) formula.replaceWith(document.createTextNode(`\\(${tex}\\)`));
  });
  let text: string;
  try { text = learningPlainText(fragment); }
  catch {
    // A partial formula may omit MathML: preserve its visible fragment.
    fragment.querySelectorAll(".katex-mathml").forEach(e => e.remove());
    fragment.querySelectorAll(".katex").forEach(e => e.classList.remove("katex"));
    text = learningPlainText(fragment);
  }
  return text ? { text, range } : null;
}
