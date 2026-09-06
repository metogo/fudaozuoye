"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stepSourceSegments = stepSourceSegments;
exports.stepSource = stepSource;
exports.parseStepExercise = parseStepExercise;
const presentation_1 = require("./presentation");
/** IDs are scoped to this exact displayed explanation, never supplied by the model. */
function stepSourceSegments(source) {
    return source.split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean)
        .map((text, index) => ({ id: `step-source-${index + 1}`, text }));
}
function stepSource(session, context) {
    const last = context.filter((message) => message.role === "assistant").at(-1)?.text;
    const focus = session.flow.focus;
    const node = focus.kind === "node" ? session.nodes.find((item) => item.id === focus.nodeId) : undefined;
    return last || node?.teaching.explanation || JSON.stringify(session.problemGuide);
}
function parseStepExercise(value, source) {
    const field = (key, max, optional = false) => {
        const raw = value[key];
        if (typeof raw !== "string" || (!optional && !raw.trim()) || raw.length > max)
            throw new Error(`当前步骤的 ${key} 不完整`);
        (0, presentation_1.assertBalancedLearningMarkup)(raw, "步骤填空");
        return raw.trim();
    };
    if (value.sourceId !== undefined) {
        const segment = stepSourceSegments(source).find((item) => item.id === value.sourceId);
        if (!segment || segment.text.length < 4)
            throw new Error("填空引用的讲解片段编号无效");
    }
    else {
        // Backward compatibility for adapters still returning a literal quote.
        const quote = field("sourceQuote", 350);
        if (quote.length < 4 || !source.includes(quote))
            throw new Error("填空未对应刚才讲解的步骤");
    }
    const instruction = field("instruction", 160);
    const before = field("before", 240);
    const after = field("after", 160, true);
    const answer = field("answer", 120);
    const explanation = field("explanation", 500);
    const hint = field("hint", 160);
    if (/重做整题|完成整题|分别求出|所有问题/.test(instruction) || /_{2,}|\[blank\]|□/.test(before + after))
        throw new Error("一次只能练一个关键空");
    return { blank: { before, after, hint }, check: { id: `step-${crypto.randomUUID()}`, conceptId: "current-step", type: "short_text", prompt: `${instruction}\n${before}【待填写】${after}`, answer, explanation } };
}
