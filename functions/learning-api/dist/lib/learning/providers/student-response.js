"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeStudentResponse = transcribeStudentResponse;
const errors_1 = require("../errors");
const model_support_1 = require("./model-support");
async function transcribeStudentResponse(taskPrompt, request) {
    const system = "你是学生手写作答识别器。只逐字读取图片里学生写下的答案、算式或化学表达，不求解、不纠错、不补全缺失步骤。公式使用简洁可读的 LaTeX 或普通文本。只输出严格 JSON。";
    const prompt = JSON.stringify({ task: "读取学生针对当前任务写下的内容", currentTask: taskPrompt, output: { text: "学生原文", confidence: 0.95 } });
    const parse = (raw) => {
        const value = (0, model_support_1.parseJsonObject)(raw);
        const text = typeof value.text === "string" ? value.text.normalize("NFC").trim() : "";
        const confidence = typeof value.confidence === "number" ? value.confidence : -1;
        if (!text || text.length > 2_000 || confidence < 0 || confidence > 1)
            throw new Error("没有可靠读到学生作答");
        return { text, confidence };
    };
    const first = await request(system, prompt);
    try {
        return parse(first);
    }
    catch {
        try {
            return parse(await request(`${system}\n上一次输出结构不合格，这是唯一一次修复机会。`, `${prompt}\n只返回 text 和 confidence 两个字段。`));
        }
        catch {
            throw (0, errors_1.providerError)("暂时没能稳定读出这份作答，请保留图片并重试，或改用键盘输入", 502);
        }
    }
}
