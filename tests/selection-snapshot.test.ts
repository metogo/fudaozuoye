// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { selectionSnapshot } from "@/lib/learning/selection-snapshot";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichLearningText } from "@/components/rich-learning-text";
afterEach(() => { window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); });
it("引用角度和分式保留公式源码，预览重新渲染而不泄露LaTeX或重复文字", () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(createElement(RichLearningText, { text: String.raw`从\(\angle ACB = 90^\circ\)出发，再看\(\frac{a}{b}\)。` }));
  document.body.append(root);
  const range = document.createRange(); range.selectNodeContents(root); window.getSelection()!.addRange(range);
  const quote = selectionSnapshot(root)!.text;
  expect(quote).toContain(String.raw`\(\angle ACB = 90^\circ\)`);
  const preview = document.createElement('div');
  preview.innerHTML = renderToStaticMarkup(createElement(RichLearningText, { text: quote, compact: true }));
  expect(preview.querySelectorAll('.katex')).toHaveLength(2);
  expect(preview.querySelector('.katex-error')).toBeNull();
  preview.querySelectorAll('.katex-mathml').forEach(node => node.remove());
  expect(preview.textContent).not.toContain('\\angle');
  expect(preview.textContent).not.toContain('\\frac');
});
it("引用仅绑定一条讲解，跨消息和混入控件时拒绝", () => {
  const root = document.createElement("div");
  root.innerHTML = '<article class="chat-message"><div class="copyable-learning-text__prose">第一句<span>第二句</span></div></article><article class="chat-message"><div class="copyable-learning-text__prose">其他讲解</div></article>';
  document.body.append(root);
  const nodes = root.querySelectorAll(".copyable-learning-text__prose"), range = document.createRange();
  range.setStart(nodes[0].firstChild!, 0); range.setEnd(nodes[0].querySelector("span")!.firstChild!, 3);
  window.getSelection()!.addRange(range);
  expect(selectionSnapshot(root)?.text).toContain("第一句第二句");
  range.setEnd(nodes[1].firstChild!, 2); expect(selectionSnapshot(root)).toBeNull();
  nodes[0].innerHTML = '第一句<button>复制</button>第二句'; range.selectNodeContents(nodes[0]);
  expect(selectionSnapshot(root)).toBeNull();
});
