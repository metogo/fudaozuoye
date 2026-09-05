"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileTeachingProgram = compileTeachingProgram;
exports.teachingPlannerPrompt = teachingPlannerPrompt;
exports.assembleTeachingLesson = assembleTeachingLesson;
const mathjs_1 = require("mathjs");
const illustration_fingerprint_1 = require("../illustration-fingerprint");
const teaching_scene_1 = require("../teaching-scene");
const unsupported = "这道题暂未匹配到可核验的分步演示，请先使用完整讲解。";
const num = "([0-9]+(?:\\.[0-9]+)?)";
const lengthUnit = "(千米|厘米|分米|毫米|米)";
const units = { 米: "m", 厘米: "cm", 分米: "dm", 毫米: "mm", 千米: "km" };
const f = (value) => (0, mathjs_1.fraction)(String(value));
const show = (value) => value.d === 1n ? value.n.toString() : value.toFraction();
const n = (value) => value.valueOf();
const label = (id, x, y, text) => ({ kind: "label", id, x, y, text });
const rect = (id, x, y, width, height, color = "base") => ({ kind: "rect", id, x, y, width, height, color });
/** Restrictive recognizers establish semantic roles before any model planning occurs. */
function compileTeachingProgram(session) {
    if (session.problem.subject !== "math")
        throw new Error(unsupported);
    if (session.problem.visualContext?.affectsSolving)
        throw new Error("这道题依赖原图条件，暂不提供自动分步演示，请使用完整讲解。");
    const text = session.problem.text.replace(/\s/g, "");
    if (text.length > 1200 || /至少|至多|大约|近似|阴影|重叠|切去|挖去|剩余|折扣|百分|%|速度.*改变|加速|[-−]\d/.test(text))
        throw new Error(unsupported);
    const root = session.nodes.find((node) => node.id === session.rootNodeId);
    if (!root?.check.answer.trim() || !root.check.explanation.trim())
        throw new Error("原题解答尚未核验，暂时不能生成演示。");
    const program = rectangleProgram(text) ?? rateProgram(text) ?? groupsProgram(text) ?? sharingProgram(text) ?? fractionProgram(text) ?? comparisonProgram(text);
    if (!program)
        throw new Error(unsupported);
    program.sourceQuotes = [session.problem.text];
    const answer = root.check.answer.replace(/\s/g, "");
    for (const result of program.results) {
        const matchingUnit = [...answer.matchAll(/(?<![\d.])(-?[0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)\s*(平方千米|平方厘米|平方分米|平方毫米|平方米|千米|厘米|分米|毫米|米|个|本|支|颗|人|张|元|块)/g)].filter((match) => match[2] === result.unit);
        const found = matchingUnit.some((match) => f(match[1]).equals(f(result.value)));
        if (!found)
            throw new Error("演示计算与当前解答尚未核对一致，请先查看完整讲解。");
    }
    // A compound answer must not silently lose one of its requested results.
    const answerValues = [...answer.matchAll(/(?<![\d.])(-?[0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)(平方千米|平方厘米|平方分米|平方毫米|平方米|千米|厘米|分米|毫米|米|个|本|支|颗|人|张|元|块)/g)];
    if (answerValues.some((match) => !program.results.some((result) => result.unit === match[2] && f(result.value).equals(f(match[1])))))
        throw new Error("演示尚未覆盖这道题的全部结论，请使用完整讲解。");
    for (const stage of program.stages) {
        if (!stage.shapes.length || stage.shapes.length > 100)
            throw new Error(unsupported);
        for (const shape of stage.shapes) {
            for (const value of Object.values(shape))
                if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > 2000))
                    throw new Error(unsupported);
        }
    }
    return program;
}
function program(template, text, stages, results) {
    return { template, worldId: `world-${template}`, sourceQuotes: [text], stages, results };
}
function hasOnlyQuantities(text, expected) {
    const withoutQuestionNumbers = text.replace(/(^|[。？?；;])(?:[1-9][.、]|[（(][1-9][)）])/g, "$1");
    const values = withoutQuestionNumbers.match(/[0-9]+(?:\.[0-9]+)?/g) ?? [];
    return values.length === expected && values.every((value) => Number(value) <= 1e6);
}
function rectangleProgram(text) {
    if (!/长方形|矩形/.test(text))
        return null;
    const l = text.match(new RegExp(`(?:长为|长是|长)${num}${lengthUnit}`));
    const w = text.match(new RegExp(`(?:宽为|宽是|宽)${num}${lengthUnit}`));
    if (!l || !w)
        return null;
    const change = text.match(new RegExp(`长(?:增加|延长)${num}${lengthUnit}`));
    if (!hasOnlyQuantities(text, change ? 3 : 2))
        return null;
    if (/增加|延长|减少|缩短/.test(text) && (!change || !/宽(?:保持)?不变/.test(text)))
        return null;
    if (/宽(?:增加|延长|减少)|周长不变|面积不变|正方形/.test(text))
        return null;
    const u = l[2];
    const L = f(l[1]);
    const W = f(w[1]).mul(f(String((0, mathjs_1.unit)(1, units[w[2]]).toNumber(units[u]))));
    const D = change ? f(change[1]).mul(f(String((0, mathjs_1.unit)(1, units[change[2]]).toNumber(units[u])))) : f(0);
    if (n(L) <= 0 || n(W) <= 0 || n(D) < 0 || n(L.add(D)) > 1e6)
        return null;
    const next = L.add(D), perim = next.add(W).mul(2), area = L.mul(W), added = D.mul(W), nextArea = next.mul(W);
    const wantsPerimeter = /周长/.test(text);
    const wantsArea = /面积/.test(text);
    const wantsAdded = wantsArea && /面积.*(?:增加|多)|(?:增加|多).*面积/.test(text);
    if (!wantsPerimeter && !wantsArea)
        return null;
    if (change && /原(?:来|菜园|长方形)(?:的)?周长/.test(text))
        return null;
    const scale = Math.min(510 / n(next), 220 / n(W));
    const x = 130, y = 170, width = n(L) * scale, height = n(W) * scale, dw = n(D) * scale;
    if (Math.min(width, height) < 30 || (change && dw < 12))
        return null;
    const original = [rect("original", x, y, width, height), label("length", x + width / 2, y - 22, `${show(L)}${u}`), label("width", x - 62, y + height / 2, `${show(W)}${u}`)];
    const extended = [...original, ...(change ? [rect("added", x + width, y, dw, height, "change"), label("delta", x + width + dw / 2, y - 22, `+${show(D)}${u}`)] : [])];
    const stages = [{ id: "given", title: "先看原来的长和宽", explanation: `原长${show(L)}${u}，宽${show(W)}${u}。横边表示长，竖边表示宽。`, shapes: original }];
    if (change)
        stages.push({ id: "extend", title: "只延长长边，宽保持不变", explanation: `新长：${show(L)} + ${show(D)} = ${show(next)}（${u}）。黄色部分与原图等高，表示宽不变。`, shapes: [...extended, label("new-length", x + (width + dw) / 2, y + height + 38, `新长 ${show(next)}${u}`)] });
    const results = [];
    if (wantsPerimeter) {
        stages.push({ id: "perimeter", title: "周长：把外面的四条边相加", explanation: `(${show(next)} + ${show(W)}) × 2 = ${show(perim)}（${u}）。内部接缝不计入周长。`, shapes: [...extended, { kind: "line", id: "top", x1: x, y1: y, x2: x + width + dw, y2: y, color: "change", width: 9 }, { kind: "line", id: "bottom", x1: x, y1: y + height, x2: x + width + dw, y2: y + height, color: "change", width: 9 }, { kind: "line", id: "left", x1: x, y1: y, x2: x, y2: y + height, color: "change", width: 9 }, { kind: "line", id: "right", x1: x + width + dw, y1: y, x2: x + width + dw, y2: y + height, color: "change", width: 9 }, label("perimeter-result", 400, 465, `外边界一圈：${show(perim)}${u}`)] });
        results.push({ value: show(perim), unit: u });
    }
    if (wantsArea) {
        const result = wantsAdded && change ? added : nextArea;
        stages.push({ id: "area", title: wantsAdded && change ? "增加的面积就是黄色长条" : "面积：长乘宽", explanation: wantsAdded && change ? `黄色区域的长是${show(D)}${u}，宽是${show(W)}${u}，增加面积：${show(D)} × ${show(W)} = ${show(added)}（平方${u}）。原面积${show(area)}平方${u}没有重复计算。` : `${show(next)} × ${show(W)} = ${show(nextArea)}（平方${u}）。`, shapes: [...extended, label("area-result", 400, 465, `${wantsAdded && change ? "黄色区域" : "整个区域"}：${show(result)}平方${u}`)] });
        results.push({ value: show(result), unit: `平方${u}` });
    }
    return program("rectangle", text, stages, results);
}
function bars(count, each, u, reveal) {
    const width = 540 / count;
    return Array.from({ length: count }, (_, i) => [rect(`group-${i}`, 130 + width * i, 200, width, 110, i % 2 ? "change" : "base"), label(`quantity-${i}`, 130 + width * (i + .5), 263, reveal ? `${show(each)}${u}` : "?")]).flat();
}
function groupsProgram(text) {
    if (!hasOnlyQuantities(text, 2))
        return null;
    const each = text.match(new RegExp(`每(?:盒|袋|组|份|箱)(?:有|装有|装)?${num}(个|本|支|颗|张|块)`));
    if (!each || !/一共|共有|总共|总数/.test(text))
        return null;
    const container = each[0][1];
    const countMatch = text.match(new RegExp(`${num}${container}`));
    if (!countMatch || /又|剩|卖|取出|其中|每.*每/.test(text))
        return null;
    const count = Number(countMatch[1]), E = f(each[1]), u = each[2];
    if (!Number.isInteger(count) || count < 2 || count > 10 || n(E) <= 0 || !Number.isInteger(n(E)) || (show(E).length + 1) * 19 > 540 / count - 8)
        return null;
    const total = E.mul(count);
    return program("groups", text, [
        { id: "given", title: "每一份的数量相同", explanation: `每${container}${show(E)}${u}，共${count}${container}。图中每一格对应一${container}。`, shapes: [...bars(count, E, u, true), label("count", 400, 160, `${count}份，每份${show(E)}${u}`)] },
        { id: "total", title: "把相同的份合起来", explanation: `${show(E)} × ${count} = ${show(total)}（${u}）。乘法表示${count}个${show(E)}相加。`, shapes: [...bars(count, E, u, true), label("total", 400, 375, `合起来：${show(total)}${u}`)] },
    ], [{ value: show(total), unit: u }]);
}
function sharingProgram(text) {
    if (!hasOnlyQuantities(text, 2))
        return null;
    const totalMatch = text.match(new RegExp(`${num}(个|本|支|颗|张|块)`));
    const countMatch = text.match(new RegExp(`平均分(?:给|成)${num}(人|份|组)`));
    if (!totalMatch || !countMatch || !/每.*(?:多少|几)/.test(text) || /剩|余|又|还/.test(text))
        return null;
    const total = f(totalMatch[1]), count = Number(countMatch[1]), u = totalMatch[2];
    if (!Number.isInteger(count) || count < 2 || count > 10 || n(total) <= 0 || !Number.isInteger(n(total.div(count))))
        return null;
    const E = total.div(count);
    if ((show(E).length + 1) * 19 > 540 / count - 8)
        return null;
    return program("sharing", text, [
        { id: "given", title: "先把总量平均分成相同的份", explanation: `总共${show(total)}${u}，平均分成${count}份，每份一样多。`, shapes: [...bars(count, E, u, false), label("total", 400, 160, `总共${show(total)}${u}，平均分${count}份`)] },
        { id: "each", title: "求出每一份", explanation: `${show(total)} ÷ ${count} = ${show(E)}（${u}）。检查：${show(E)} × ${count} = ${show(total)}。`, shapes: [...bars(count, E, u, true), label("total", 400, 160, `总共${show(total)}${u}`)] },
    ], [{ value: show(E), unit: u }]);
}
function rateProgram(text) {
    if (!hasOnlyQuantities(text, 3))
        return null;
    const known = text.match(new RegExp(`${num}(小时|分钟)(?:行驶|走|行|跑)(?:了)?${num}(千米|米)`));
    const target = [...text.matchAll(new RegExp(`${num}(小时|分钟)`, "g"))].at(-1);
    if (!known || !target || !/照这样|同样.*速度|速度不变|匀速/.test(text) || !/(?:多少|几)(?:千米|米)/.test(text) || /相遇|追及|返回|休息|同时/.test(text))
        return null;
    if (known[2] !== target[2])
        return null;
    const T = f(known[1]), D = f(known[3]), Q = f(target[1]), u = known[4], tu = known[2];
    if (n(T) < 1 || n(D) <= 0 || n(Q) <= 0 || T.equals(Q))
        return null;
    const speed = D.div(T), result = speed.mul(Q), max = Math.max(n(D), n(result)), scale = 510 / max;
    if (Math.min(n(D), n(result)) * scale < 35)
        return null;
    const observed = [rect("known-distance", 150, 170, n(D) * scale, 65), label("known-label", 400, 145, `${show(T)}${tu} → ${show(D)}${u}`)];
    return program("rate", text, [
        { id: "given", title: "把时间和路程对应起来", explanation: `${show(T)}${tu}行驶${show(D)}${u}，题目说明速度不变。`, shapes: observed },
        { id: "unit", title: "先求一单位时间走多远", explanation: `${show(D)} ÷ ${show(T)} = ${show(speed)}（${u}/${tu}）。`, shapes: [...observed, rect("unit-distance", 150, 295, n(speed) * scale, 65, "change"), label("unit-label", 400, 275, `1${tu} → ${show(speed)}${u}`)] },
        { id: "target", title: "再对应到所求时间", explanation: `${show(speed)} × ${show(Q)} = ${show(result)}（${u}）。两条路程条使用相同比例。`, shapes: [...observed, rect("target-distance", 150, 315, n(result) * scale, 65, "change"), label("target-label", 400, 295, `${show(Q)}${tu} → ${show(result)}${u}`)] },
    ], [{ value: show(result), unit: u }]);
}
function comparisonProgram(text) {
    if (!hasOnlyQuantities(text, 2))
        return null;
    const quantities = [...text.matchAll(new RegExp(`${num}(个|本|支|颗|张|元|块)`, "g"))];
    if (quantities.length !== 2 || quantities[0][2] !== quantities[1][2] || !/多多少|少多少|相差多少|一共.*多少|共有多少/.test(text) || /倍|每|又|给了|卖|增加|减少|剩|比.{0,12}(?:多|少)\d/.test(text))
        return null;
    const A = f(quantities[0][1]), B = f(quantities[1][1]), u = quantities[0][2];
    if (n(A) <= 0 || n(B) <= 0)
        return null;
    const sum = /一共|共有/.test(text), result = sum ? A.add(B) : A.sub(B).abs();
    const scale = 510 / (sum ? n(A.add(B)) : Math.max(n(A), n(B)));
    if (Math.min(n(A), n(B)) * scale < 35)
        return null;
    const base = [rect("first", 150, 175, n(A) * scale, 70), label("first-label", 400, 150, `第一项 ${show(A)}${u}`), rect("second", 150, 305, n(B) * scale, 70, "change"), label("second-label", 400, 280, `第二项 ${show(B)}${u}`)];
    const resultShape = sum ? [rect("first", 150, 215, n(A) * scale, 80), rect("second", 150 + n(A) * scale, 215, n(B) * scale, 80, "change"), label("parts", 400, 180, `${show(A)}${u} + ${show(B)}${u}`)] : [...base, rect("difference", 150 + Math.min(n(A), n(B)) * scale, n(A) >= n(B) ? 175 : 305, n(result) * scale, 70, "outline")];
    return program("comparison", text, [
        { id: "given", title: "让两个数量使用相同比例", explanation: `第一项${show(A)}${u}，第二项${show(B)}${u}；左端对齐，条形长度表示数量。`, shapes: base },
        { id: "result", title: sum ? "首尾相接，求总量" : "看多出的部分，求相差量", explanation: `${sum ? `${show(A)} + ${show(B)}` : `${show(n(A) >= n(B) ? A : B)} − ${show(n(A) >= n(B) ? B : A)}`} = ${show(result)}（${u}）。`, shapes: [...resultShape, label("result-label", 400, 440, `${sum ? "合计" : "相差"} ${show(result)}${u}`)] },
    ], [{ value: show(result), unit: u }]);
}
function fractionProgram(text) {
    if (!hasOnlyQuantities(text, 3) || !/多少|几/.test(text))
        return null;
    const totalMatch = text.match(new RegExp(`${num}(个|本|支|颗|张|块)`));
    const partMatch = text.match(/(?:其中的|它的|总数的|的)([1-9]\d*)\/([1-9]\d*)/);
    if (!totalMatch || !partMatch || /剩|余|再|又/.test(text))
        return null;
    const count = Number(partMatch[2]), selected = Number(partMatch[1]), total = f(totalMatch[1]), u = totalMatch[2];
    if (count > 10 || selected >= count || n(total) <= 0 || !Number.isInteger(n(total.div(count))))
        return null;
    const each = total.div(count), result = each.mul(selected), width = 540 / count;
    if ((show(each).length + 1) * 19 > width - 8)
        return null;
    const blocks = (highlight) => Array.from({ length: count }, (_, i) => [rect(`part-${i}`, 130 + i * width, 210, width, 100, highlight && i < selected ? "change" : "base"), label(`part-label-${i}`, 130 + (i + .5) * width, 270, `${show(each)}${u}`)]).flat();
    return program("fraction", text, [
        { id: "divide", title: "分母表示平均分成几份", explanation: `${show(total)} ÷ ${count} = ${show(each)}（${u}）。先把整体平均分成${count}份。`, shapes: [...blocks(false), label("total", 400, 165, `整体 ${show(total)}${u}`)] },
        { id: "select", title: "分子表示取其中几份", explanation: `取${selected}份：${show(each)} × ${selected} = ${show(result)}（${u}）。黄色部分表示整体的${selected}/${count}。`, shapes: [...blocks(true), label("selected", 400, 380, `${selected}/${count} 对应 ${show(result)}${u}`)] },
    ], [{ value: show(result), unit: u }]);
}
function teachingPlannerPrompt(program) {
    return {
        system: "你是小学数学教学步骤编排器。题型和计算已由程序核验。只返回 JSON。按顺序把全部 stages 分为2到6组，不遗漏、不重复、不调序。只有开头的条件步骤given可以与紧接着的第一步合并，其他独立推理步骤必须各占一组，确保每个变化都有对应画面。不能填写公式、坐标或改写条件。",
        prompt: JSON.stringify({ stages: program.stages.map(({ id, title, explanation }) => ({ id, title, explanation })), output: { groups: [["given"], ["result"]] } }),
    };
}
function assembleTeachingLesson(session, program, plan) {
    let groups = program.stages.map((stage) => [stage.id]);
    if (plan !== undefined) {
        const candidate = plan?.groups;
        if (!Array.isArray(candidate) || candidate.length < 2 || candidate.length > 6 || candidate.some((g) => !Array.isArray(g) || !g.length || g.length > 2 || g.some((id) => typeof id !== "string")) || JSON.stringify(candidate.flat()) !== JSON.stringify(program.stages.map((s) => s.id)))
            throw new Error("步骤编排没有完整覆盖已核验过程");
        groups = candidate;
        if (groups.some((group, index) => group.length > 1 && (index !== 0 || group[0] !== "given")))
            throw new Error("独立的演算变化必须保留对应画面");
    }
    const frames = groups.map((group, index) => {
        const stages = group.map((id) => program.stages.find((stage) => stage.id === id));
        const last = stages.at(-1);
        const scene = { version: 1, template: program.template, worldId: program.worldId, stageIds: group, shapes: last.shapes, sourceQuotes: program.sourceQuotes };
        return { id: `frame-${index + 1}`, index: index + 1, title: stages.map((s) => s.title).join("；"), calculation: stages.map((s) => s.explanation).join("\n\n"), transition: index ? `沿用同一题目的数量与比例，继续${last.title}。` : "从原题给出的条件开始。", alt: stages.map((s) => s.explanation).join(" "), imageUrl: `data:image/svg+xml;base64,${Buffer.from((0, teaching_scene_1.teachingSceneSvg)(scene)).toString("base64")}`, scene };
    });
    return { version: 1, requestId: session.requestId, problemFingerprint: (0, illustration_fingerprint_1.illustrationFingerprint)(session), title: "跟着图形，一步一步理解", frameCount: frames.length, frames };
}
