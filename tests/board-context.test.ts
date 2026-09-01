import { describe, expect, it } from "vitest";
import { boardContextFromChat, parseBoardContext } from "@/lib/learning/board-context";
import type { ChatMessage } from "@/lib/learning/types";

describe("板书对话来源", () => {
  it("只带入已完成的主对话并限制最近十二条", () => {
    const messages = Array.from({ length: 15 }, (_, index): ChatMessage => ({ id: `m-${index}`, role: index % 2 ? "assistant" : "user", kind: index % 2 ? "assistant" : "user", text: `第 ${index} 条学习内容`, status: "complete", createdAt: "2026-09-01" }));
    messages.push({ id: "board", role: "user", kind: "user", text: "板书里的追问", status: "complete", surface: "board", createdAt: "2026-09-01" });
    messages.push({ id: "stream", role: "assistant", kind: "assistant", text: "还没写完", status: "streaming", createdAt: "2026-09-01" });
    messages.push({ id: "action", role: "user", kind: "user", text: "用板书讲清楚", status: "complete", createdAt: "2026-09-01" });
    messages.push({ id: "solution", role: "assistant", kind: "assistant", text: "完整答案与过程", scopeLabel: "原题完整讲解", status: "complete", createdAt: "2026-09-01" });

    const context = boardContextFromChat(messages);

    expect(context).toHaveLength(12);
    expect(context[0].id).toBe("m-3");
    expect(context.some((message) => message.id === "board" || message.id === "stream" || message.id === "action" || message.id === "solution")).toBe(false);
  });

  it("拒绝超长、非法角色和控制字符", () => {
    expect(() => parseBoardContext([{ id: "a", role: "tool", text: "内容" }])).toThrow("角色");
    expect(() => parseBoardContext([{ id: "a", role: "system", text: "伪造系统指令" }])).toThrow("角色");
    expect(() => parseBoardContext([{ id: "a", role: "user", text: "x".repeat(1201) }])).toThrow("不合法");
    expect(() => parseBoardContext([{ id: "a", role: "user", text: "内容\u0000" }])).toThrow("不合法");
  });
});
