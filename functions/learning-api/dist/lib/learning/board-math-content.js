"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMathBoardContent = createMathBoardContent;
exports.createMathBoardBlocks = createMathBoardBlocks;
exports.createMathBoardAids = createMathBoardAids;
const board_content_contract_1 = require("./board-content-contract");
const board_latex_1 = require("./providers/board-latex");
function createMathBoardContent(problem) {
    const triangle = triangleVertices(problem);
    const relation = trigRelation(problem);
    if (!triangle || !relation || !relationFitsTriangle(triangle, relation) || !hasSideCorrespondence(problem, triangle))
        return null;
    const sides = {
        left: relation.left.toLowerCase(),
        cosine: relation.cosine.toLowerCase(),
        target: relation.target.toLowerCase(),
    };
    const targetSide = targetSideFromProblem(problem, triangle);
    if (!targetSide)
        return null;
    const evidence = factEvidence(problem, targetSide);
    const knownSides = directSideConditions(evidence, triangle);
    const area = areaCondition(evidence, triangle);
    const gaps = [
        ...(knownSides.length === 0 ? ["至少一条已知边长"] : []),
        ...(!area ? ["三角形面积"] : []),
    ];
    const expressions = {
        trig: `$\\sin ${relation.left}+\\sin ${relation.cosine}=2\\sin ${relation.target}\\cos ${relation.cosine}$`,
        sideRelation: `$${sides.left}+${sides.cosine}=2${sides.target}\\cos ${relation.cosine}$`,
        areaRelation: `$S=\\frac{1}{2}${sides.target}${sides.left}\\sin ${relation.cosine}$`,
        cosineRelation: `$${sides.cosine}^{2}=${sides.target}^{2}+${sides.left}^{2}-2${sides.target}${sides.left}\\cos ${relation.cosine}$`,
        reducedRelation: `$${sides.target}^{2}=${sides.cosine}(${sides.left}+${sides.cosine})$`,
    };
    return {
        kind: "triangle_trig_relation",
        evidence,
        triangle,
        relationAngles: relation,
        sides,
        targetSide,
        knownSides,
        ...(area ? { area } : {}),
        expressions,
        gaps,
    };
}
function createMathBoardBlocks(content) {
    const { expressions, sides, relationAngles } = content;
    const givens = [
        `一般三角形 $\\triangle ${content.triangle.join("")}$，角与同名小写边一一对应`,
        expressions.trig,
        content.knownSides.length > 0 ? content.knownSides.map((side) => `$${side.symbol}=${side.latex}$`).join("，") : "尚缺至少一条已知边长",
        content.area ? `$S=${content.area.latex}$` : "尚缺三角形面积",
    ].join("；");
    const gapNotice = content.gaps.length ? `当前缺少${content.gaps.join("和")}，只能整理关系，不能进入数值检验。` : "题干条件已经足以把三角关系压缩到一个待检验方程组。";
    const verification = content.gaps.length
        ? `用条件和反例排除误用。当前缺少${content.gaps.join("和")}，所以这里只能复核 ${expressions.sideRelation}、${expressions.areaRelation} 与 ${expressions.reducedRelation} 是否分别由正弦定理、面积公式和余弦定理推出；在条件补齐前不能代入候选值，也不能声称已经完成数值检验。`
        : `用条件和反例排除误用。把候选边长 $${content.targetSide}>0$ 与题干已知 ${knownSideSummary(content.knownSides)} 同时代入 ${expressions.sideRelation}、${expressions.areaRelation} 和 ${expressions.cosineRelation}，分别得到角 ${relationAngles.cosine} 的正弦与余弦；再检查 $\\sin ^2${relationAngles.cosine}+\\cos ^2${relationAngles.cosine}=1$、三边不等式和 $0<${relationAngles.cosine}<\\pi$。任一项不成立，该候选就不能保留。`;
    const blocks = [
        block(0, "题意成模", `明确对象、已知和待求。${givens}；待求边是 $${content.targetSide}$。${gapNotice}`),
        block(1, "关系结构", `把分散条件放进同一关系。由正弦定理 $\\frac{${sides.left}}{\\sin ${relationAngles.left}}=\\frac{${sides.cosine}}{\\sin ${relationAngles.cosine}}=\\frac{${sides.target}}{\\sin ${relationAngles.target}}$，原三角式可等价改写为 ${expressions.sideRelation}；面积条件同时写成 ${expressions.areaRelation}。这两式分别固定 $\\cos ${relationAngles.cosine}$ 与 $\\sin ${relationAngles.cosine}$。`),
        block(2, "依据变换", `逐步变形并写出理由。先对边 ${sides.cosine} 使用余弦定理：${expressions.cosineRelation}。再用 ${expressions.sideRelation} 替换其中的 $2${sides.target}\\cos ${relationAngles.cosine}$，消去余弦项，得到 ${expressions.reducedRelation}。这一步把角关系推进成纯边关系，但仍停在最终数值之前。`),
        block(3, "反查边界", verification),
        block(4, "迁移骨架", `提炼可复用的判断顺序。遇到“同一三角形中的正弦和式、边长、面积、待求边”时：① 用正弦定理把角式换成边式；② 用面积公式单独表示目标角的正弦；③ 用余弦定理与边式消去余弦；④ 用 $\\sin ^2\\theta+\\cos ^2\\theta=1$、正边和三边不等式复核。换字母或换数值时仍按这四步重建，不照搬本题数字。`),
    ];
    (0, board_content_contract_1.assertNativeMathBoardContent)(blocks, {
        relationExpressions: [expressions.sideRelation, expressions.areaRelation],
        derivationExpressions: [expressions.cosineRelation, expressions.reducedRelation],
    });
    return blocks;
}
function createMathBoardAids(content) {
    return [triangleVisual(content), formulaVisual(content)];
}
function triangleVisual(content) {
    const [first, second, third] = content.triangle;
    const sideLabels = new Map(content.triangle.map((angle) => {
        const symbol = angle.toLowerCase();
        const knownSide = content.knownSides.find((side) => side.symbol === symbol);
        const known = knownSide ? `=${plainScalar(knownSide.raw)}` : "";
        return [symbol, `${symbol}${known}`];
    }));
    const objects = [
        { type: "segment", from: second, to: third, label: sideLabels.get(first.toLowerCase()) },
        { type: "segment", from: third, to: first, label: sideLabels.get(second.toLowerCase()) },
        { type: "segment", from: first, to: second, label: sideLabels.get(third.toLowerCase()) },
    ];
    const angleVertex = content.relationAngles.cosine;
    const angleRays = content.triangle.filter((vertex) => vertex !== angleVertex);
    objects.push({ type: "angle", vertex: angleVertex, from: angleRays[0], to: angleRays[1], label: `∠${angleVertex}` });
    return {
        kind: "geometry_model",
        title: "让边角对应真正参与推导",
        evidence: content.evidence,
        caption: `顶点 ${content.triangle.join("、")} 分别表示同名角，对边依次标为 ${content.triangle.map((angle) => angle.toLowerCase()).join("、")}；图中已知量来自题干，示意图不代表真实比例。`,
        points: content.triangle.map((label) => ({ id: label, label })),
        objects,
    };
}
function formulaVisual(content) {
    return {
        kind: "formula_chain",
        title: "同一条关系怎样从角推进到边",
        evidence: content.evidence,
        caption: "每一行都对应正文中的同一步推导；只推进到可继续动笔的位置，不给出最终数值。",
        steps: [
            { id: "trig_to_side", expression: `$${mathBody(content.expressions.trig)}\\Rightarrow ${mathBody(content.expressions.sideRelation)}$`, explanation: "正弦定理把三个角的正弦换成各自对边的同比例量。" },
            { id: "area_relation", expression: content.expressions.areaRelation, explanation: `面积公式提供角 ${content.relationAngles.cosine} 的正弦关系。` },
            { id: "cosine_relation", expression: content.expressions.cosineRelation, explanation: `余弦定理提供同一角 ${content.relationAngles.cosine} 的余弦关系。` },
            { id: "eliminate_cosine", expression: content.expressions.reducedRelation, explanation: "把边式代入余弦定理，消去余弦项并保留纯边关系。" },
        ],
    };
}
function triangleVertices(problem) {
    const match = problem.match(/(?:△|\\triangle\s*|三角形\s*)([A-Z])\s*([A-Z])\s*([A-Z])/i);
    if (!match)
        return null;
    const labels = match.slice(1, 4).map((label) => label.toUpperCase());
    return new Set(labels).size === 3 ? labels : null;
}
function trigRelation(problem) {
    const normalized = problem.normalize("NFKC")
        .replace(/\\(?:operatorname\s*\{)?(sin|cos)\}?/gi, "$1")
        .replace(/[×·*]/g, "*")
        .replace(/÷/g, "/")
        .replace(/−/g, "-")
        .replace(/[{}$（）()\s]/g, "")
        .toUpperCase();
    const match = normalized.match(/(?<![A-Z0-9+*/^\-])SIN([A-Z])\+SIN([A-Z])=2\*?SIN([A-Z])\*?COS\2(?![A-Z0-9+*/^\-])/)
        ?? normalized.match(/(?<![A-Z0-9+*/^\-])SIN([A-Z])\+SIN([A-Z])=2\*?COS\2\*?SIN([A-Z])(?![A-Z0-9+*/^\-])/);
    if (!match || new Set(match.slice(1, 4)).size !== 3)
        return null;
    return { left: match[1], cosine: match[2], target: match[3] };
}
function relationFitsTriangle(triangle, relation) {
    return [relation.left, relation.cosine, relation.target].every((angle) => triangle.includes(angle));
}
function hasSideCorrespondence(problem, triangle) {
    const compact = problem.normalize("NFKC").replace(/[，,、；;。\s]/g, "").toLowerCase();
    const angles = triangle.join("").toLowerCase();
    const sides = triangle.map((angle) => angle.toLowerCase()).join("");
    return compact.includes(`角${angles}所对的边分别为${sides}`)
        || compact.includes(`角${angles}所对边分别为${sides}`)
        || compact.includes(`角${angles}的对边为${sides}`)
        || compact.includes(`${sides}分别是角${angles}的对边`)
        || compact.includes(`${sides}分别为角${angles}的对边`)
        || compact.replace(/∠/g, "角").includes(`${sides}分别为${triangle.map((angle) => `角${angle.toLowerCase()}`).join("")}对边`)
        || triangle.every((angle) => compact.includes(`${angle.toLowerCase()}是角${angle.toLowerCase()}的对边`));
}
function targetSideFromProblem(problem, triangle) {
    const questionClause = problem.split(/[。；;]/).reverse().find((part) => /(?:求|问|则|那么|计算)/.test(part)) ?? problem;
    for (const symbol of triangle.map((angle) => angle.toLowerCase())) {
        const angle = symbol.toUpperCase();
        if (new RegExp(`(?:角|∠)\\s*${symbol}(?:\\s*的)?(?:值|大小|度数|为多少)|${symbol}\\s*角|(?:求|计算)[^。；;？?]{0,6}(?:角|∠)\\s*${symbol}`, "i").test(questionClause)
            || new RegExp(`${angle}\\s*(?:的)?(?:值|度数|大小|角度|为多少)`).test(questionClause))
            continue;
        const pattern = new RegExp(`(?:求|问|则|那么|计算)?[^。；;？?]{0,8}(?:边长|边)?\\s*${symbol}\\s*(?:的)?(?:长|长度|值|是多少|为多少)|(?:求|计算)\\s*(?:边长|边)?\\s*${symbol}(?![A-Za-z])`);
        if (pattern.test(questionClause))
            return symbol;
    }
    return null;
}
function directSideConditions(problem, triangle) {
    return triangle.map((angle) => {
        const symbol = angle.toLowerCase();
        const marker = new RegExp(`(?:^|[^A-Za-z])${symbol}\\s*=\\s*`).exec(problem);
        if (!marker)
            return null;
        const raw = scalarAfter(problem.slice(marker.index + marker[0].length));
        const latex = raw ? scalarLatex(raw) : null;
        return raw && latex ? { symbol, raw, latex } : null;
    }).filter((condition) => condition !== null);
}
function areaCondition(problem, triangle) {
    const markers = Array.from(problem.matchAll(/(?:(?:△|\\triangle\s*|三角形)\s*([A-Z]{3})\s*(?:的)?)?面积\s*(?:为|是|=)\s*/gi));
    if (markers.length !== 1)
        return undefined;
    const marker = markers[0];
    if (marker[1] && marker[1].toUpperCase() !== triangle.join(""))
        return undefined;
    const precedingTriangles = Array.from(problem.slice(0, marker.index).matchAll(/(?:△|\\triangle\s*|三角形)\s*([A-Z]{3})/gi));
    const nearestTriangleMatch = precedingTriangles.at(-1);
    const nearestTriangle = nearestTriangleMatch?.[1].toUpperCase();
    if (!marker[1] && nearestTriangle && nearestTriangle !== triangle.join(""))
        return undefined;
    const precedingClause = problem.slice(Math.max(0, problem.lastIndexOf("。", marker.index) + 1), marker.index);
    const afterNamedTriangle = nearestTriangleMatch ? problem.slice((nearestTriangleMatch.index ?? 0) + nearestTriangleMatch[0].length, marker.index) : precedingClause;
    const newTriangleMentions = afterNamedTriangle.replace(/(?:该|此|这个|本)\s*三角形/g, "");
    if (!marker[1] && /三角形/.test(newTriangleMentions))
        return undefined;
    const raw = scalarAfter(problem.slice(marker.index + marker[0].length));
    const latex = raw ? scalarLatex(raw) : null;
    return raw && latex ? { symbol: "S", raw, latex } : undefined;
}
function scalarAfter(source) {
    const candidate = source
        .replace(/^\s*(?:\$|\\\()/, "")
        .split(/(?:\\\)|\$)?\s*(?:[，,；;。？?\n]|且|并且|则|那么|求|问)/, 1)[0]
        .trim()
        .replace(/(?:\$|\\\))\s*$/, "")
        .trim();
    if (!candidate || candidate.length > 36)
        return null;
    return /^[0-9A-Za-z+\-*/.√\\{}\s]+$/.test(candidate) ? candidate : null;
}
function scalarLatex(raw) {
    let value = raw.replace(/\s+/g, "").replace(/^\$|\$$/g, "");
    value = value.replace(/√\{?([A-Za-z0-9]+)\}?/g, "\\sqrt{$1}");
    if (!/^[0-9A-Za-z+\-*/.\\{}]+$/.test(value) || !/\d/.test(value))
        return null;
    const commandsRemoved = value.replace(/\\(?:sqrt|frac)/g, "");
    if (/[A-Za-z]/.test(commandsRemoved) || value.includes("-") || /^0+(?:\.0+)?$/.test(value))
        return null;
    if (!value.startsWith("\\frac")) {
        const slash = topLevelSlash(value);
        if (slash > 0 && slash < value.length - 1) {
            if (/[*/]/.test(value.slice(slash + 1)))
                return null;
            value = `\\frac{${value.slice(0, slash)}}{${value.slice(slash + 1)}}`;
        }
    }
    if (!isPositiveScalarLatex(value))
        return null;
    try {
        (0, board_latex_1.assertValidLatex)(`$${value}$`, "题干数值");
        return value;
    }
    catch {
        return null;
    }
}
function isPositiveScalarLatex(value) {
    const number = "(?:[1-9]\\d*(?:\\.\\d+)?|0\\.\\d*[1-9]\\d*)";
    const radical = `(?:${number})?\\\\sqrt\\{${number}\\}`;
    const atom = `(?:${number}|${radical})`;
    return new RegExp(`^(?:${atom}|\\\\frac\\{${atom}\\}\\{${number}\\})$`).test(value);
}
function topLevelSlash(value) {
    let depth = 0;
    for (let index = 0; index < value.length; index += 1) {
        if (value[index] === "{")
            depth += 1;
        else if (value[index] === "}")
            depth -= 1;
        else if (value[index] === "/" && depth === 0)
            return index;
    }
    return -1;
}
function evidenceBeforeQuestion(problem, targetSide) {
    const question = new RegExp(`(?:则|那么|求|问|计算)[^。；;？?]{0,12}(?:边\\s*)?${targetSide}\\s*(?:的)?(?:长|长度|值|是多少|为多少)?`, "i").exec(problem);
    const candidate = (question && question.index > 0 ? problem.slice(0, question.index) : problem.split(/[？?]/, 1)[0]).trim();
    return candidate.length >= 4 ? candidate : problem.trim();
}
function factEvidence(problem, targetSide) {
    const beforeQuestion = evidenceBeforeQuestion(problem, targetSide);
    const normalizedOption = /(?:^|[\s，,；;。！？!?])(?:[A-H][.、:：)）]|[（(][A-H][)）])\s*/.exec(beforeQuestion.normalize("NFKC"));
    const circledOption = /(?:^|[\s，,；;。！？!?])[①②③④⑤⑥⑦⑧]\s*/.exec(beforeQuestion);
    const optionIndex = Math.min(normalizedOption?.index ?? Number.POSITIVE_INFINITY, circledOption?.index ?? Number.POSITIVE_INFINITY);
    return (Number.isFinite(optionIndex) && optionIndex > 0 ? beforeQuestion.slice(0, optionIndex) : beforeQuestion).trim();
}
function plainScalar(raw) {
    return raw.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1/$2")
        .replace(/\\sqrt\s*\{([^{}]+)\}/g, "√$1")
        .replace(/[$\\{}]/g, "").replace(/sqrt/gi, "√").replace(/\s+/g, "").slice(0, 9);
}
function knownSideSummary(knownSides) {
    return knownSides.map((side) => `$${side.symbol}=${side.latex}$`).join("、");
}
function mathBody(expression) { return expression.replace(/^\$|\$$/g, ""); }
function block(index, label, content) {
    return { id: `board-${index + 1}`, label, content, tone: index === 1 || index === 4 ? "key" : index === 2 ? "example" : "plain" };
}
