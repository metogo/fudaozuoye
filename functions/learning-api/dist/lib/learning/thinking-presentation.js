"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.thinkingPresentation = thinkingPresentation;
/** Presentation only: stages come from request events, never elapsed time. */
function thinkingPresentation(label) {
    if (["正在识别题干与你的作答", "正在读懂你发来的题目", "正在识别题目", "正在读题"].includes(label)) {
        return { title: "正在读懂这道题", description: "识别题目条件，整理问题要求。" };
    }
    if (["正在理解题目要解决什么", "正在找到最适合的讲解起点", "正在准备讲解"].includes(label)) {
        return { title: "正在梳理解题思路", description: "从题目条件出发，找到讲解的切入点。" };
    }
    return { title: label || "正在整理你的问题", description: "结合当前题目，整理清楚再讲给你。" };
}
