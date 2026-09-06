import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { messageTime } from "@/lib/learning/message-time";
import { MessageTime } from "@/components/message-time";
import { LearningChat } from "@/components/learning-chat";
import type { ChatMessage } from "@/lib/learning/types";

vi.mock("@/components/lazy-rich-learning-text", async () => ({
  ...await import("@/components/rich-learning-text"),
  preloadLearningText: () => import("@/components/rich-learning-text"),
}));

describe("对话消息时间", () => {
  it.each([[0, 0, 0, "00:00:00"], [9, 5, 3, "09:05:03"], [23, 59, 59, "23:59:59"]])("使用本地24小时制并补齐时分秒：%s:%s:%s", (h, m, s, expected) => {
    const date = new Date(2026, 8, 6, Number(h), Number(m), Number(s));
    expect(messageTime(date.toISOString())?.clock).toBe(expected);
    expect(messageTime(date.toISOString())?.label).toContain("2026-09-06");
  });
  it("同一绝对时刻不同偏移写法显示一致，保留完整日期用于跨日查看", () => {
    expect(messageTime("2026-09-06T08:05:03+08:00")).toEqual(messageTime("2026-09-06T00:05:03Z"));
    const html = renderToStaticMarkup(<MessageTime createdAt="2026-09-06T00:05:03Z"/>);
    expect(html).toMatch(/datetime="2026-09-06T00:05:03.000Z"/i);
    expect(html).toContain("本地时间");
  });
  it.each([undefined, "", "not-a-date"])("缺失/损坏的旧时间不伪造为当前时间：%s", (value) => {
    expect(messageTime(value)).toBeNull();
    expect(renderToStaticMarkup(<MessageTime createdAt={value as string}/>)).toContain("时间未记录");
  });
  it("每一种消息均有时间，包括流式、错误、引用、图片和系统状态", () => {
    const base = { createdAt: "2026-09-06T00:05:03Z" };
    const messages: ChatMessage[] = [
      { ...base, id: "u", role: "user", kind: "user", text: "问题", imageUrl: "blob:local", reference: { scopeLabel: "引用", sourceSummary: "条件" } },
      { ...base, id: "a", role: "assistant", kind: "assistant", text: "讲解", status: "streaming" },
      { ...base, id: "e", role: "assistant", kind: "assistant", scopeLabel: "原题完整讲解", text: "失败", status: "error" },
      { ...base, id: "m", role: "system", kind: "milestone", text: "进度" },
      { ...base, id: "p", role: "system", kind: "path", text: "学习路径" },
      { ...base, id: "r", role: "system", kind: "result", text: "结果" },
    ];
    const noop = () => {};
    const html = renderToStaticMarkup(<LearningChat messages={messages} session={null} reasoningLevels={[]} reasoningLevel="light" ready busy={false} loadingLabel="" notice="" retryLabel="" reviewProblem={null} onReasoningLevel={noop} onFile={noop} onResponsePhoto={noop} onWhiteboard={noop} onSend={noop} onQuestion={noop} onChoice={noop} onSuggestion={noop} onConfirmProblem={noop} onRetryOriginal={noop} onRequestTransfer={noop} onNewProblem={noop} onRetry={noop}/>);
    expect(html.match(/<time class="chat-message-time"/g)).toHaveLength(messages.length);
    expect(html).toContain("chat-message-entry--user");
    expect(html).toContain("chat-message-entry--assistant");
    expect(html).toContain("chat-message-entry--system");
  });
});
