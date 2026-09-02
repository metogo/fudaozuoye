"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReportFile = createReportFile;
const subjects = { math: "数学", physics: "物理", chemistry: "化学", biology: "生物", chinese: "语文", english: "英语", history: "历史", geography: "地理", politics: "政治" };
const bands = { primary: "小学", junior: "初中", senior: "高中" };
const states = { unchecked: "待确认", known: "已掌握", unknown: "未掌握", learning: "学习中", mastered: "验收通过", parent_confirmed: "人工确认", needs_help: "需真人介入" };
async function createReportFile(session) {
    const concepts = session.nodes.filter((node) => node.kind === "concept").sort((a, b) => a.difficulty - b.difficulty);
    const height = 700 + concepts.length * 130;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
        throw new Error("当前浏览器无法生成学习报告");
    context.fillStyle = "#f4f3ef";
    context.fillRect(0, 0, canvas.width, height);
    context.fillStyle = "#171717";
    context.fillRect(0, 0, canvas.width, 330);
    context.fillStyle = "#a8a29e";
    context.font = "500 28px system-ui, sans-serif";
    context.fillText("KNOWLEDGE BACKTRACKING REPORT", 74, 82);
    context.fillStyle = "#ffffff";
    context.font = "700 66px system-ui, sans-serif";
    context.fillText("从不会，到真正会。", 70, 174);
    context.fillStyle = "#d6d3d1";
    context.font = "400 30px system-ui, sans-serif";
    context.fillText(`${bands[session.problem.gradeBand]} · ${subjects[session.problem.subject]}  /  ${concepts.length} 个知识节点`, 74, 240);
    context.fillStyle = "#292524";
    context.font = "700 34px system-ui, sans-serif";
    context.fillText("本次学习路径", 72, 410);
    let y = 470;
    concepts.forEach((node, index) => {
        context.fillStyle = "#ffffff";
        roundRect(context, 70, y, 940, 96, 22);
        context.fillStyle = node.state === "mastered" ? "#15803d" : node.state === "parent_confirmed" ? "#a16207" : node.state === "needs_help" ? "#b91c1c" : "#57534e";
        context.beginPath();
        context.arc(116, y + 48, 16, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#1c1917";
        context.font = "650 29px system-ui, sans-serif";
        context.fillText(`${index + 1}. ${node.title}`, 154, y + 41);
        context.fillStyle = "#78716c";
        context.font = "500 22px system-ui, sans-serif";
        context.fillText(states[node.state], 154, y + 73);
        y += 126;
    });
    context.fillStyle = "#292524";
    context.font = "700 30px system-ui, sans-serif";
    context.fillText(session.originalPassed && session.transferPassed ? "✓ 原题与迁移题均已通过" : "本次学习尚未完成客观验收", 74, y + 35);
    context.fillStyle = "#78716c";
    context.font = "400 22px system-ui, sans-serif";
    wrapText(context, "报告已自动脱敏：不包含原始照片、身份、完整题目或模型对话。人工确认与系统验收不会混为一谈。", 74, y + 82, 910, 34);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("报告图片生成失败")), "image/png"));
    return new File([blob], `回溯学-学习报告-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" });
}
function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
}
function wrapText(context, text, x, y, maxWidth, lineHeight) {
    let line = "";
    for (const char of text) {
        const candidate = line + char;
        if (context.measureText(candidate).width > maxWidth) {
            context.fillText(line, x, y);
            line = char;
            y += lineHeight;
        }
        else
            line = candidate;
    }
    if (line)
        context.fillText(line, x, y);
}
