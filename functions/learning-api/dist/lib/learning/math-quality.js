"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mathOutputInstruction = void 0;
exports.prepareMathForDisplay = prepareMathForDisplay;
const presentation_1 = require("./presentation");
exports.mathOutputInstruction = String.raw `公式排版规范：同一个变量的写法全程一致，下标必须写成 x_{1}、x_{2}，不能混写为 x1、x2；指数与下标都用花括号明确范围。一个完整表达式放在同一对公式定界符内，不在括号、分式、根号或上下标中插入中文。短公式用 $...$；超过一个等号的连续推导、较长恒等式或复杂分式另起一段用 $$...$$，多步推导可用 aligned 在等号处换行。不要为了换行改变运算顺序。公式前后的中文与标点放在定界符外。输出前检查括号配对、定界符闭合及变量一致性；不能以语法正确代替数学推理正确。`;
/** Presentation diagnostics, never algebraic correction or evidence of truth. */
function prepareMathForDisplay(source, streaming = false) {
    const content = (0, presentation_1.prepareLearningMarkdown)(source, streaming);
    const prose = content.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/g, (code) => " ".repeat(code.length));
    let opened = -1;
    let delimiter = "";
    for (let i = 0; i < prose.length; i += 1) {
        if (prose[i] !== "$" && prose[i] !== "\\")
            continue;
        let slashes = 0;
        for (let j = i - 1; j >= 0 && prose[j] === "\\"; j -= 1)
            slashes += 1;
        if (slashes % 2)
            continue;
        if (prose[i] === "\\") {
            const next = prose[i + 1];
            if (opened < 0 && (next === "(" || next === "[")) {
                opened = i;
                delimiter = next === "(" ? "\\)" : "\\]";
            }
            else if (`\\${next}` === delimiter) {
                opened = -1;
                delimiter = "";
            }
            if (/[()[\]]/.test(next ?? ""))
                i += 1;
            continue;
        }
        const token = prose[i + 1] === "$" ? "$$" : "$";
        if (opened < 0) {
            opened = i;
            delimiter = token;
        }
        else if (token === delimiter) {
            opened = -1;
            delimiter = "";
        }
        i += token.length - 1;
    }
    if (streaming)
        return { content: opened < 0 ? content : `${content.slice(0, opened)}（公式正在补全…）`, issues: [] };
    const issues = [];
    if (opened >= 0)
        issues.push("有一条公式尚未完整闭合，当前保留原文，请核对后再使用。");
    const math = [...prose.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)].map((match) => match[1] ?? match[2]).join("\n");
    const indices = new Set([...math.matchAll(/\b([A-Za-z])_\{?(\d+)\}?/g)].map((match) => `${match[1]}${match[2]}`));
    const bareIndices = new Set([...math.matchAll(/\b[A-Za-z]\d+\b/g)].map((match) => match[0]));
    for (const index of indices) {
        if (bareIndices.has(index)) {
            issues.push(`同一段中同时出现“${index}”和带下标的写法，可能表示不同含义；当前保留原文，可选中相关内容问一问。`);
            break;
        }
    }
    return { content, issues };
}
