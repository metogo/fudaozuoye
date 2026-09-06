import { adaptTeachingCopy } from "../grade-pedagogy";
import type { CheckItem, GradeBand } from "../types";

export type AnswerAssessment = { passed: boolean; explanation: string };

export function deterministicAnswerMatch(expected: string, actual: string): boolean | null {
  if (explicitlyNegatesExpected(expected, actual)) return false;
  const assessedActual = affirmedAnswerCandidate(actual) ?? actual;
  const leftEquation = chemicalEquation(expected);
  const rightEquation = chemicalEquation(assessedActual);
  if (leftEquation && rightEquation) return leftEquation === rightEquation;

  const left = canonicalAnswer(expected);
  const right = canonicalAnswer(assessedActual);
  if (!right) return false;
  if (left === right) return true;

  // Relations cannot be reduced to their numeric tokens (e.g. Δ<0 versus Δ≥0).
  const relationText = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\\delta/g, "δ").replace(/\\(?:geq|ge)(?![a-z])|>=/g, "≥").replace(/\\(?:leq|le)(?![a-z])|<=/g, "≤").replace(/\\(?:neq|ne)(?![a-z])|!=/g, "≠").replace(/[\s${}]/g, "");
  const expectedRelation = relationText(expected);
  const actualRelation = relationText(assessedActual);
  if (/[<>≤≥≠=]/.test(expectedRelation + actualRelation)) {
    if (expectedRelation === actualRelation) return true;
    const a = expectedRelation.match(/^([^<>≤≥≠=]*)([<>≤≥≠=])([^<>≤≥≠=]*)$/);
    const b = actualRelation.match(/^([^<>≤≥≠=]*)([<>≤≥≠=])([^<>≤≥≠=]*)$/);
    if (a && b && a[1] === b[1] && a[3] === b[3]) return a[2] === b[2];
    const inverse: Record<string, string> = { ">": "<", "<": ">", "≥": "≤", "≤": "≥", "=": "=", "≠": "≠" };
    if (a && b && a[1] === b[3] && a[3] === b[1]) return inverse[a[2]] === b[2];
    return null;
  }

  const leftQuantity = quantity(left);
  const rightQuantity = quantity(right);
  if (leftQuantity && rightQuantity) {
    return leftQuantity.dimension === rightQuantity.dimension
      && nearlyEqual(leftQuantity.value, rightQuantity.value);
  }
  if (leftQuantity || rightQuantity) return null;

  const leftSequence = numericSequence(left);
  const rightSequence = numericSequence(right);
  if (leftSequence && rightSequence && leftSequence.length === rightSequence.length) {
    return leftSequence.every((value, index) => nearlyEqual(value, rightSequence[index]));
  }
  return null;
}

export function affirmedAnswerCandidate(actual: string): string | null {
  if (retractsCurrentAnswer(actual)) return null;
  const corrected = actual.match(/(?:而是|而应为|正确(?:答案|结果)?是|答案是|结果是)\s*([^，,。；;]+)/)?.[1]?.trim();
  if (corrected) return corrected;
  const beforeRejectedAlternative = actual.match(/^\s*([^，,。；;]+)[，,]\s*(?:不是|并非|而非|not)/i)?.[1]?.trim();
  if (!beforeRejectedAlternative || !/(?:=|≈|\d)/.test(beforeRejectedAlternative)) return null;
  return beforeRejectedAlternative.match(/^[a-z][a-z0-9_]*\s*(?:=|≈)\s*(.+)$/i)?.[1]?.trim() ?? beforeRejectedAlternative;
}

export function explicitlyNegatesExpected(expected: string, actual: string): boolean {
  const target = canonicalAnswer(expected);
  if (!target) return false;
  const normalized = actual.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  if (normalized.includes(target) && retractsCurrentAnswer(normalized)) return true;
  return normalized.split(/[。！？!?；;]+/).some((clause) => targetOccurrences(clause, target).some((index) => targetIsNegated(clause, index, target.length)));
}

function retractsCurrentAnswer(value: string): boolean {
  const normalized = value.toLowerCase();
  const referent = "(?:(?:这个|该|此|上述|前述)(?:结论|答案|结果|说法|判断)|这(?:一)?(?:结论|答案|结果|说法|判断))";
  const rejection = "(?:不成立|不对|错误|有误|不正确|不同意|不认可|否认|收回|撤回)";
  const chinese = new RegExp(`(?:但|不过|然而|可是|[，,。；;])?.{0,24}(?:${referent}.{0,8}${rejection}|${rejection}.{0,8}${referent}|这(?:显然|明显|其实|本身)?(?:不成立|错误|有误|不正确))`);
  const englishReferent = "(?:(?:this|that|theabove|previous)(?:answer|result|claim|judgment))";
  const english = new RegExp(`(?:but|however|[,.])?.{0,32}(?:${englishReferent}.{0,12}(?:is)?(?:wrong|incorrect|invalid|false|notcorrect|doesnothold)|(?:retract|withdraw|reject|disavow|disagreewith|donotaccept).{0,12}${englishReferent})`);
  return chinese.test(normalized) || english.test(normalized.replace(/\s+/g, ""));
}

function targetOccurrences(clause: string, target: string): number[] {
  const indexes: number[] = [];
  for (let index = clause.indexOf(target); index >= 0; index = clause.indexOf(target, index + target.length)) indexes.push(index);
  return indexes;
}

function targetIsNegated(clause: string, index: number, length: number): boolean {
  const before = clause.slice(Math.max(0, index - 100), index);
  const after = clause.slice(index + length, index + length + 32);
  if (/^(?:绝不成立|并不成立|不成立|不该是(?:正确)?(?:答案|结果)|不是(?:正确)?(?:答案|结果)|不正确|是错误的|错误|≠)/.test(after)) return true;
  if (/^[^0-9a-z]{0,18}(?:显然不正确|显然不对|不应成立|不能成立)/i.test(after)) return true;
  const negation = Math.max(...["≠", "不是", "并非", "不等于", "不为", "不应为", "不该是", "绝非", "不可能是", "not", "isn't", "isnot", "never", "incorrect", "wrong"].map((token) => before.lastIndexOf(token)));
  const correction = Math.max(...["而是", "而应为", "答案是", "结果是", "正确的是", "ratherthan", "instead", "but", "="].map((token) => before.lastIndexOf(token)));
  return negation >= 0 && negation > correction;
}

function chemicalEquation(value: string): string | null {
  let simplified = value.normalize("NFKC")
    .replace(/\$/g, "")
    .replace(/_\{(\d+)\}/g, "$1")
    .replace(/_(\d+)/g, "$1");
  for (let index = 0; index < 4; index += 1) {
    simplified = simplified.replace(/\\(?:ce|mathrm|text)\{([^{}]*)\}/gi, "$1");
  }
  const normalized = simplified
    .replace(/^\\(?:boldsymbol|boxed|mathbf)\{([\s\S]*)\}$/gi, "$1")
    .replace(/\\!/g, "")
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (item) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(item)))
    .replace(/_\{(\d+)\}/g, "$1")
    .replace(/_(\d+)/g, "$1")
    .replace(/\^\{[^{}]*\}/g, "")
    .replace(/\\x(?:long)?(?:right)?(?:arrow|equal)\{[^{}]*\}/gi, "=")
    .replace(/\\(?:overset|stackrel)\{[^{}]*\}\{(?:→|=+|\\(?:long)?(?:right)?arrow)\}/gi, "=")
    .replace(/\\(?:long)?(?:right)?arrow/gi, "=")
    .replace(/\\(?:uparrow|downarrow)/gi, "")
    .replace(/\\ce\{([^{}]+)\}/gi, "$1")
    .replace(/[→⟶⟹⇒]/g, "=")
    .replace(/-{1,3}>/g, "=")
    .replace(/\\(?:mathrm|text)\{([^{}]*)\}/g, "$1")
    .replace(/[{}$\\\s]/g, "")
    .replace(/[↑↓]/g, "")
    .replace(/\((?:aq|s|l|g)\)/gi, "");
  const parts = normalized.split("=");
  if (parts.length !== 2) return null;
  const sides = parts.map(chemicalSide);
  return sides.every(Boolean) ? `${sides[0]}=${sides[1]}` : null;
}

function chemicalSide(value: string): string | null {
  const terms = value.split("+").map((term) => {
    const match = term.match(/^(\d*)([A-Za-z][A-Za-z0-9()]*)$/);
    if (!match) return null;
    return `${match[1] || "1"}:${match[2].toUpperCase()}`;
  });
  if (terms.some((term) => !term)) return null;
  return (terms as string[]).sort().join("+");
}

export function safeAssessmentFeedback(check: CheckItem, answer: string, result: AnswerAssessment, learnerBand: GradeBand = "junior"): AnswerAssessment {
  if (result.passed) return learnerBand === "primary"
    ? { passed: true, explanation: "答对了。你已经抓住题目要点。" }
    : learnerBand === "senior"
      ? { passed: true, explanation: result.explanation.trim() || "结论正确，且满足题设条件。" }
      : { ...result, explanation: adaptTeachingCopy(result.explanation, learnerBand) };
  const expected = canonicalAnswer(check.answer);
  const actual = canonicalAnswer(answer);
  const expectedQuantity = quantity(expected);
  const actualQuantity = quantity(actual);
  if ((expectedQuantity || actualQuantity) && (!expectedQuantity || !actualQuantity || expectedQuantity.dimension !== actualQuantity.dimension)) {
    return { passed: false, explanation: learnerBand === "primary" ? "数字和单位要一起看。先检查单位是不是题目要的。" : learnerBand === "senior" ? "数值与单位需同时满足量纲要求；请核对单位维度是否对应题目所求。" : "数值和单位需要一起核对；先检查单位是否与题目所求一致。" };
  }
  if (expectedQuantity && actualQuantity) {
    return { passed: false, explanation: learnerBand === "primary" ? "数字还不对。先看看算式有没有列对，再按顺序算一次。" : learnerBand === "senior" ? "数值不成立；请从关系式、代入顺序与运算精度逐项复核。" : "数值还不对；重新检查关系式、代入顺序和运算，再试一次。" };
  }
  if (check.type === "choice") {
    return { passed: false, explanation: learnerBand === "primary" ? "这个选项和题目给的条件对不上。先检查题目条件，再比一比。" : learnerBand === "senior" ? "该选项与题设约束不一致；请定位发生冲突的条件。" : "这个选项与题干中的关键关系还不一致，请重新对照条件再判断。" };
  }
  if (numericSequence(actual)) {
    return { passed: false, explanation: learnerBand === "primary" ? "结果还不对。先检查算式，再按顺序算一次。" : learnerBand === "senior" ? "结果不满足题设；请复核关系式、代入过程和计算。" : "结果还不对。先检查关系式、代入顺序和运算，再试一次。" };
  }
  return { passed: false, explanation: learnerBand === "primary" ? "还没有答完整。先说清题目里的联系，再补上答案。" : learnerBand === "senior" ? "当前作答尚未完整覆盖设问；请补足论证依据与结论边界。" : "当前表达还没有完整回应题目要求；先检查关键关系，再补上结论。" };
}

function canonicalAnswer(value: string): string {
  const scripted = value
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (item) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(item)))
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((item) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(item)).join("")}`);
  return scripted.normalize("NFKC").toLowerCase()
    .replace(/([0-9]+(?:\.[0-9]+)?)\s*[×·]\s*10\s*\^?\s*([+-]?\d+)/g, "$1e$2")
    .replace(/[→⟶⟹⇒]/g, "=")
    .replace(/平方厘米/g, "cm2").replace(/平方米/g, "m2").replace(/立方厘米/g, "cm3").replace(/立方米/g, "m3")
    .replace(/千米|公里/g, "km").replace(/厘米/g, "cm").replace(/毫米/g, "mm").replace(/米/g, "m")
    .replace(/小时/g, "h").replace(/分钟|分/g, "min").replace(/秒/g, "s")
    .replace(/千克|公斤/g, "kg").replace(/克/g, "g")
    .replace(/牛顿|牛/g, "n").replace(/伏特|伏/g, "v").replace(/安培|安/g, "a").replace(/欧姆/g, "ohm")
    .replace(/盒|个|组|人|辆|本|支|张|份|次|题|颗|件|只|根|条|台|套|瓶|块|枚|页/g, "")
    .replace(/每/g, "/").replace(/／/g, "/").replace(/[,，、；;：:\s（）()\[\]【】]/g, "")
    .replace(/^(答案|结果|所以|因此)(是|为|等于)?/, "").replace(/[。！？!?]$/g, "");
}

function numericSequence(value: string): number[] | null {
  if (/[a-df-z\p{Script=Han}]/u.test(value.replace(/(?:km|cm|mm|min|kg|ohm)/g, ""))) return null;
  const matches = value.match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/g);
  if (!matches?.length) return null;
  return matches.map(Number).every(Number.isFinite) ? matches.map(Number) : null;
}

function quantity(value: string): { value: number; dimension: string } | null {
  const match = value.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)([a-z/^0-9]+)$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const unit = match[2].replace(/\^/g, "");
  const conversion = unitConversion(unit);
  return conversion ? { value: number * conversion.factor, dimension: conversion.dimension } : null;
}

function unitConversion(unit: string): { factor: number; dimension: string } | null {
  const simple: Record<string, { factor: number; dimension: string }> = {
    km: { factor: 1_000, dimension: "length" }, m: { factor: 1, dimension: "length" }, cm: { factor: 0.01, dimension: "length" }, mm: { factor: 0.001, dimension: "length" },
    km2: { factor: 1_000_000, dimension: "area" }, m2: { factor: 1, dimension: "area" }, cm2: { factor: 0.0001, dimension: "area" }, mm2: { factor: 0.000001, dimension: "area" },
    km3: { factor: 1_000_000_000, dimension: "volume" }, m3: { factor: 1, dimension: "volume" }, cm3: { factor: 0.000001, dimension: "volume" }, mm3: { factor: 0.000000001, dimension: "volume" },
    h: { factor: 3_600, dimension: "time" }, min: { factor: 60, dimension: "time" }, s: { factor: 1, dimension: "time" },
    kg: { factor: 1, dimension: "mass" }, g: { factor: 0.001, dimension: "mass" },
    n: { factor: 1, dimension: "force" }, v: { factor: 1, dimension: "voltage" }, a: { factor: 1, dimension: "current" }, ohm: { factor: 1, dimension: "resistance" },
  };
  if (simple[unit]) return simple[unit];
  const speed = unit.match(/^(km|m|cm|mm)\/(h|min|s)$/);
  if (!speed) return null;
  const length = simple[speed[1]];
  const time = simple[speed[2]];
  return { factor: length.factor / time.factor, dimension: "speed" };
}

function nearlyEqual(first: number, second: number): boolean {
  return Math.abs(first - second) <= Math.max(1e-9, Math.abs(first) * 1e-6, Math.abs(second) * 1e-6);
}
