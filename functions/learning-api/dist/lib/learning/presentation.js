"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripLearningChoiceLabel = stripLearningChoiceLabel;
exports.prepareLearningMarkdown = prepareLearningMarkdown;
exports.normalizeStandardLatexDelimiters = normalizeStandardLatexDelimiters;
exports.assertBalancedLearningMarkup = assertBalancedLearningMarkup;
exports.expandLearningMarkupRange = expandLearningMarkupRange;
exports.parseLearningPrompt = parseLearningPrompt;
exports.learningTextToPlainText = learningTextToPlainText;
function stripLearningChoiceLabel(source, index) {
    const label = String.fromCharCode(65 + index);
    return source.replace(new RegExp(`^(?:[（(]\\s*)?${label}\\s*[.．、:：)）]\\s*`), "").trim() || source;
}
const protectedMarkdownPattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\${1,2}[\s\S]*$|<\/?[A-Za-z][^>\n]*>)/g;
const optionPattern = /(?<![A-Za-z0-9])(?:[（(]\s*)?([A-H])\s*[.．、:：)）]\s*/g;
/**
 * Keeps OCR/source text faithful while adding KaTeX delimiters around only
 * high-confidence mathematical fragments. Existing Markdown and math spans
 * are never rewritten.
 */
function prepareLearningMarkdown(source, streaming = false) {
    const normalized = normalizeStandardLatexDelimiters(source, streaming);
    if (streaming && hasUnclosedMath(normalized))
        return normalized;
    return promoteDisplayOnlyMath(normalized)
        .split(protectedMarkdownPattern)
        .map((part, index) => index % 2 === 1 ? part : preparePlainSegment(part))
        .join("");
}
function normalizeStandardLatexDelimiters(source, streaming = false) {
    if (streaming && hasUnclosedCodeFence(source))
        return source;
    return source.split(protectedMarkdownPattern)
        .map((part, index) => index % 2 === 1 ? part : part
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => `\n\n$$\n${latex.trim()}\n$$\n\n`)
        .replace(/\\\(([^\n]*?)\\\)/g, (_, latex) => `$${latex.trim()}$`))
        .join("");
}
function hasUnclosedCodeFence(source) {
    const backticks = source.match(/^\s{0,3}```/gm)?.length ?? 0;
    const tildes = source.match(/^\s{0,3}~~~/gm)?.length ?? 0;
    return backticks % 2 === 1 || tildes % 2 === 1;
}
function promoteDisplayOnlyMath(source) {
    return source.replace(/(?<!\$)\$([^$\n]*\\tag\*?\{[^{}\n]+\}[^$\n]*)\$(?!\$)/g, (_, latex) => `\n\n$$\n${latex}\n$$\n\n`);
}
function assertBalancedLearningMarkup(source, label) {
    if (hasUnclosedMath(source))
        throw new Error(`${label}的公式定界符不完整`);
}
function expandLearningMarkupRange(source, start, end) {
    const overlaps = Array.from(source.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]*`/g))
        .map((match) => ({ start: match.index, end: match.index + match[0].length }))
        .filter((range) => start < range.end && end > range.start);
    if (overlaps.length === 0)
        return { start, end };
    return {
        start: Math.min(start, ...overlaps.map((range) => range.start)),
        end: Math.max(end, ...overlaps.map((range) => range.end)),
    };
}
function parseLearningPrompt(source) {
    const cleaned = source.trim().replace(/^(?:现在)?(?:请你)?(?:先)?(?:独立)?(?:重新|重做|完成)(?:一下)?(?:这道)?原题\s*[：:]\s*/, "");
    const matches = Array.from(cleaned.matchAll(optionPattern));
    const sequential = matches.length >= 2 && matches.every((match, index) => match[1].toUpperCase().charCodeAt(0) === 65 + index);
    if (!sequential)
        return { body: cleaned, choices: [] };
    const first = matches[0];
    const body = cleaned.slice(0, first.index + (first[0].startsWith(" ") ? 1 : 0)).trim();
    const choices = matches.map((match, index) => {
        const start = match.index + match[0].length;
        const end = matches[index + 1]?.index ?? cleaned.length;
        const content = cleaned.slice(start, end).trim();
        return content ? `${match[1].toUpperCase()}. ${content}` : "";
    }).filter(Boolean);
    return choices.length === matches.length ? { body, choices } : { body: cleaned, choices: [] };
}
function learningTextToPlainText(source) {
    return source
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
        .replace(/\$([^$\n]+)\$/g, "$1")
        .replace(/^\s{0,3}>\s?/gm, "")
        .replace(/[*_`#~]/g, "")
        .replace(/\\(?:mathrm|text)\{([^{}]+)\}/g, "$1")
        .replace(/\\(?:triangle|angle|sin|cos|tan|cot|times|div|leq|geq)\b/g, " ")
        .replace(/[{}]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function preparePlainSegment(source) {
    const formulas = [];
    const stash = (latex) => {
        const token = `\uE000${formulas.length}\uE001`;
        formulas.push(`$${latex.trim()}$`);
        return token;
    };
    let text = structureSequentialItems(source);
    text = text.replace(/((?:\d+\s*)?(?:sin|cos|tan|cot)\s*[A-Za-z](?:\s*[+\-−]\s*(?:\d+\s*)?(?:sin|cos|tan|cot)\s*[A-Za-z])*\s*=\s*(?:\d+\s*)?(?:sin|cos|tan|cot)\s*[A-Za-z](?:\s*(?:sin|cos|tan|cot)\s*[A-Za-z])*)/gi, (value) => stash(toLatex(value)));
    text = text.replace(/(\\frac\s*\{[^{}\n]+\}\s*\{[^{}\n]+\}|\\sqrt\s*\{[^{}\n]+\}|\\(?:sin|cos|tan|cot|angle|triangle)\s*[A-Za-z0-9]+)/g, (value) => stash(value));
    text = text.replace(/((?:\d+(?:\.\d+)?|[A-Za-z](?:[²³]|\^\s*\d+)?|\([^()\n，。；;:：]+\))(?:\s*[+\-−×÷*/]\s*(?:\d+(?:\.\d+)?|[A-Za-z](?:[²³]|\^\s*\d+)?|\([^()\n，。；;:：]+\)))+\s*(?:=|≤|≥|<|>)\s*(?:\d+(?:\.\d+)?|[A-Za-z](?:[²³]|\^\s*\d+)?)(?:\s*[+\-−×÷*/]\s*(?:\d+(?:\.\d+)?|[A-Za-z](?:[²³]|\^\s*\d+)?))*)/g, (value) => stash(toLatex(value)));
    text = text.replace(/(\d+(?:\.\d+)?)\s*[×x]\s*10(?:\^\s*([+\-−]?\d+)|([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+))/g, (_, coefficient, asciiExponent, unicodeExponent) => stash(`${coefficient}\\times 10^{${asciiExponent?.replace("−", "-") ?? superscriptToAscii(unicodeExponent ?? "")}}`));
    text = text.replace(/(\d+(?:\.\d+)?)?\s*√\s*(\([^()\n]+\)|[A-Za-z]|\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/g, (_, coefficient, rawRadicand, denominator) => {
        const radicand = rawRadicand.startsWith("(") ? rawRadicand.slice(1, -1).trim() : rawRadicand;
        const numerator = `${coefficient ?? ""}\\sqrt{${toLatex(radicand)}}`;
        return stash(denominator ? `\\frac{${numerator}}{${denominator}}` : numerator);
    });
    text = text.replace(/∠\s*([A-Za-z]{1,3})\s*=\s*(-?\d+(?:\.\d+)?)\s*°/g, (_, name, degree) => stash(`\\angle ${name} = ${degree}^{\\circ}`));
    text = text.replace(/∠\s*([A-Za-z]{1,3})/g, (_, name) => stash(`\\angle ${name}`));
    text = text.replace(/△\s*([A-Za-z]{3})/g, (_, name) => stash(`\\triangle ${name}`));
    text = text.replace(/\((-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\)/g, (_, x, y) => stash(`(${x}, ${y})`));
    text = text.replace(/\b([A-Za-z]\s*=\s*[A-Za-z0-9²³⁴⁵⁶⁷⁸⁹⁰()+\-−×÷*/.\s]+)(?=[，。；;：:、？?]|$)/g, (value) => stash(toLatex(value.trim())));
    text = text.replace(/\b([A-Za-z]{1,4})\s*(=|≤|≥|<|>)\s*([A-Za-z]{1,4}|-?\d+(?:\.\d+)?)(?:\s*(cm|mm|km|kg|mol|m\/s²?|m|s|g|N))?/g, (_, left, relation, right, unit) => stash(`${left} ${relationToLatex(relation)} ${right}${unit ? `\\,\\mathrm{${unit.replace("²", "^2")}}` : ""}`));
    text = text.replace(/\b([A-Za-z](?:\s*[,，、]\s*[A-Za-z]){2,})\b/g, (value) => stash(value.replace(/[，、]/g, ", ")));
    text = text.replace(/\b((?:sin|cos|tan|cot)\s*[A-Za-z])/gi, (value) => stash(toLatex(value)));
    text = text.replace(/\b((?=(?:[A-Z][a-z]?\d*){2,}\b)(?=[A-Za-z0-9]*[a-z0-9])(?:[A-Z][a-z]?\d*){2,})\b/g, (value) => stash(chemicalToLatex(value)));
    text = text.replace(/(-?\d+(?:\.\d+)?)\s*°/g, (_, degree) => stash(`${degree}^{\\circ}`));
    return text.replace(/\uE000(\d+)\uE001/g, (_, index) => formulas[Number(index)]);
}
function structureSequentialItems(source) {
    if (/\d[.．]\s+\d/.test(source))
        return source;
    const decimalMatches = Array.from(source.matchAll(/(?:^|\s)(\d{1,2})[.．、]\s+/g));
    if (decimalMatches.length >= 2 && decimalMatches.every((match, index) => Number(match[1]) === index + 1)) {
        return source.replace(/(?:^|\s)(\d{1,2})[.．、]\s+/g, (_, number) => `\n${number}. `).trimStart();
    }
    const parenthesizedMatches = Array.from(source.matchAll(/(?:^|\s)[（(](\d{1,2})[）)]\s*/g));
    if (parenthesizedMatches.length >= 2 && parenthesizedMatches.every((match, index) => Number(match[1]) === index + 1)) {
        return source.replace(/(?:^|\s)[（(](\d{1,2})[）)]\s*/g, (_, number) => `\n${number}. `).trimStart();
    }
    return source;
}
function hasUnclosedMath(source) {
    const withoutCode = source.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, "");
    let inlineOpen = false;
    let displayOpen = false;
    for (let index = 0; index < withoutCode.length; index += 1) {
        if (withoutCode[index] !== "$" || withoutCode[index - 1] === "\\")
            continue;
        if (withoutCode[index + 1] === "$") {
            displayOpen = !displayOpen;
            index += 1;
        }
        else if (!displayOpen)
            inlineOpen = !inlineOpen;
    }
    return inlineOpen || displayOpen;
}
function chemicalToLatex(value) {
    return `\\mathrm{${value.replace(/(\d+)/g, "_{$1}")}}`;
}
function toLatex(value) {
    return value
        .replace(/(sin|cos|tan|cot)\s*([A-Za-z])/gi, (_, name, argument) => `\\${name.toLowerCase()} ${argument}`)
        .replace(/([A-Za-z0-9)])([²³⁴⁵⁶⁷⁸⁹⁰]+)/g, (_, base, exponent) => `${base}^{${superscriptToAscii(exponent)}}`)
        .replace(/([A-Za-z])([₀-₉]+)/g, (_, base, subscript) => `${base}_{${subscriptToAscii(subscript)}}`)
        .replace(/×/g, "\\times ")
        .replace(/÷/g, "\\div ")
        .replace(/≤/g, "\\leq ")
        .replace(/≥/g, "\\geq ")
        .replace(/−/g, "-")
        .replace(/→/g, "\\rightarrow ")
        .replace(/\s+/g, " ")
        .trim();
}
function relationToLatex(value) {
    return value === "≤" ? "\\leq" : value === "≥" ? "\\geq" : value;
}
function superscriptToAscii(value) {
    const map = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
    return Array.from(value).map((character) => map[character] ?? character).join("");
}
function subscriptToAscii(value) {
    const map = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
    return Array.from(value).map((character) => map[character] ?? character).join("");
}
