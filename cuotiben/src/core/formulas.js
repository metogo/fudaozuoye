// Protect escaped currency and adjacent prices in pasted notices.
const delimiter =
  /\\\$|\$\d[\d,.]*(?=\s+[A-Za-z]{2,}\b|[;:!?，。；：]|\s*(?:\n|$))|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]+?)\$(?!\d)/g;
export function formulaParts(text) {
  const result = [];
  let offset = 0;
  for (const match of text.matchAll(delimiter)) {
    if (offset < match.index) result.push({ text: text.slice(offset, match.index) });
    const [, block, bracket, paren, inline] = match;
    if (block || bracket || paren || inline)
      result.push({ formula: block || bracket || paren || inline, display: Boolean(block || bracket) });
    else result.push({ text: match[0].startsWith('\\') ? '$' : match[0] });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) result.push({ text: text.slice(offset) });
  return result;
}
