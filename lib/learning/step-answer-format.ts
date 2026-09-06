// A blank can contain only part of a formula (for example "\\geq 0").
// Unlike prose auto-detection, render that entire fragment as one math span.
// Keep stored/model/handwriting values unchanged; this is display-only.
export function prepareStepAnswerMarkdown(source: string): string {
  const value = source.trim();
  if (!value || /[$`]/.test(value) || /\\[()[\]]/.test(value)) return source;
  const commands = value.match(/\\[A-Za-z]+/g);
  if (!commands?.length) return source;
  const known = /^(?:geq?|leq?|neq?|approx|equiv|in|notin|subset(?:eq)?|supset(?:eq)?|pm|mp|times|div|cdot|frac|dfrac|tfrac|sqrt|Delta|delta|alpha|beta|gamma|theta|pi|infty|left|right|sin|cos|tan|log|ln)$/;
  if (commands.some((command) => !known.test(command.slice(1)))) return source;
  const operands = value.replace(/\\[A-Za-z]+/g, "");
  // Do not reinterpret prose, code, paths or unsupported commands as math.
  if (!/^[A-Za-z0-9\s{}()[\]^_+\-*/=<>|.,!:;≥≤≠−]*$/.test(operands) || /[A-Za-z]{2,}/.test(operands)) return source;
  return `$${value}$`;
}
