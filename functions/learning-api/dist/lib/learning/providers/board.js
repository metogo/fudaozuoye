"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boardLessonSystemPrompt = boardLessonSystemPrompt;
exports.boardLessonPrompt = boardLessonPrompt;
exports.boardLessonTool = boardLessonTool;
exports.boardContentTool = boardContentTool;
exports.boardAnnotationsTool = boardAnnotationsTool;
exports.boardAnnotationsPrompt = boardAnnotationsPrompt;
exports.parseBoardLesson = parseBoardLesson;
exports.parseBoardContent = parseBoardContent;
exports.parseBoardAnnotations = parseBoardAnnotations;
exports.createSafeBoardLesson = createSafeBoardLesson;
exports.addSafeBoardAnnotations = addSafeBoardAnnotations;
exports.createSafeBoardVisual = createSafeBoardVisual;
exports.boardAuditSystemPrompt = boardAuditSystemPrompt;
exports.boardAuditPrompt = boardAuditPrompt;
exports.parseBoardAudit = parseBoardAudit;
const presentation_1 = require("../presentation");
function boardLessonSystemPrompt() {
    return [
        "你是中国 K12 数理化板书设计老师。你要重新组织一份完整、可视化的教学板书，不是把聊天内容改成长卡片。",
        "板书必须让学生在同一画面看清：任务与条件、核心关系、推理链、为什么成立、易错点或自查。根据题目选择 4 到 6 块，不能凑数。",
        "只有图形、光路、数量关系或过程关系能明显降低理解成本时才配教学示意图；否则 visual.kind 必须为 none。配图只能表达题干或当前知识节点已有事实，不能补画未给出的条件。",
        "配图使用 0 到 100 的横坐标和 0 到 68 的纵坐标；最多 16 个图元。evidence 必须逐字匹配 context.problem 或 context.node.evidence，是配图成立的直接依据。",
        "配图是示意图，不按比例；不得在标签、图注或图形关系中泄露最终答案或完整解题步骤。",
        "当前仍处于引导学习阶段：不得给最终答案，不得给可直接照抄的完整解题步骤。",
        "重点标记必须是你基于教学重要性选择的精确原文片段：优先标公式、关键条件、关系转折或易错边界，不得机械截取每段开头。",
        "每个标记必须解释为什么值得标；target 必须逐字存在于对应 block content 中，长度 2 到 28 字，且在该段只出现一次。",
        "只返回指定 JSON 结构，不输出结构之外的说明。block label 使用无公式的短标题；block content、annotation reason、visual title/caption/evidence 中的数学与物理公式必须使用 KaTeX 兼容 LaTeX，行内写在 $...$ 中，不得使用 HTML。",
        "visual element label 只允许点名、线段名或不含公式的短文字；需要展示的公式写进 caption，不要把 $、反斜杠或等式塞进 SVG 标签。",
    ].join("\n");
}
function boardLessonPrompt(session, scope, suggestion) {
    const directIds = new Set(session.edges.filter((edge) => edge.to === session.rootNodeId).map((edge) => edge.from));
    const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
    if (scope.kind === "node" && !node)
        throw new Error("板书对应的知识节点不存在");
    const context = node ? {
        focus: "当前知识卡点",
        problem: session.problem.text,
        node: {
            title: node.title,
            evidence: node.diagnosticEvidence,
            reason: node.simplification,
            explanation: node.teaching.explanation,
            example: node.teaching.example,
            misconception: node.teaching.misconception,
            question: node.teaching.parentPrompt,
        },
    } : {
        focus: "原题核心思路",
        problem: session.problem.text,
        guide: session.problemGuide,
        directConcepts: session.nodes.filter((item) => item.kind === "concept" && directIds.has(item.id)).map((item) => ({
            title: item.title,
            evidence: item.diagnosticEvidence,
            reason: item.simplification,
        })),
    };
    return JSON.stringify({
        task: "把当前教学内容重组为一张独立可读的板书",
        preferredLayout: suggestion.layout,
        decisionReason: suggestion.reason,
        context,
    });
}
function boardLessonTool() {
    return {
        type: "function",
        function: {
            name: "submit_board_lesson",
            description: "提交重新组织后的完整教学板书、精确重点标记与可选教学示意图",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    blocks: {
                        type: "array",
                        minItems: 4,
                        maxItems: 6,
                        items: {
                            type: "object",
                            properties: {
                                label: { type: "string" },
                                content: { type: "string" },
                                tone: { type: "string", enum: ["plain", "key", "example"] },
                            },
                            required: ["label", "content", "tone"],
                            additionalProperties: false,
                        },
                    },
                    annotations: {
                        type: "array",
                        minItems: 2,
                        maxItems: 8,
                        items: {
                            type: "object",
                            properties: {
                                blockIndex: { type: "integer", minimum: 0, maximum: 5 },
                                target: { type: "string", description: "对应区块中的唯一连续原文，2 到 28 字" },
                                kind: { type: "string", enum: ["circle", "underline", "box"] },
                                reason: { type: "string" },
                            },
                            required: ["blockIndex", "target", "kind", "reason"],
                            additionalProperties: false,
                        },
                    },
                    visual: boardVisualSchema(),
                },
                required: ["title", "blocks", "annotations", "visual"],
                additionalProperties: false,
            },
        },
    };
}
function boardContentTool() {
    return {
        type: "function",
        function: {
            name: "submit_board_content",
            description: "提交完整板书正文与可选教学示意图；重点标记在下一步单独生成",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    blocks: {
                        type: "array", minItems: 4, maxItems: 6,
                        items: {
                            type: "object",
                            properties: {
                                label: { type: "string" }, content: { type: "string" },
                                tone: { type: "string", enum: ["plain", "key", "example"] },
                            },
                            required: ["label", "content", "tone"], additionalProperties: false,
                        },
                    },
                    visual: boardVisualSchema(),
                },
                required: ["title", "blocks", "visual"], additionalProperties: false,
            },
        },
    };
}
function boardAnnotationsTool(blockCount) {
    return {
        type: "function",
        function: {
            name: "submit_board_annotations",
            description: "只从已完成的板书正文中选择精确重点，不改写正文",
            parameters: {
                type: "object",
                properties: {
                    annotations: {
                        type: "array", minItems: 2, maxItems: 8,
                        items: {
                            type: "object",
                            properties: {
                                blockIndex: { type: "integer", minimum: 0, maximum: blockCount - 1 },
                                target: { type: "string" },
                                kind: { type: "string", enum: ["circle", "underline", "box"] },
                                reason: { type: "string" },
                            },
                            required: ["blockIndex", "target", "kind", "reason"], additionalProperties: false,
                        },
                    },
                },
                required: ["annotations"], additionalProperties: false,
            },
        },
    };
}
function boardAnnotationsPrompt(lesson) {
    return JSON.stringify({
        task: "从以下板书正文中选出 2 到 8 个真正影响理解的精确重点；宁少勿滥。target 必须是对应 content 中唯一、连续的 2 到 28 个字，至少覆盖两个区块，不得集中在段首",
        blocks: lesson.blocks.map(({ label, content }, blockIndex) => ({ blockIndex, label, content })),
    });
}
function parseBoardLesson(value, session, suggestion) {
    return parseBoardAnnotations(value, parseBoardContent(value, session, suggestion), session);
}
function parseBoardContent(value, session, suggestion) {
    const title = text(value.title, "板书标题", 4, 40);
    (0, presentation_1.assertBalancedLearningMarkup)(title, "板书标题");
    if (!Array.isArray(value.blocks) || value.blocks.length < 4 || value.blocks.length > 6)
        throw new Error("板书必须包含 4 到 6 个有明确职责的区块");
    const blocks = value.blocks.map((raw, index) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            throw new Error("板书区块结构不合法");
        const block = raw;
        const tone = block.tone;
        if (tone !== "plain" && tone !== "key" && tone !== "example")
            throw new Error("板书区块强调类型不合法");
        const label = text(block.label, "板书区块标题", 2, 18);
        if (/[$\\<>]/.test(label))
            throw new Error("板书区块标题必须是无公式、无标记的短标题");
        const content = text(block.content, "板书区块内容", 20, 260);
        (0, presentation_1.assertBalancedLearningMarkup)(content, `板书区块“${label}”`);
        return {
            id: `board-${index + 1}`,
            label,
            content,
            tone,
        };
    });
    if (new Set(blocks.map((block) => compact(block.label))).size !== blocks.length)
        throw new Error("板书区块职责不能重复");
    const visual = parseBoardVisual(value.visual, session) ?? createSafeBoardVisual(session, suggestion);
    assertNoAnswerLeak(session, title, blocks, [], visual);
    return {
        title,
        subtitle: suggestion.reason,
        layout: suggestion.layout,
        blocks,
        annotations: [],
        visual,
        returnLabel: session.flow.activeGate?.title ?? "回到刚才的学习任务",
    };
}
function parseBoardAnnotations(value, lesson, session) {
    if (!Array.isArray(value.annotations) || value.annotations.length < 2 || value.annotations.length > 8)
        throw new Error("板书必须包含 2 到 8 个有教学依据的重点");
    const annotations = value.annotations.map((raw) => parseAnnotation(raw, lesson.blocks));
    assertAnnotations(annotations, lesson.blocks);
    assertNoAnswerLeak(session, lesson.title, lesson.blocks, annotations, lesson.visual);
    return { ...lesson, annotations };
}
function createSafeBoardLesson(session, scope, suggestion) {
    const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
    const blocks = node ? [
        { id: "board-1", label: "原题定位", content: `先回到原题中的这条信息：${node.diagnosticEvidence || node.simplification}。它决定了当前要补的基础。`, tone: "plain" },
        { id: "board-2", label: "核心关系", content: `这里真正要理解的是“${node.title}”：${node.teaching.explanation}`, tone: "key" },
        { id: "board-3", label: "小例子", content: `先用一个更小的情境观察同一关系：${node.teaching.example}`, tone: "example" },
        { id: "board-4", label: "易错边界", content: `要特别避开这个误区：${node.teaching.misconception}`, tone: "plain" },
        { id: "board-5", label: "自己确认", content: `现在用自己的话回答：${node.teaching.parentPrompt} 能说清关系，才算真的理解。`, tone: "key" },
    ] : [
        { id: "board-1", label: "题目任务", content: `先不计算，明确这道题最终要完成什么：${session.problemGuide.goal}`, tone: "plain" },
        { id: "board-2", label: "关键条件", content: `从题干中抓住会改变解题方向的信息：${session.problemGuide.keyClue}`, tone: "key" },
        { id: "board-3", label: "条件关系", content: `把条件连接起来，而不是逐句抄写：${session.problemGuide.approach}`, tone: "example" },
        { id: "board-4", label: "第一突破口", content: `动笔前先回答这个问题：${session.problemGuide.firstQuestion}`, tone: "plain" },
        { id: "board-5", label: "动笔自查", content: "先说清要求，再指出决定第一步的条件；两者能连起来，才开始列式或推导。", tone: "key" },
    ];
    try {
        const annotations = node ? [
            annotation(blocks[0], node.diagnosticEvidence || "当前要补的基础", "underline", "这是当前讲解与原题发生联系的直接证据。"),
            annotation(blocks[1], node.title, "circle", "这是本次板书要真正讲透的核心概念。"),
            annotation(blocks[3], "这个误区", "box", "这里最容易让后续推理偏离，做题时需要主动检查。"),
        ] : [
            annotation(blocks[0], "最终要完成什么", "circle", "先锁定问题目标，避免被题干细节带偏。"),
            annotation(blocks[1], "改变解题方向的信息", "underline", "这类条件决定应该建立哪一种关系。"),
            annotation(blocks[2], "把条件连接起来", "box", "解题的关键不是抄条件，而是找出条件之间的作用。"),
        ];
        assertAnnotations(annotations, blocks);
        const visual = createSafeBoardVisual(session, suggestion);
        assertNoAnswerLeak(session, node?.title ?? "把题目关系铺开来看", blocks, annotations, visual);
        return { title: node?.title ?? "把题目关系铺开来看", subtitle: suggestion.reason, layout: suggestion.layout, blocks, annotations, visual, returnLabel: session.flow.activeGate?.title ?? "回到刚才的学习任务" };
    }
    catch {
        return createNeutralBoardLesson(session, suggestion);
    }
}
function addSafeBoardAnnotations(lesson, session) {
    const reasons = [
        "这处信息决定接下来应该关注什么。",
        "这处关系是连接已知与下一步的关键。",
        "这里最容易在动笔时被忽略，需要主动检查。",
    ];
    const kinds = ["circle", "underline", "box"];
    const annotations = lesson.blocks.slice(0, 3).map((block, index) => ({
        blockId: block.id,
        target: uniqueExcerpt(block.content),
        kind: kinds[index],
        reason: reasons[index],
    }));
    assertAnnotations(annotations, lesson.blocks);
    assertNoAnswerLeak(session, lesson.title, lesson.blocks, annotations, lesson.visual);
    return { ...lesson, annotations };
}
function createNeutralBoardLesson(session, suggestion) {
    const blocks = [
        { id: "board-1", label: "先定目标", content: "先用自己的话说清当前一步要解决什么，暂时不追求最后结果。", tone: "plain" },
        { id: "board-2", label: "整理信息", content: "把已经知道的信息和还需要寻找的信息分开，避免把条件混在一起。", tone: "key" },
        { id: "board-3", label: "连接关系", content: "每次只连接一组信息，并说明这一步为什么成立，再继续向后推。", tone: "example" },
        { id: "board-4", label: "检查边界", content: "动笔后回看单位、符号和条件是否都被正确使用，不凭感觉跳步。", tone: "plain" },
        { id: "board-5", label: "自己复述", content: "合上提示后再说一遍目标、关键关系和第一步，能讲清才继续作答。", tone: "key" },
    ];
    const lesson = {
        title: "把当前思路整理清楚",
        subtitle: "先用稳定的学习结构整理当前步骤，再回到原题继续推进。",
        layout: suggestion.layout,
        blocks,
        annotations: [],
        visual: createSafeBoardVisual(session, suggestion),
        returnLabel: session.flow.activeGate?.title ?? "回到刚才的学习任务",
    };
    const annotations = blocks.slice(0, 3).map((block, index) => ({
        blockId: block.id,
        target: uniqueExcerpt(block.content),
        kind: ["circle", "underline", "box"][index],
        reason: ["先锁定学习目标，避免被细节带偏。", "分清信息角色后才容易找到连接方式。", "逐步说明依据可以及时发现错误跳步。"][index],
    }));
    assertAnnotations(annotations, blocks);
    return { ...lesson, annotations };
}
function createSafeBoardVisual(session, suggestion) {
    const problem = session.problem.text;
    const pointLabels = [...new Set(problem.match(/[A-Z]/g) ?? [])].slice(0, 3);
    const hasGeometry = /(?:△|三角形)/.test(problem) && pointLabels.length === 3;
    const hasOptics = /(?:透镜|光屏|光路|折射|反射|焦距|成像)/.test(problem);
    const hasStructuredRelation = suggestion.layout !== "steps"
        || problem.length >= 12 && (/(?:已知|若|当|其中|分别|关系|变化|速度|路程|时间|质量|浓度|方程|函数|电路|受力|反应|等于|相比|每|倍|分之)/.test(problem)
            || (problem.match(/[=＋+－\-×÷*/]/g)?.length ?? 0) >= 1);
    if (!hasGeometry && !hasOptics && !hasStructuredRelation)
        return null;
    const evidence = exactEvidence(problem);
    const relationElements = [
        { type: "rect", x: 4, y: 22, width: 24, height: 20, label: "题目条件" },
        { type: "arrow", x: 30, y: 32, x2: 42, y2: 32 },
        { type: "rect", x: 43, y: 22, width: 24, height: 20, label: "核心关系" },
        { type: "arrow", x: 69, y: 32, x2: 81, y2: 32 },
        { type: "rect", x: 72, y: 22, width: 24, height: 20, label: "当前任务" },
    ];
    const geometryElements = [
        { type: "line", x: 18, y: 52, x2: 50, y2: 10 },
        { type: "line", x: 50, y: 10, x2: 82, y2: 52 },
        { type: "line", x: 82, y: 52, x2: 18, y2: 52 },
        { type: "point", x: 50, y: 10, label: pointLabels[0] },
        { type: "point", x: 18, y: 52, label: pointLabels[1] },
        { type: "point", x: 82, y: 52, label: pointLabels[2] },
    ];
    const visual = hasGeometry
        ? {
            kind: "geometry",
            title: "把图形位置先摆清楚",
            evidence,
            caption: "先在示意图上对应题干中的点、边和角，再把条件逐一放回图中；图形不按比例。",
            elements: geometryElements,
        }
        : {
            kind: hasOptics ? "optics" : "relation",
            title: hasOptics ? "把光学条件连成关系" : "把已知与任务连起来",
            evidence,
            caption: "这张图只整理题干信息的角色：从已知条件找到核心关系，再指向当前要完成的任务。",
            elements: relationElements,
        };
    assertNoAnswerLeak(session, "", [], [], visual);
    return visual;
}
function boardVisualSchema() {
    return {
        type: "object",
        description: "可选教学示意图。不需要配图时 kind=none，其余文字留空、elements 为空数组。",
        properties: {
            kind: { type: "string", enum: ["none", "geometry", "optics", "process", "relation"] },
            title: { type: "string" },
            evidence: { type: "string", description: "逐字来自题干或当前知识节点的配图依据" },
            caption: { type: "string", description: "说明这张图帮助学生看清什么，不写答案" },
            elements: {
                type: "array", maxItems: 16,
                items: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: ["point", "line", "arrow", "circle", "rect", "arc"] },
                        x: { type: "number", minimum: 0, maximum: 100 },
                        y: { type: "number", minimum: 0, maximum: 68 },
                        x2: { type: "number", minimum: 0, maximum: 100 },
                        y2: { type: "number", minimum: 0, maximum: 68 },
                        width: { type: "number", minimum: 1, maximum: 100 },
                        height: { type: "number", minimum: 1, maximum: 68 },
                        radius: { type: "number", minimum: 1, maximum: 34 },
                        startAngle: { type: "number", minimum: -360, maximum: 360 },
                        endAngle: { type: "number", minimum: -360, maximum: 360 },
                        label: { type: "string", maxLength: 12 },
                    },
                    required: ["type", "x", "y"], additionalProperties: false,
                },
            },
        },
        required: ["kind", "title", "evidence", "caption", "elements"], additionalProperties: false,
    };
}
function parseBoardVisual(raw, session) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("板书配图结构不合法");
    const value = raw;
    if (value.kind === "none") {
        if (!Array.isArray(value.elements) || value.elements.length !== 0)
            throw new Error("无需配图时不能生成图元");
        return null;
    }
    if (value.kind !== "geometry" && value.kind !== "optics" && value.kind !== "process" && value.kind !== "relation")
        throw new Error("板书配图类型不合法");
    const evidence = text(value.evidence, "板书配图依据", 4, 80);
    if (!visualEvidenceSources(session).some((source) => source.includes(evidence)))
        throw new Error("板书配图依据必须逐字来自题干或当前知识节点");
    if (!Array.isArray(value.elements) || value.elements.length < 2 || value.elements.length > 16)
        throw new Error("板书配图必须包含 2 到 16 个有效图元");
    const elements = value.elements.map(parseVisualElement);
    const title = text(value.title, "板书配图标题", 2, 24);
    const caption = text(value.caption, "板书配图说明", 6, 80);
    (0, presentation_1.assertBalancedLearningMarkup)(title, "板书配图标题");
    (0, presentation_1.assertBalancedLearningMarkup)(caption, "板书配图说明");
    const visual = {
        kind: value.kind,
        title,
        evidence,
        caption,
        elements,
    };
    assertNoAnswerLeak(session, "", [], [], visual);
    return visual;
}
function parseVisualElement(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("板书图元结构不合法");
    const value = raw;
    const allowed = ["point", "line", "arrow", "circle", "rect", "arc"];
    if (!allowed.includes(value.type))
        throw new Error("板书图元类型不合法");
    const type = value.type;
    const element = { type, x: coordinate(value.x, 100), y: coordinate(value.y, 68) };
    if (typeof value.label === "string" && value.label.trim()) {
        const label = text(value.label, "板书图元标签", 1, 12);
        if (/[$\\=<>√×÷+\-*/^πθαβγ]|(?:sin|cos|tan|cot)\b|[₀-₉²³⁴⁵⁶⁷⁸⁹⁰]/i.test(label))
            throw new Error("板书图元标签不能承载公式，公式应写入图注");
        element.label = label;
    }
    if (type === "line" || type === "arrow") {
        element.x2 = coordinate(value.x2, 100);
        element.y2 = coordinate(value.y2, 68);
        if (element.x === element.x2 && element.y === element.y2)
            throw new Error("板书线段不能没有长度");
    }
    else if (type === "circle") {
        element.radius = dimension(value.radius, 34, "圆半径");
        if (element.x - element.radius < 0 || element.x + element.radius > 100 || element.y - element.radius < 0 || element.y + element.radius > 68)
            throw new Error("板书圆形超出画布");
    }
    else if (type === "rect") {
        element.width = dimension(value.width, 100, "矩形宽度");
        element.height = dimension(value.height, 68, "矩形高度");
        if (element.x + element.width > 100 || element.y + element.height > 68)
            throw new Error("板书矩形超出画布");
    }
    else if (type === "arc") {
        element.radius = dimension(value.radius, 34, "圆弧半径");
        element.startAngle = angle(value.startAngle);
        element.endAngle = angle(value.endAngle);
        if (element.startAngle === element.endAngle)
            throw new Error("板书圆弧不能没有角度");
        if (element.x - element.radius < 0 || element.x + element.radius > 100 || element.y - element.radius < 0 || element.y + element.radius > 68)
            throw new Error("板书圆弧超出画布");
    }
    return element;
}
function visualEvidenceSources(session) {
    return [
        session.problem.text,
        ...session.nodes.flatMap((node) => node.kind === "concept" ? [node.diagnosticEvidence] : []),
    ].filter((value) => typeof value === "string" && value.length > 0);
}
function exactEvidence(problem) {
    const normalized = problem.trim();
    if (normalized.length < 4)
        throw new Error("原题不足以支持板书配图");
    const sentence = normalized.split(/[。！？!?\n]/).map((item) => item.trim()).find((item) => item.length >= 4);
    return (sentence ?? normalized).slice(0, 80);
}
function coordinate(value, maximum) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum)
        throw new Error("板书图元坐标不合法");
    return value;
}
function dimension(value, maximum, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maximum)
        throw new Error(`板书${label}不合法`);
    return value;
}
function angle(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < -360 || value > 360)
        throw new Error("板书圆弧角度不合法");
    return value;
}
function parseAnnotation(raw, blocks) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("板书重点结构不合法");
    const item = raw;
    if (!Number.isInteger(item.blockIndex) || Number(item.blockIndex) < 0 || Number(item.blockIndex) >= blocks.length)
        throw new Error("板书重点没有关联到有效区块");
    const kind = item.kind;
    if (kind !== "circle" && kind !== "underline" && kind !== "box")
        throw new Error("板书重点标记类型不合法");
    const block = blocks[Number(item.blockIndex)];
    const rawTarget = text(item.target, "板书重点", 2, 28);
    if (!block.content.includes(rawTarget) || block.content.split(rawTarget).length !== 2)
        throw new Error("板书重点必须是对应区块中唯一、连续的真实原文");
    const target = expandProtectedTarget(block.content, rawTarget);
    if (block.content.split(target).length !== 2)
        throw new Error("板书重点扩展后必须仍是唯一真实原文");
    const reason = text(item.reason, "重点标记理由", 8, 70);
    (0, presentation_1.assertBalancedLearningMarkup)(reason, "重点标记理由");
    return { blockId: block.id, target, kind, reason };
}
function expandProtectedTarget(content, target) {
    const start = content.indexOf(target);
    const end = start + target.length;
    const range = Array.from(content.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]*`/g))
        .map((match) => ({ start: match.index, end: match.index + match[0].length }))
        .find((candidate) => start >= candidate.start && end <= candidate.end);
    return range ? content.slice(range.start, range.end) : target;
}
function assertAnnotations(annotations, blocks) {
    if (new Set(annotations.map((item) => `${item.blockId}:${item.target}`)).size !== annotations.length)
        throw new Error("板书重点不能重复");
    if (new Set(annotations.map((item) => item.blockId)).size < 2)
        throw new Error("板书重点不能全部集中在同一个区块");
    if (annotations.some((item) => blocks.find((block) => block.id === item.blockId)?.content.split(item.target).length !== 2))
        throw new Error("板书重点必须是对应区块中唯一、连续的真实原文");
    const positions = annotations.map((item) => ({ ...item, start: blocks.find((block) => block.id === item.blockId).content.indexOf(item.target) }));
    if (positions.every((item) => item.start <= 2))
        throw new Error("板书重点不能机械截取每段开头");
    for (const current of positions) {
        if (positions.some((other) => other !== current && other.blockId === current.blockId && current.start < other.start + other.target.length && other.start < current.start + current.target.length))
            throw new Error("同一区块的板书重点不能相互重叠");
    }
}
function assertNoAnswerLeak(session, title, blocks, annotations, visual) {
    const root = session.nodes.find((item) => item.id === session.rootNodeId);
    const visibleText = [
        title,
        ...blocks.flatMap((block) => [block.label, block.content]),
        ...annotations.flatMap((annotation) => [annotation.target, annotation.reason]),
        ...(visual ? [visual.title, visual.evidence, visual.caption, ...visual.elements.map((element) => element.label ?? "")] : []),
    ].join("\n");
    const boardText = compact(visibleText);
    const answer = compact(root?.check.answer ?? "");
    const explanation = compact(root?.check.explanation ?? "");
    if (answer.length >= 2 && boardText.includes(answer))
        throw new Error("板书不能提前泄露原题最终答案");
    if (answer && answer.length < 2 && shortAnswerLeak(visibleText, answer))
        throw new Error("板书不能提前泄露原题最终答案");
    if (explanation.length >= 12 && boardText.includes(explanation))
        throw new Error("板书不能提前给出原题完整解法");
}
function boardAuditSystemPrompt() {
    return [
        "你是独立的中国 K12 板书事实审校员，不参与生成板书。",
        "逐项核对候选板书是否忠于原题与已验证教学上下文，公式、数值、单位、条件关系和推理方向是否正确。",
        "检查它是否提前泄露最终答案或完整可照抄步骤，检查标记目标和理由是否真是教学重点而非装饰。",
        "若候选包含 visual，逐个核对图元、标签、方向、位置关系是否忠于 sourceOfTruth，并确认 evidence 是真实直接依据；无配图时 visualCorrect 与 visualGrounded 返回 true。",
        "不能因为结构完整就通过；任何事实错误、无依据扩写或答案泄露都必须拒绝。只输出严格 JSON。",
    ].join("\n");
}
function boardAuditPrompt(session, scope, lesson) {
    const node = scope.kind === "node" ? session.nodes.find((item) => item.id === scope.nodeId && item.kind === "concept") : undefined;
    const root = session.nodes.find((item) => item.id === session.rootNodeId);
    return JSON.stringify({
        sourceOfTruth: node ? {
            problem: session.problem,
            focusNode: { title: node.title, evidence: node.diagnosticEvidence, reason: node.simplification, teaching: node.teaching },
        } : {
            problem: session.problem,
            problemGuide: session.problemGuide,
            verifiedConcepts: session.nodes.filter((item) => item.kind === "concept").map((item) => ({ title: item.title, evidence: item.diagnosticEvidence, reason: item.simplification })),
        },
        protectedAnswer: root ? { answer: root.check.answer, explanation: root.check.explanation } : null,
        candidate: lesson,
        output: { correct: true, grounded: true, noAnswerLeak: true, markingRelevant: true, visualCorrect: true, visualGrounded: true, reason: "逐项审校依据" },
    });
}
function parseBoardAudit(value) {
    const fields = ["correct", "grounded", "noAnswerLeak", "markingRelevant", "visualCorrect", "visualGrounded"];
    if (fields.some((field) => typeof value[field] !== "boolean"))
        throw new Error("板书事实审校结果不完整");
    const reason = text(value.reason, "板书事实审校依据", 4, 160);
    return { passed: fields.every((field) => value[field] === true), reason };
}
function shortAnswerLeak(visibleText, answer) {
    const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:最终答案|答案|最终结果|计算结果)\\s*(?:是|为|等于|[:：])?\\s*${escaped}(?![\\p{L}\\p{N}.])`, "iu").test(visibleText.normalize("NFKC"));
}
function annotation(block, preferred, kind, reason) {
    const preferredIsUnique = block.content.split(preferred).length === 2;
    const target = preferredIsUnique ? preferred : uniqueExcerpt(block.content);
    return { blockId: block.id, target, kind, reason };
}
function uniqueExcerpt(content) {
    for (let start = Math.min(8, Math.max(0, content.length - 2)); start < content.length - 1; start += 1) {
        const candidate = content.slice(start, Math.min(start + 12, content.length));
        if (candidate.length >= 2 && content.split(candidate).length === 2)
            return candidate;
    }
    throw new Error("板书区块中没有可精确标记的唯一原文");
}
function text(value, label, minimum, maximum) {
    if (typeof value !== "string")
        throw new Error(`${label}缺失`);
    const result = value.trim();
    if (result.length < minimum || result.length > maximum)
        throw new Error(`${label}长度不合法`);
    return result;
}
function compact(value) {
    return value.normalize("NFKC").replace(/[\s，。；：、“”‘’（）()\[\]【】]/g, "").toLowerCase();
}
