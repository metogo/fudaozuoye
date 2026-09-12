/** Preserve verbatim evidence: never cut a formula at a newline or size limit. */
export const MAX_EVIDENCE_LENGTH = 4000;

export function splitEvidence(source: string, targetLength = 220): string[] {
  const segments: string[] = [];
  let start = 0;
  let delimiter = "";
  let braces = 0;
  let bareMath = false;
  const append = (end: number) => {
    const text = source.slice(start, end).trim();
    if (text.length > MAX_EVIDENCE_LENGTH) throw new Error("单条题目公式过长，无法完整引用");
    if (text) segments.push(text);
    start = end;
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (delimiter) {
      if (source.startsWith(delimiter, i)) {
        i += delimiter.length - 1;
        delimiter = "";
      } else if (char === "\\") i++;
    } else if (char === "$") {
      delimiter = source[i + 1] === "$" ? "$$" : "$";
      i += delimiter.length - 1;
    } else if (char === "`") {
      delimiter = source.startsWith("```", i) ? "```" : "`";
      i += delimiter.length - 1;
    } else if (char === "\\") {
      if (source[i + 1] === "(") delimiter = "\\)";
      if (source[i + 1] === "[") delimiter = "\\]";
      if (/[A-Za-z]/.test(source[i + 1] ?? "")) bareMath = true;
      i++;
    } else if (char === "{") braces++;
    else if (char === "}") braces = Math.max(0, braces - 1);

    // A bare command can continue through powers, operators and spaces.
    // Its closing brace is not the end of the complete expression.
    if (!delimiter && braces === 0 && /[\u3000-\u9fff。；;\n]/.test(char)) bareMath = false;
    const safeSizeBoundary = !bareMath && /[\s\u3000-\u9fff}]/.test(source[i]) && !/^\s*\{/.test(source.slice(i + 1));
    if (!delimiter && braces === 0 && (/[。；;\n]/.test(source[i]) || (i + 1 - start >= targetLength && safeSizeBoundary))) append(i + 1);
  }
  if (delimiter || braces) throw new Error("原题公式结构不完整，无法完整引用");
  append(source.length);
  return segments;
}
