"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.responsesBody = responsesBody;
exports.chatBody = chatBody;
exports.chatToolBody = chatToolBody;
exports.transferCheckTool = transferCheckTool;
exports.problemSolutionTool = problemSolutionTool;
exports.boardSuggestionTool = boardSuggestionTool;
exports.similarCheckTool = similarCheckTool;
exports.parseSimilarCheck = parseSimilarCheck;
exports.extractToolArguments = extractToolArguments;
exports.extractText = extractText;
exports.emitProviderDelta = emitProviderDelta;
exports.parseJsonObject = parseJsonObject;
exports.solutionSystemPrompt = solutionSystemPrompt;
exports.diagnosticSystemPrompt = diagnosticSystemPrompt;
exports.selectionSystemPrompt = selectionSystemPrompt;
exports.selectionOutputExample = selectionOutputExample;
exports.teachingOutputExample = teachingOutputExample;
function responsesBody(model, system, prompt, image, maxOutputTokens) {
    const content = image ? [{ type: "input_image", image_url: image, detail: "high" }, { type: "input_text", text: prompt }] : [{ type: "input_text", text: prompt }];
    return { model, instructions: system, input: [{ role: "user", content }], store: false, ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}) };
}
function chatBody(model, system, prompt, image, jsonMode = false, disableThinking = false, maxTokens = 3000) {
    const content = image ? [{ type: "image_url", image_url: { url: image } }, { type: "text", text: prompt }] : [{ type: "text", text: prompt }];
    return {
        model,
        messages: [{ role: "system", content: system }, { role: "user", content }],
        stream: false,
        max_tokens: maxTokens,
        ...(disableThinking ? { thinking: { type: "disabled" } } : {}),
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    };
}
function chatToolBody(model, system, prompt, tool, disableThinking = false, maxTokens = 3000) {
    const name = tool.function.name;
    return {
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        tools: [tool],
        tool_choice: { type: "function", function: { name } },
        stream: false,
        max_tokens: maxTokens,
        ...(disableThinking ? { thinking: { type: "disabled" } } : {}),
    };
}
function transferCheckTool() {
    return {
        type: "function",
        function: {
            name: "submit_transfer_check",
            description: "提交完整的迁移题、标准答案和解题依据",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "迁移题题干" },
                    answer: { type: "string", description: "可核验的标准答案" },
                    explanation: { type: "string", description: "简洁解题依据" },
                },
                required: ["prompt", "answer", "explanation"],
                additionalProperties: false,
            },
        },
    };
}
function problemSolutionTool() {
    return {
        type: "function",
        function: {
            name: "submit_problem_solution",
            description: "提交原题的可核验标准答案和完整解题依据",
            parameters: {
                type: "object",
                properties: {
                    originalAnswer: { type: "string" },
                    originalExplanation: { type: "string" },
                },
                required: ["originalAnswer", "originalExplanation"],
                additionalProperties: false,
            },
        },
    };
}
function boardSuggestionTool() {
    return {
        type: "function",
        function: {
            name: "submit_board_decision",
            description: "提交当前教学步骤是否需要结构化板书的判断",
            parameters: {
                type: "object",
                properties: {
                    recommended: { type: "boolean", description: "只有纯文字不足以清晰呈现当前关系时才为 true" },
                    reason: { type: "string", description: "6 到 100 字，面向学生说明为什么适合或不需要板书" },
                    layout: { type: "string", enum: ["relation", "steps", "comparison", "formula"] },
                },
                required: ["recommended", "reason", "layout"],
                additionalProperties: false,
            },
        },
    };
}
function similarCheckTool(type) {
    return {
        type: "function",
        function: {
            name: "submit_similar_check",
            description: "提交同知识点的新练习题、标准答案和解题依据，不提交来源标签",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "与当前题明显不同的新题题干" },
                    type: { type: "string", enum: [type] },
                    choices: { type: "array", items: { type: "string" }, description: "选择题为 2 到 5 个选项；简答题为空数组" },
                    answer: { type: "string", description: "可核验的标准答案" },
                    explanation: { type: "string", description: "简洁解题依据" },
                },
                required: ["prompt", "type", "choices", "answer", "explanation"],
                additionalProperties: false,
            },
        },
    };
}
function parseSimilarCheck(value, target) {
    const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
    const answer = typeof value.answer === "string" ? value.answer.trim() : "";
    const explanation = typeof value.explanation === "string" ? value.explanation.trim() : "";
    if (prompt.length < 6 || answer.length < 1 || explanation.length < 4)
        throw new Error("相似题缺少题干、答案或解题依据");
    if (compactCheckText(prompt) === compactCheckText(target.check.prompt))
        throw new Error("相似题不能复述当前检查题");
    if (value.type !== target.check.type)
        throw new Error("相似题的作答形式与当前检查不一致");
    const choices = Array.isArray(value.choices) ? value.choices.filter((choice) => typeof choice === "string").map((choice) => choice.trim()).filter(Boolean) : [];
    if (target.check.type === "choice") {
        if (choices.length < 2 || choices.length > 5 || new Set(choices.map(compactCheckText)).size !== choices.length)
            throw new Error("相似选择题的选项不合法");
        if (!choices.some((choice) => compactCheckText(choice) === compactCheckText(answer)))
            throw new Error("相似选择题的标准答案不在选项中");
    }
    const canonicalAnswer = target.check.type === "choice"
        ? choices.find((choice) => compactCheckText(choice) === compactCheckText(answer)) ?? answer
        : answer;
    return {
        id: `similar-${crypto.randomUUID().slice(0, 8)}`,
        conceptId: target.conceptId,
        type: target.check.type,
        prompt,
        ...(target.check.type === "choice" ? { choices } : {}),
        answer: canonicalAnswer,
        explanation,
    };
}
function extractToolArguments(payload) {
    const choices = payload.choices;
    const argumentsText = choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (argumentsText)
        return argumentsText;
    throw new Error("模型没有调用指定的结构函数");
}
function extractText(payload, protocol) {
    if (protocol === "chat-completions") {
        const choices = payload.choices;
        const text = choices?.[0]?.message?.content;
        if (text)
            return text;
    }
    if (typeof payload.output_text === "string")
        return payload.output_text;
    const output = payload.output;
    const text = output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("");
    if (text)
        return text;
    throw new Error("模型返回中没有可读取的文本");
}
function emitProviderDelta(line, protocol, onDelta) {
    if (!line.startsWith("data:"))
        return false;
    const payload = line.slice(5);
    const raw = payload.startsWith(" ") ? payload.slice(1) : payload;
    const trimmed = raw.trim();
    if (!trimmed)
        return false;
    if (trimmed === "[DONE]")
        return true;
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        throw new Error("模型流式响应格式异常，请重试当前操作");
    }
    let event;
    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error();
        event = parsed;
    }
    catch {
        throw new Error("模型流式响应格式异常，请重试当前操作");
    }
    if (protocol === "chat-completions") {
        const choices = event.choices;
        const choice = choices?.[0];
        const delta = choice?.delta?.content;
        if (delta)
            onDelta(delta);
        if (choice?.finish_reason === "length")
            throw new Error("完整讲解因输出长度限制被截断，请重试当前操作");
        if (choice?.finish_reason && choice.finish_reason !== "stop")
            throw new Error("模型没有完整结束本次讲解，请重试当前操作");
        return choice?.finish_reason === "stop";
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string")
        onDelta(event.delta);
    if (event.type === "response.incomplete")
        throw new Error("完整讲解因输出长度限制被截断，请重试当前操作");
    return event.type === "response.completed";
}
function parseJsonObject(raw) {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const prepared = escapeModelLatexBackslashes(cleaned);
    let parsed;
    try {
        parsed = JSON.parse(prepared);
    }
    catch (error) {
        const repaired = escapeInvalidJsonStringBackslashes(prepared);
        if (repaired === prepared)
            throw error;
        parsed = JSON.parse(repaired);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("模型没有返回 JSON 对象");
    return parsed;
}
const LATEX_COMMANDS = new Set([
    "alpha", "angle", "approx", "bar", "begin", "beta", "binom", "bmod", "bottom", "boxed", "bullet", "cdot", "chi", "circ", "cos",
    "delta", "dfrac", "epsilon", "eta", "frac", "gamma", "geq", "infty", "int", "kappa", "lambda", "left", "leq", "ln", "log", "mu",
    "nabla", "neq", "nleq", "not", "notin", "nu", "omega", "operatorname", "overline", "phi", "pi", "prod", "psi", "qquad",
    "rho", "right", "rightarrow", "sigma", "sqrt", "sum", "tan", "tau", "text", "tfrac", "theta", "therefore", "times", "top",
    "triangle", "underline", "upsilon", "vec", "xi", "zeta",
]);
const LATEX_FIELDS = new Set(["formula", "expression"]);
function escapeModelLatexBackslashes(value) {
    let output = "";
    let inString = false;
    let inMath = false;
    let latexField = false;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === '"' && !isEscaped(value, index)) {
            inString = !inString;
            inMath = false;
            latexField = inString && isLatexValueField(value.slice(0, index));
            output += character;
            continue;
        }
        if (inString && character === "$" && !isEscaped(value, index)) {
            inMath = !inMath;
            if (value[index + 1] === "$") {
                output += "$$";
                index += 1;
                continue;
            }
        }
        if (!inString || character !== "\\") {
            output += character;
            continue;
        }
        const next = value[index + 1] ?? "";
        if (next === "\\" || next === '"' || next === "/") {
            output += character + next;
            index += 1;
            continue;
        }
        if (next === "u" && /^[0-9a-fA-F]{4}$/.test(value.slice(index + 2, index + 6))) {
            output += value.slice(index, index + 6);
            index += 5;
            continue;
        }
        const command = value.slice(index + 1).match(/^[A-Za-z]+/)?.[0] ?? "";
        if (command && LATEX_COMMANDS.has(command) && (inMath || latexField)) {
            output += "\\\\";
            continue;
        }
        output += character;
    }
    return output;
}
function isLatexValueField(prefix) {
    const match = prefix.match(/"([A-Za-z][A-Za-z0-9_]*)"\s*:\s*$/);
    return Boolean(match && LATEX_FIELDS.has(match[1]));
}
function isEscaped(value, index) {
    let count = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1)
        count += 1;
    return count % 2 === 1;
}
function escapeInvalidJsonStringBackslashes(value) {
    let output = "";
    let inString = false;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === '"') {
            inString = !inString;
            output += character;
            continue;
        }
        if (!inString || character !== "\\") {
            output += character;
            continue;
        }
        const next = value[index + 1];
        if ('"\\/bfnrt'.includes(next ?? "")) {
            output += character + next;
            index += 1;
            continue;
        }
        if (next === "u" && /^[0-9a-fA-F]{4}$/.test(value.slice(index + 2, index + 6))) {
            output += value.slice(index, index + 6);
            index += 5;
            continue;
        }
        output += "\\\\";
    }
    return output;
}
function solutionSystemPrompt() {
    return [
        "你是面向学生的 K12 解题老师。学生明确要求查看完整讲解，因此必须给出足够详细、可以从头跟做的完整过程，不能只给结论或压缩成几句关系式。使用中性、非羞辱性语言，不评价学生能力，也不扩展无关知识。",
        "使用清晰 Markdown 组织讲解，并严格依次使用四个三级标题：“### 解题思路”“### 分步推导”“### 结论”“### 易错提醒”。不得改名、合并或省略标题。分步推导使用有序列表完整展开每一步，并解释关键等式、定理或条件如何得到；题目有多个小问时必须逐问作答，并用“第1问”“第2问”等小标题明确分开。不使用表格、HTML 或分隔线。",
        "推导不得跳过决定答案的中间步骤。几何题要交代对应关系和判定依据，物理题要写公式、代入、单位和物理含义，化学题要说明反应关系与配平依据，计算题要保留必要的演算过程。",
        "所有数学与物理公式必须使用 KaTeX 兼容的 LaTeX：行内公式写在 $...$ 中，独立推导写在 $$...$$ 中；不要用代码块包裹公式。化学式使用 $\\mathrm{H_2O}$ 这类标准 LaTeX。",
    ].join("\n");
}
function diagnosticSystemPrompt() {
    return [
        "你是中国 K12 数理化知识诊断与学生自主学习引导器。输出严格 JSON。",
        "课程概念只能从给定 ID 选择，标题、难度和前置关系不得自创。",
        "只选直接前置：若 A 已是 B 的课标前置且 B 足以解释原题，不要再把 A 与 B 并列为原题的直接前置。",
        "不要因为题里出现数字就机械选择加减乘除或变量；必须说明学生完成当前题的哪一步离不开该概念。",
        "evidence 必须逐字摘自题干、学生作答或给定父节点，且 simplification 必须原样引用 evidence 并解释为何先学这个概念。",
        "每个节点的讲解、例子、思考问题、误区和理解检查都要针对当前题重新生成；禁止通用模板和复用原题。",
        "微型检查必须比父题简单，只检查一个概念；选择题 answer 必须与某个 choices 选项逐字一致。",
        "simplification、teaching 各字段、check.prompt、check.choices 与 check.explanation 中出现数学或物理公式时，使用 KaTeX 兼容的 LaTeX：行内写成 $...$，独立公式写成 $$...$$；check.answer 保持便于学生直接输入的纯答案。不得输出 HTML。",
        "手机页面需要简洁：explanation 不超过140字，example不超过110字，parentPrompt不超过70字，expectedSignal不超过90字，misconception不超过100字，alternateExplanation不超过140字，check.prompt不超过120字。",
    ].join("\n");
}
function selectionSystemPrompt(min, max) {
    return [
        "你是中国 K12 数理化知识诊断器。输出严格 JSON，回答保持简短。",
        `只能从给定课程目录 ID 选择 ${min} 到 ${max} 个完成当前任务真正需要的直接前置；只需一个时绝不凑数。`,
        "不能把具有课程前置关系的上下游概念并列，应该只保留最贴近当前任务的下游概念。",
        "不要因为题里出现数字就机械选择加减乘除或变量；必须对应题目的关键关系或学生作答暴露的具体错误。",
        "evidence 必须逐字复制 evidenceQuotes 中某一项的 text，禁止自行摘写、概括、增删字或替换单位/数字；simplification 必须以“题目中的「对应 evidence 原文」……”开头，完整粘贴同一项 evidence，再说明这一步缺少什么能力。例如 evidence 为“AC = BC”，simplification 必须包含完整的“AC = BC”。",
        "若多个概念表达同一层关系，只保留更贴近当前卡点的一个；不要输出教学正文或检查题。",
        "如果输出结构要求 problemGuide：goal 说清题目要做什么；keyClue 用自然语言引用题干条件并说明作用；approach 只给方向不泄露答案；firstQuestion 只问一个帮助学生说出第一步的问题。四个字段直接对学生说话，禁止出现“逐字引用、字段、输出结构、生成要求、题干关键条件、真实条件、真实原文”等模型工作术语。",
    ].join("\n");
}
function selectionOutputExample(includeOriginal) {
    return {
        selections: [{ conceptId: "给定课程概念 ID", evidence: "从原文复制且不超过50字的连续短语", simplification: "“……”说明这里需要先会……；学会后，原题的这一步会更容易理解" }],
        ...(includeOriginal ? {
            originalAnswer: "原题标准答案",
            originalExplanation: "简洁可核验的解题依据",
            problemGuide: {
                goal: "不用计算结果，先用一句话说清这道题最终要找什么",
                keyClue: "直接写出题干里的真实条件，并用用户能懂的话说明它为什么重要",
                approach: "只说明要建立的核心关系和解题方向，不给最终答案或完整步骤",
                firstQuestion: "问学生的一个问题，帮助他自己说出第一步",
            },
        } : {}),
    };
}
function teachingOutputExample() {
    return {
        conceptId: "必须与 selected.conceptId 完全一致",
        evidenceSource: "必须与 selected.evidenceSource 完全一致：problem、child_work 或 parent",
        teaching: {
            explanation: "AI 可直接讲给学生听的解释；必须原样引用 selected.evidence 并明确点出所选课程概念名称",
            example: "数字更小或情境更具体但关系相同的新例子",
            parentPrompt: "AI 向学生提出的思考问题",
            expectedSignal: "真正理解时学生会说出或做出的表现",
            misconception: "当前题最可能出现的具体误区",
            alternateExplanation: "第一次仍不懂时可使用的另一种具体讲法",
        },
        check: {
            prompt: "不同于原题、只检查该概念的一道微型题",
            type: "choice 或 short_text",
            choices: ["选择题时提供 2 到 5 个互不重复选项"],
            answer: "可核验标准答案；选择题须逐字等于某个选项",
            explanation: "必须明确写出所选课程概念标题或别名，并说明为什么答案能证明掌握该概念",
        },
    };
}
function compactCheckText(value) {
    return value.normalize("NFC").toLowerCase().replace(/[\s，。；、:：？！?]/g, "");
}
