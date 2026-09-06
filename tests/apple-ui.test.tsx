import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Markup tests exercise the real renderer; async loading is covered separately.
vi.mock("@/components/lazy-rich-learning-text", async () => ({
  ...await import("@/components/rich-learning-text"),
  preloadLearningText: () => import("@/components/rich-learning-text"),
}));
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { LearningChat, shouldShowChatJump } from "@/components/learning-chat";
import { RichLearningText } from "@/components/rich-learning-text";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { understandingGate } from "@/lib/learning/flow";

const noop = () => {};
function fixture(): ComponentProps<typeof LearningChat> {
  const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
  session.problem.text = "新菜园的周长是多少米？";
  session.flow.activeGate = understandingGate();
  return {
    session, messages: [
      { id: "question", role: "user", kind: "user", text: session.problem.text, createdAt: "2026-09-06T00:00:00Z" },
      { id: "lesson", role: "assistant", kind: "assistant", scopeLabel: "关键线索", status: "complete", createdAt: "2026-09-06T00:00:01Z", text: "## 关键线索\n\n要算新菜园的周长，第一步得先找出新长方形的长是多少。\n\n$$\n18 + 4 = 22\\text{（米）}\n$$\n\n宽不变，还是 12 米。接下来，把四条边的长度加起来。" },
    ],
    reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false, loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
    onReasoningLevel: noop, onFile: noop, onResponsePhoto: noop, onWhiteboard: noop, onSend: noop, onQuestion: noop,
    onChoice: noop, onSuggestion: noop, onConfirmProblem: noop, onRetryOriginal: noop, onRequestTransfer: noop, onNewProblem: noop, onRetry: noop,
  };
}

describe("悬浮设计系统保持学习流程", () => {
  it("首页输入用键盘图标，与白板笔图区分，推理档位保留选中和不可用状态", () => {
    const props = fixture(); props.session = null; props.messages = [];
    props.reasoningLevels = [
      { id: "light", label: "轻度", available: true },
      { id: "medium", label: "中", available: true },
      { id: "high", label: "高", available: false },
    ];
    const html = renderToStaticMarkup(<LearningChat {...props}/>);
    const source = readFileSync("components/learning-chat.tsx", "utf8");
    expect(source).toContain('<KeyboardIcon className="home-input-icon');
    expect(source).not.toContain('<PencilIcon className="home-input-icon');
    expect(html).toContain('aria-label="白板写题"');
    expect(html).toContain('aria-pressed="true" title="轻度推理"');
    expect(html).toContain('disabled="" aria-pressed="false" title="高推理尚未配置"');
    expect(html).toContain("专注作业");
  });
  it("输入框焦点交给外层胶囊，其他按钮的键盘焦点不被取消", () => {
    const css = readFileSync("app/ui-theme.css", "utf8");
    expect(css).toContain('.composer-surface textarea:focus-visible { outline: none; }');
    expect(css).toMatch(/\.composer-surface:has\(textarea:focus-visible\) \{[^}]*outline: 2px solid/);
    expect(css).toContain(':where(button, input, textarea, select):focus-visible');
    expect(css).toMatch(/\.home-reasoning-picker button \{[^}]*min-width: 44px; min-height: 44px/);
  });
  it("首页即使残留任意提示标记，也不显示上一题的讲解或猜你想问提示", () => {
    for (const news of [false, true]) for (const suggestions of [false, true]) {
      expect(shouldShowChatJump(true, false, news, suggestions)).toBe(false);
      expect(shouldShowChatJump(false, true, news, suggestions)).toBe(false);
      expect(shouldShowChatJump(false, false, news, suggestions)).toBe(news || suggestions);
    }
    const props = fixture(); props.session = null; props.messages = [];
    const html = renderToStaticMarkup(<LearningChat {...props}/>);
    expect(html).toContain("home-chat-shell");
    expect(html).not.toContain('class="chat-new-message');
  });
  it("开始新题重新创建对话界面，不沿用上一题的草稿、引用和滚动状态", () => {
    const app = readFileSync("components/education-chat-app.tsx", "utf8");
    expect(app).toMatch(/const reset = \(\) => \{\s*setChatUiEpoch\(\(epoch\) => epoch \+ 1\)/);
    expect(app).toMatch(/<LearningChat\s+key=\{chatUiEpoch\}/);
  });
  it("只对完整的纯算术展示使用界面数字字体，不影响复杂数学排版", () => {
    const render = (text: string, streaming = false) => renderToStaticMarkup(<RichLearningText text={text} streaming={streaming}/>);
    expect(render("$$\n18+4=22\\text{（米）}\n$$")).toContain('data-arithmetic-displays="true"');
    for (const text of ["$$x^2-6x+k=0$$", "$$\\frac{1}{2}=0.5$$", "$$\\sqrt{24}=2\\sqrt{6}$$", "$$18+4=22$$\n\n$$x^2=9$$", "$18+4=22$"]) expect(render(text)).not.toContain("data-arithmetic-displays");
    expect(render("$$18+4=22$$", true)).not.toContain("data-arithmetic-displays");
  });
  it("主次操作使用同一容器，全部现有入口仍保留", () => {
    const html = renderToStaticMarkup(<LearningChat {...fixture()}/>);
    expect(html).toContain("chat-gate__body");
    expect(html).toContain("composer-surface");
    for (const text of ["懂了，继续", "这一步我来做", "这一步没懂", "看完整讲解", 'aria-label="导出 PDF"']) expect(html).toContain(text);
    for (const hidden of ["用板书讲清楚", "插画演示"]) expect(html).not.toContain(hidden);
    if (process.env.UI_DESIGN_PREVIEW === "1") {
      // Visual fixture only; never shipped as an app route or used as a real conversation.
      const index = readFileSync("out/index.html", "utf8");
      const styles = [...index.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((match) => match[0]).join("");
      mkdirSync("outputs/apple-ui", { recursive: true });
      writeFileSync("outputs/apple-ui/reference-state.html", `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Design QA fixture</title></head><body class="apple-ui">${html}</body></html>`);
    }
  });
  it("答案展示后仍保留继续与提示，不恢复旧检查按钮", () => {
    const props = fixture();
    props.session!.flow.activeGate = { id: "blank", kind: "step_answer", title: "只完成这一个关键空", prompt: "补全判别式条件。", stepBlank: { before: "判别式满足", after: "。", hint: "回忆实根条件" }, stepAnswer: { answer: "$\\Delta\\geq0$", explanation: "有实数根" } };
    const html = renderToStaticMarkup(<LearningChat {...props}/>);
    for (const text of ["看懂了，继续", "给我一点提示", 'data-answer-revealed="true"', 'aria-label="修改这个空的答案"']) expect(html).toContain(text);
    expect(html).not.toContain("检查这一步");
  });
  it("等待与错误提示仍有语义状态及恢复入口", () => {
    const props = fixture();
    props.busy = true;
    props.notice = "网络暂时不可用";
    props.retryLabel = "重试这一步";
    const html = renderToStaticMarkup(<LearningChat {...props}/>);
    expect(html).toContain('role="alert"');
    expect(html).toContain("重试这一步");
    expect(html).toContain("下一步正在准备");
    expect(html).toContain('class="next-turn-placeholder__eyebrow"');
    expect(html).toContain('<span class="next-turn-placeholder__status">即将出现</span>');
    for (const path of ["app/globals.css", "app/ui-theme.css"]) {
      const css = readFileSync(path, "utf8");
      expect(css).not.toContain('.chat-gate > div:first-child > span {');
      expect(css).toContain('.chat-gate > div:first-child > .chat-gate__avatar {');
    }
    if (process.env.NEXT_TURN_PREVIEW === "1") {
      mkdirSync("outputs/next-turn", { recursive: true });
      writeFileSync("outputs/next-turn/fixture.html", html);
    }
  });
  it("允许页面缩放，并将外观与打印样式隔离", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    const css = readFileSync("app/ui-theme.css", "utf8");
    expect(layout).not.toContain("maximumScale: 1");
    expect(css).toContain("@media screen");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-reduced-transparency: reduce");
    expect(css).not.toContain("touch-action: none");
    expect(css).not.toContain("overflow: hidden !important");
  });
});
