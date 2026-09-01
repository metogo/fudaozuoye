"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boardContextFromChat = boardContextFromChat;
exports.parseBoardContext = parseBoardContext;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 1_200;
const MAX_TOTAL_LENGTH = 8_000;
const operationLabels = new Set(["懂了，继续", "我来试试", "这一步没懂", "用板书讲清楚", "看完整讲解", "我看完了，收起讲解", "遮住讲解，重做原题", "再练一道同知识点题", "换一道同知识点题"]);
function boardContextFromChat(messages) {
    const candidates = messages.filter((message) => message.surface !== "board"
        && message.role !== "system"
        && message.status !== "streaming"
        && message.status !== "error"
        && message.kind !== "path"
        && message.scopeLabel !== "原题完整讲解"
        && !operationLabels.has(message.text.trim())
        && message.text.trim().length > 0);
    return limitBoardContext(candidates.slice(-MAX_MESSAGES).map((message) => ({
        id: message.id,
        role: message.role === "user" ? "user" : "assistant",
        text: message.text,
        ...(message.scopeLabel ? { scopeLabel: message.scopeLabel } : {}),
    })));
}
function parseBoardContext(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.length > MAX_MESSAGES)
        throw new Error("板书对话上下文不合法");
    const messages = value.map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            throw new Error("板书对话上下文不合法");
        const item = raw;
        const role = item.role;
        if (role !== "user" && role !== "assistant")
            throw new Error("板书对话角色不合法");
        const id = clean(item.id, 100);
        const text = clean(item.text, MAX_MESSAGE_LENGTH);
        const scopeLabel = item.scopeLabel === undefined ? undefined : clean(item.scopeLabel, 80);
        return { id, role, text, ...(scopeLabel ? { scopeLabel } : {}) };
    });
    return limitBoardContext(messages);
}
function limitBoardContext(messages) {
    let remaining = MAX_TOTAL_LENGTH;
    const selected = [];
    for (let index = messages.length - 1; index >= 0 && selected.length < MAX_MESSAGES && remaining > 0; index -= 1) {
        const message = messages[index];
        const text = message.text.trim().slice(0, Math.min(MAX_MESSAGE_LENGTH, remaining));
        if (!text)
            continue;
        selected.unshift({ ...message, text });
        remaining -= text.length;
    }
    return selected;
}
function clean(value, maxLength) {
    if (typeof value !== "string")
        throw new Error("板书对话上下文不合法");
    const text = value.trim();
    if (!text || text.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text))
        throw new Error("板书对话上下文不合法");
    return text;
}
