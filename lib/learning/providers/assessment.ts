import type { CheckItem } from "../types";

export type AnswerAssessment = { passed: boolean; explanation: string };

export function deterministicAnswerMatch(expected: string, actual: string): boolean | null {
  const leftEquation = chemicalEquation(expected);
  const rightEquation = chemicalEquation(actual);
  if (leftEquation && rightEquation) return leftEquation === rightEquation;

  const left = canonicalAnswer(expected);
  const right = canonicalAnswer(actual);
  if (!right) return false;
  if (left === right) return true;

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

export function safeAssessmentFeedback(check: CheckItem, answer: string, result: AnswerAssessment): AnswerAssessment {
  if (result.passed) return result;
  const expected = canonicalAnswer(check.answer);
  const actual = canonicalAnswer(answer);
  const expectedQuantity = quantity(expected);
  const actualQuantity = quantity(actual);
  if ((expectedQuantity || actualQuantity) && (!expectedQuantity || !actualQuantity || expectedQuantity.dimension !== actualQuantity.dimension)) {
    return { passed: false, explanation: "数值和单位需要一起核对；先检查单位是否与题目所求一致。" };
  }
  if (expectedQuantity && actualQuantity) {
    return { passed: false, explanation: "数值还不对；重新检查关系式、代入顺序和运算，再试一次。" };
  }
  if (check.type === "choice") {
    return { passed: false, explanation: "这个选项与题干中的关键关系还不一致，请重新对照条件再判断。" };
  }
  if (numericSequence(actual)) {
    return { passed: false, explanation: "结果还不对。先检查关系式、代入顺序和运算，再试一次。" };
  }
  return { passed: false, explanation: "当前表达还没有完整回应题目要求；先检查关键关系，再补上结论。" };
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
