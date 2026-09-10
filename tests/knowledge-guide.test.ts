import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/learning/types";
import { knowledgeGuide } from "@/lib/learning/knowledge-guide";

const quote = "周长就是沿着长方形的边绕一整圈的总长度";
const later = "长方形的一圈由两条相同的长和两条相同的宽组成";
const mark = (target: string) => ({ kind: "text" as const, target, reason: "这句话解释本题需要理解的基础知识。" });
const lesson = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({ id: "first", role: "assistant", kind: "assistant", status: "complete", text: `${quote}。${later}。`, emphasis: [mark(later), mark(quote)], createdAt: "2026-09-10", ...overrides });

describe("知识导读只引用已有首段讲解", () => {
  it("按原文顺序摘取，原文和 emphasis 数组都不被修改", () => {
    const source = lesson();
    expect(knowledgeGuide([source])).toBe(quote);
    expect(source.emphasis?.[0].target).toBe(later);
  });
  it.each(["streaming", "finishing", "error"] as const)("%s 内容不进入导读", status => {
    expect(knowledgeGuide([lesson({ status }), lesson({ id: "later" })])).toBeNull();
  });
  it("不摘录后续完整答案，也不把用户、板书、里程碑当作首段讲解", () => {
    expect(knowledgeGuide([lesson({ scopeLabel: "原题完整讲解" })])).toBeNull();
    expect(knowledgeGuide([lesson({ role: "user" }), lesson({ surface: "board" }), lesson({ kind: "milestone" }), lesson()])).toBe(quote);
    expect(knowledgeGuide([lesson({ emphasis: [] }), lesson({ id: "solution" })])).toBeNull();
  });
  it("不存在于原文、过长、过短或带公式的标注不拼接为导读", () => {
    for (const target of ["这是原文中并不存在的另一句说明", "长".repeat(57), "四条边", "$x$ 是需要先计算的一个变量"]) {
      expect(knowledgeGuide([lesson({ emphasis: [mark(target)] })])).toBeNull();
    }
    expect(knowledgeGuide([lesson({ emphasis: [{ ...mark(quote), kind: "math" }] })])).toBeNull();
  });
  it("没有首段讲解时不编造，空标注安全忽略", () => {
    expect(knowledgeGuide([])).toBeNull();
    expect(knowledgeGuide([lesson({ emphasis: [null as never] })])).toBeNull();
  });
});
