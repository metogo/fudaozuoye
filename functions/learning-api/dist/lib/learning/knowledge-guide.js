"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeGuide = knowledgeGuide;
/** Quote an existing teaching emphasis, never invent a hook or mine later answers. */
function knowledgeGuide(messages) {
    const lesson = messages.find(message => message.role === "assistant" && message.kind === "assistant" && message.surface !== "board");
    if (!lesson || lesson.status !== "complete" || lesson.scopeLabel === "原题完整讲解")
        return null;
    const quotes = (lesson.emphasis ?? []).filter(mark => {
        if (!mark || typeof mark.target !== "string")
            return false;
        const text = mark.target.trim();
        return mark.kind === "text" && text.length >= 12 && text.length <= 56
            && !/[\n\r$\\*_`<>]/.test(text) && lesson.text.includes(text);
    });
    // Source order is stable even if the emphasis service ranks marks differently.
    quotes.sort((a, b) => lesson.text.indexOf(a.target.trim()) - lesson.text.indexOf(b.target.trim()));
    return quotes[0]?.target.trim() ?? null;
}
