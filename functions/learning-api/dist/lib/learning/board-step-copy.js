"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boardStepDisplayCopy = boardStepDisplayCopy;
const mathFiveStepCopy = [
    { eyebrow: "看懂题目", title: "已知什么，要解决什么" },
    { eyebrow: "找出联系", title: "条件之间怎么连起来" },
    { eyebrow: "关键推导", title: "从哪里开始，为什么这样做" },
    { eyebrow: "易错检查", title: "哪些地方最容易出错" },
    { eyebrow: "举一反三", title: "同类题怎么解决" },
];
function boardStepDisplayCopy(input) {
    if (isCanonicalMathFiveStepRoute(input.subject, input.roles)) {
        return mathFiveStepCopy[input.index] ?? fallbackCopy(input.role, input.title, input.index);
    }
    return fallbackCopy(input.role, input.title, input.index);
}
function isCanonicalMathFiveStepRoute(subject, roles) {
    return subject === "math"
        && roles.length === mathFiveStepCopy.length
        && roles[0] === "orient"
        && roles[1] === "model"
        && roles[2] === "reason"
        && roles[3] === "misconception"
        && (roles[4] === "transfer" || roles[4] === "recap");
}
function fallbackCopy(role, title, index) {
    if (role === "orient")
        return { eyebrow: "看懂题目", title };
    if (role === "model")
        return { eyebrow: "找出联系", title };
    if (role === "reason")
        return { eyebrow: "关键推导", title };
    if (role === "misconception")
        return { eyebrow: "易错检查", title };
    if (role === "transfer")
        return { eyebrow: "举一反三", title };
    if (role === "recap")
        return { eyebrow: "回顾方法", title };
    return { eyebrow: ["理解题意", "整理关系", "开始推导", "核对结果", "归纳方法"][index] ?? `第${index + 1}步`, title };
}
