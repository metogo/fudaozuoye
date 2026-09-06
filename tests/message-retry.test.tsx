import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LearningChat } from "@/components/learning-chat";
import type { ChatMessage } from "@/lib/learning/types";

vi.mock("@/components/lazy-rich-learning-text", async () => ({
  ...await import("@/components/rich-learning-text"),
  preloadLearningText: () => import("@/components/rich-learning-text"),
}));

const message = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, role: "assistant", kind: "assistant", text: `讲解${id}`, status: "error", createdAt: "2026-09-06T00:05:03Z", ...extra,
});
function render(messages: ChatMessage[], retryMessageId: string | null, busy = false, retryLabel = "重试这一步") {
  const noop = () => {};
  return renderToStaticMarkup(<LearningChat messages={messages} retryMessageId={retryMessageId} session={null} reasoningLevels={[]} reasoningLevel="light" ready busy={busy} loadingLabel="" notice="" retryLabel={retryLabel} reviewProblem={null} onReasoningLevel={noop} onFile={noop} onResponsePhoto={noop} onWhiteboard={noop} onSend={noop} onQuestion={noop} onChoice={noop} onSuggestion={noop} onConfirmProblem={noop} onRetryOriginal={noop} onRequestTransfer={noop} onNewProblem={noop} onRetry={noop}/>);
}
describe("消息原位重试入口", () => {
  it("没有顶部通知也在失败消息旁显示刷新图标和重试", () => {
    const html = render([message("failed")], "failed");
    expect(html).toContain('aria-label="重试这条消息"');
    expect(html).toMatch(/chat-message-retry[^]*?<svg/);
    expect(html).toContain("本条处理未完成");
  });
  it("历史失败消息不能调用另一条消息的重试", () => {
    const html = render([message("old"), message("current")], "current");
    expect(html.match(/aria-label="重试这条消息"/g)).toHaveLength(1);
    expect(html.indexOf('class="chat-message-retry"')).toBeGreaterThan(html.indexOf("讲解current"));
  });
  it("原题完整讲解的特殊错误卡同样能重试，保留隐藏不完整答案", () => {
    const html = render([message("solution", { scopeLabel: "原题完整讲解" })], "solution");
    expect(html).toContain("完整讲解未完成");
    expect(html).not.toContain("讲解solution");
    expect(html).toContain('aria-label="重试这条消息"');
  });
  it("正文完成但学习状态返回失败，也保留这一步的重试入口", () => {
    expect(render([message("state", { status: "complete" })], "state")).toContain('aria-label="重试这条消息"');
  });
  it("进行中按钮不可点击", () => {
    expect(render([message("failed")], "failed", true)).toContain('class="chat-message-retry" disabled=""');
  });
  it.each([null, "missing"])("没有对应重试上下文时不出现无效按钮：%s", (retryId) => {
    expect(render([message("old")], retryId)).not.toContain('aria-label="重试这条消息"');
  });
  it("清除重试/开启新任务后即使旧id残留也不暴露入口", () => {
    expect(render([message("old")], "old", false, "")).not.toContain('aria-label="重试这条消息"');
  });
});
