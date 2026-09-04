"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergePreparedAnswer = mergePreparedAnswer;
const provider_validation_1 = require("./providers/provider-validation");
function mergePreparedAnswer(session, prepared) {
    const currentRoot = session.nodes.find((node) => node.id === session.rootNodeId);
    const preparedRoot = prepared.nodes.find((node) => node.id === prepared.rootNodeId);
    if (!currentRoot)
        throw new Error("学习会话缺少原题节点");
    if (!preparedRoot || !preparedRoot.check.answer.trim() || preparedRoot.check.answer === provider_validation_1.PENDING_ORIGINAL_ANSWER)
        throw new Error("原题标准答案尚未准备完成，请重试当前操作");
    const stableRoot = {
        ...currentRoot,
        diagnosticEvidence: preparedRoot.diagnosticEvidence,
        check: {
            ...currentRoot.check,
            prompt: preparedRoot.check.prompt,
            answer: preparedRoot.check.answer,
            explanation: preparedRoot.check.explanation,
        },
    };
    const nodes = session.nodes.map((node) => node.id === session.rootNodeId ? stableRoot : node);
    return { ...session, problem: prepared.problem, nodes, updatedAt: new Date().toISOString() };
}
