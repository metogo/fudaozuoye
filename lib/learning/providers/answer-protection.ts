const unitSuffix = /(?:毫米|厘米|分米|千米|平方米|平方厘米|立方米|立方厘米|米|秒|分钟|小时|千克|克|元|度|牛|帕|焦|瓦|伏|安|欧|摩尔|mm|cm|km|m|ms|s|min|h|kg|g|pa|j|w|v|a|mol)$/iu;

export function normalizedAnswerMath(value: string): string {
  let normalized = value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${Array.from(digits).map((digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit)).join("")}`).normalize("NFKC")
    .replace(/\\char\s*(?:"([0-9a-f]+)|'([0-7]+)|([0-9]+))/gi, (source, hexadecimal: string | undefined, octal: string | undefined, decimal: string | undefined) => decodeTeXCharacter(source, hexadecimal, octal, decimal))
    .replace(/\\(?:color|textcolor|colorbox)\s*\{[^{}]*\}/g, "")
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/g, "");
  while (true) {
    const collapsed = normalized.replace(/\{\{([^{}]*)\}\}/g, "{$1}");
    const unwrapped = collapsed
      .replace(/\\(?!(?:frac|dfrac|tfrac|binom|dbinom|tbinom|sqrt|root|log|ln|exp|sin|cos|tan|cot|sec|csc|min|max|lim|int|sum|prod)\b)[A-Za-z]+\*?(?:\[[^\]]*\])*\s*\{([^{}]*)\}(?:\[[^\]]*\])*\s*\{([^{}]*)\}/g, "$1 $2")
      .replace(/\\(?!(?:frac|dfrac|tfrac|binom|dbinom|tbinom|sqrt|root|log|ln|exp|sin|cos|tan|cot|sec|csc|min|max|lim|int|sum|prod)\b)[A-Za-z]+\*?(?:\[[^\]]*\])*\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\(?!(?:frac|dfrac|tfrac|binom|dbinom|tbinom|sqrt|root|log|ln|exp|sin|cos|tan|cot|sec|csc|min|max|lim|int|sum|prod)\b)[A-Za-z]+\*?(?:\[[^\]]*\])*\s*([A-Za-z0-9])/g, "$1");
    if (unwrapped === normalized) break;
    normalized = unwrapped;
  }
  return normalized
    .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1/$2")
    .replace(/\\(?:dfrac|tfrac|frac)\s*([0-9.]+)\s*([0-9.]+)/g, "$1/$2")
    .replace(/\^\{([^{}]+)\}/g, "^$1")
    .replace(/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/g, (_, numerator: string, denominator: string) => Number(denominator) === 0 ? `${numerator}/${denominator}` : String(Number(numerator) / Number(denominator)))
    .replace(/\\(?:left|right|,|;|!|quad|qquad)/g, "")
    .replace(/[${}\s，。；：、“”‘’（）()\[\]【】]/g, "")
    .toLowerCase();
}

function decodeTeXCharacter(source: string, hexadecimal?: string, octal?: string, decimal?: string): string {
  const codePoint = hexadecimal ? Number.parseInt(hexadecimal, 16) : octal ? Number.parseInt(octal, 8) : Number.parseInt(decimal ?? "", 10);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : source;
}

export function protectedAnswerVariants(answer: string): string[] {
  const normalized = normalizedAnswerMath(answer);
  const variants = new Set([normalized]);
  const withoutUnit = normalized.replace(unitSuffix, "");
  if (withoutUnit !== normalized) variants.add(withoutUnit);
  for (const candidate of Array.from(variants)) addNumericEquivalents(candidate, variants);
  return Array.from(variants).filter((value) => value.length >= 2);
}

export function protectedShortAnswers(answer: string): string[] {
  const normalized = normalizedAnswerMath(answer);
  const withoutUnit = normalized.replace(unitSuffix, "");
  return Array.from(new Set([normalized, withoutUnit])).filter((value) => value.length === 1 || isShortTextAnswer(value));
}

export function isShortTextAnswer(answer: string): boolean {
  return /^[\p{Script=Han}]{2,3}$/u.test(normalizedAnswerMath(answer));
}

export function shortTextAnswerLeak(visibleText: string, answer: string, sourceText: string): boolean {
  if (!isShortTextAnswer(answer)) return false;
  const term = answer.normalize("NFKC").trim();
  return visibleText.normalize("NFKC").includes(term) && !sourceText.normalize("NFKC").includes(term);
}

export function explicitAnswerClaimLeak(visibleText: string, answer: string): boolean {
  const variants = protectedAnswerVariants(answer).concat(protectedShortAnswers(answer));
  const visible = normalizedAnswerMath(visibleText);
  const resultClaim = "(?:最终答案|答案|最终结果|计算结果|结论|故选|应选|正确选项|正确的|正确答案)(?:应当|应该|应)?(?:是|为|等于|选择|选)?";
  const selectionClaim = "(?:应当|应该|所以|因此|故而)?(?:应当|应该|应)?选择";
  return variants.some((variant) => new RegExp(`(?:${resultClaim}|${selectionClaim})${escapeRegExp(variant)}(?![a-z0-9.])`, "u").test(visible));
}

export function generatedTextContainsAnswer(visibleText: string, answer: string): boolean {
  const visible = normalizedAnswerMath(visibleText);
  return protectedAnswerVariants(answer).concat(protectedShortAnswers(answer))
    .some((variant) => visible.includes(variant));
}

export function shortProtectedAnswerLeak(visibleText: string, answer: string, sourceText: string): boolean {
  if (/\\(?:char|verb|def|gdef|edef|xdef|let|futurelet|global|newcommand|renewcommand|providecommand|declaremathoperator)\b/i.test(visibleText)) return true;
  const visible = normalizedAnswerMath(visibleText);
  const source = normalizedAnswerMath(sourceText);
  const escaped = escapeRegExp(normalizedAnswerMath(answer));
  const phrasePatterns = [
    new RegExp(`(?:最终答案|答案|最终结果|计算结果|结论|结果|答|解得|故有|应选择|选择|选|正确选项|故选|应选|得到|可知|所以|因此)(?:是|为|等于|:)?${escaped}(?![a-z0-9.])`, "giu"),
    new RegExp(`${escaped}(?:项|选项)?正确`, "giu"),
  ];
  if (phrasePatterns.some((pattern) => Array.from(visible.matchAll(pattern)).some((match) => !source.includes(match[0])))) return true;
  if (decoratedMathAssignmentLeak(visibleText, answer, sourceText)) return true;
  const numericAnswer = Number(answer);
  if (!Number.isFinite(numericAnswer)) return false;
  const assignments = [
    /[a-z][a-z0-9_]*(?:=|≈)\+?(-?(?:\d+(?:\.\d*)?|\.\d+))(?![a-z0-9_.+\-*/^])/giu,
    /(-?(?:\d+(?:\.\d*)?|\.\d+))(?![a-z0-9_.+\-*/^])(?:=|≈)[a-z][a-z0-9_]*/giu,
  ];
  return assignments.some((pattern) => Array.from(visible.matchAll(pattern)).some((match) => Number(match[1]) === numericAnswer && !source.includes(match[0])));
}

function decoratedMathAssignmentLeak(visibleText: string, answer: string, sourceText: string): boolean {
  const candidate = normalizedAnswerMath(answer);
  const expressions = Array.from(visibleText.matchAll(/\$\$?([\s\S]*?)\$\$?/g), (match) => match[1]);
  return expressions.some((expression) => {
    const normalizedExpression = normalizedAnswerMath(expression);
    if (normalizedExpression === candidate) return true;
    const introducedExpression = expression.length < 3 || !sourceText.includes(expression);
    if (introducedExpression && decoratedMathPayloads(expression).some((payload) => normalizedAnswerMath(payload) === candidate)) return true;
    const assignment = expression.match(/(?:=|≈)([\s\S]+)/);
    return Boolean(assignment && introducedExpression && normalizedAnswerMath(assignment[1]) === candidate);
  });
}

function decoratedMathPayloads(value: string): string[] {
  const semantic = new Set(["frac", "dfrac", "tfrac", "binom", "dbinom", "tbinom", "sqrt", "root", "log", "ln", "exp", "sin", "cos", "tan", "cot", "sec", "csc", "min", "max", "lim", "int", "sum", "prod"]);
  const payloads: string[] = [];
  for (const match of value.matchAll(/\\([A-Za-z]+)\*?(?:\[[^\]]*\])*\s*\{([^{}]*)\}(?:\[[^\]]*\])*\s*\{([^{}]*)\}/g)) {
    if (!semantic.has(match[1])) payloads.push(match[2], match[3]);
  }
  for (const match of value.matchAll(/\\([A-Za-z]+)\*?(?:\[[^\]]*\])*\s*\{([^{}]*)\}/g)) {
    if (!semantic.has(match[1])) payloads.push(match[2]);
  }
  for (const match of value.matchAll(/\\([A-Za-z]+)\*?(?:\[[^\]]*\])*\s*([A-Za-z0-9])/g)) {
    if (!semantic.has(match[1])) payloads.push(match[2]);
  }
  return payloads;
}

function addNumericEquivalents(value: string, variants: Set<string>) {
  const fraction = value.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (fraction && Number(fraction[2]) !== 0) variants.add(String(Number(fraction[1]) / Number(fraction[2])));
  const decimal = value.match(/^(-?\d+)\.(\d+)$/);
  if (!decimal) return;
  const denominator = 10 ** decimal[2].length;
  const numerator = Math.round(Number(value) * denominator);
  const divisor = greatestCommonDivisor(Math.abs(numerator), denominator);
  variants.add(`${numerator / divisor}/${denominator / divisor}`);
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
