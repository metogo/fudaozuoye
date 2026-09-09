import { createElement } from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Markup tests exercise the real renderer; async loading is covered separately.
vi.mock("@/components/lazy-rich-learning-text", async () => ({
  ...await import("@/components/rich-learning-text"),
  preloadLearningText: () => import("@/components/rich-learning-text"),
}));
import { LearningChat, chatJumpLabel, isSuggestionBelowViewport } from "@/components/learning-chat";
import { LearningBoard } from "@/components/learning-board";
import { RichLearningText } from "@/components/rich-learning-text";
import { STREAMING_FINISH_MS, STREAMING_SILENCE_MS, StreamingIndicator } from "@/components/streaming-indicator";
import { understandingChoiceFromText } from "@/components/education-chat-app";
import { answerGate, understandingGate } from "@/lib/learning/flow";
import { createNativeBoardBlocks, createNativeBoardFallbackPlan } from "@/lib/learning/board-native-fallback";
import { compileBoardExperience } from "@/lib/learning/board-experience";
import { compileBoardDocument, createBoardWorkspaceState } from "@/lib/learning/board-workspace";
import { analyzeMock, recognizeMock } from "@/lib/learning/mock-engine";
import { finalizeLearningMarkdown, learningTextToPlainText, parseLearningPrompt, prepareLearningMarkdown, stripLearningChoiceLabel } from "@/lib/learning/presentation";
import { solutionSystemPrompt } from "@/lib/learning/providers/model-support";
import { tutorSystemPrompt } from "@/lib/learning/providers/tutor";
import type { BoardLesson } from "@/lib/learning/types";

describe("AI 教学内容排版", () => {
  it("把连续选择项拆为可作答选项，且不误拆非连续标号", () => {
    expect(parseLearningPrompt("请完成原题：A. 判别式 B. 韦达定理 C. 勾股定理")).toEqual({ body: "请完成原题：", choices: ["A. 判别式", "B. 韦达定理", "C. 勾股定理"] });
    expect(parseLearningPrompt("说明：A. 只是一个缩写")).toEqual({ body: "说明：A. 只是一个缩写", choices: [] });
    expect(stripLearningChoiceLabel("（B）  韦达定理", 1)).toBe("韦达定理");
  });
  it("追问在视口下方才提示，露出可阅读的问题后消失", () => {
    expect(isSuggestionBelowViewport(700, 750, 80)).toBe(true);
    expect(isSuggestionBelowViewport(700, 680, 80)).toBe(true);
    expect(isSuggestionBelowViewport(700, 600, 80)).toBe(false);
    expect(isSuggestionBelowViewport(700, -100, 80)).toBe(false);
    expect(chatJumpLabel(false, true)).toBe("下面有猜你想问 ↓");
    expect(chatJumpLabel(true, true)).toBe("有新讲解 · 猜你想问 ↓");
    expect(chatJumpLabel(true, false)).toBe("有新讲解 ↓");
  });
  it("SSE 状态标记覆盖输出与 Bingo 完成状态，并提供无障碍说明", () => {
    const starting = renderToStaticMarkup(createElement(StreamingIndicator, { status: "streaming" }));
    const finishing = renderToStaticMarkup(createElement(StreamingIndicator, { status: "finishing" }));

    expect(starting).toContain('class="streaming-indicator');
    expect(starting).toContain('data-phase="streaming"');
    expect(starting).toContain('aria-label="正在输出"');
    expect(starting).toContain("还在继续");
    expect(finishing).toContain('data-phase="finishing"');
    expect(finishing).toContain('aria-label="输出完成"');
    expect(starting).toContain("streaming-indicator__ink-dot");
    expect(finishing).toContain("streaming-indicator__check");
    expect(finishing).toContain("streaming-indicator__sparks");
    expect(finishing).not.toContain("pencil");
    expect(STREAMING_FINISH_MS).toBeGreaterThanOrEqual(1_100);
    expect(STREAMING_SILENCE_MS).toBeGreaterThanOrEqual(700);
  });

  it("流式正文把状态标记接在最后一段，完成消息不再显示标记", () => {
    const active = renderLearningChatWithMessage("streaming");
    const complete = renderLearningChatWithMessage("complete");

    expect(active).toContain("rich-learning-text--with-trailing");
    expect(active).toContain("streaming-indicator");
    expect(complete).not.toContain("streaming-indicator");
    expect(active).not.toContain('aria-label="复制讲解"');
    expect(complete).toContain('aria-label="复制讲解"');
    expect(complete).toContain('title="复制文本"');
    expect(complete).not.toContain('aria-haspopup="menu"');
    expect(complete).not.toContain("复制图片");
    expect(complete).toContain("lesson-chat-shell");
    expect(complete).toContain("chat-message--teacher");
  });

  it("首页不要求选择学段，直接开放拍照、相册、白板和文字发题入口", () => {
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [], session: null, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).not.toContain("孩子学段");
    expect(html).not.toContain("先选择孩子所在学段");
    expect(html).toContain('aria-label="拍照发题"');
    expect(html).toContain('aria-label="从相册选择题目"');
    expect(html).toContain('aria-label="白板写题"');
    expect(html).toContain('placeholder="输入一道题目…"');
    expect(html).not.toMatch(/<textarea[^>]*\sdisabled=/);
    expect(html).not.toMatch(/aria-label="白板写题"[^>]*\sdisabled=/);
    expect(html).toContain("home-reasoning-picker");
    expect(html).toContain("home-camera-action");
    expect(html).toContain("Hey,");
    expect(html).toContain('aria-label="Hey，小逗号陪你一起解题。"');
    expect(html).toContain("陪你一起解题。");
    expect(html).toContain("home-question-count");
    expect(html.indexOf("home-reasoning-picker")).toBeGreaterThan(html.indexOf("</textarea>"));
    expect(html.match(/type="file"/g)).toHaveLength(2);
    expect(html).toContain('capture="environment"');
    expect(html).not.toContain("数理化");

  });

  it("当前回合正文结束后显示下一步装填，不重复旧等待卡片", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [
        { id: "user-1", role: "user", kind: "user", text: "请继续", status: "complete", createdAt: new Date(0).toISOString() },
        { id: "assistant-1", role: "assistant", kind: "assistant", text: "正文已经输出。", status: "finishing", createdAt: new Date(1).toISOString() },
      ],
      session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: true,
      loadingLabel: "正在继续讲解", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onReopenBoard: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).not.toContain("loading-whisper");
    expect(html).not.toContain("正在继续讲解");
    expect(html).toContain("模型识别为初中题");
    expect(html).toContain("next-turn-placeholder");
    expect(html).toContain("接下来会轮到你");
    expect(html).toContain("正在把刚才的内容整理成下一步互动");
  });

  it("学习页显示模型自动识别出的题目学段", () => {
    const session = analyzeMock(recognizeMock("math", "primary"), "doubao");
    session.problem.learnerBand = "senior";
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [], session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("模型识别为小学题");
    expect(html).not.toContain("<time");
    expect(html).not.toContain("按高中方式讲");
    expect(html).not.toContain("课程内容：小学");
  });

  it("正文仍在流式书写时不提前显示下一步装填", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [
        { id: "user-1", role: "user", kind: "user", text: "请继续", status: "complete", createdAt: new Date(0).toISOString() },
        { id: "assistant-1", role: "assistant", kind: "assistant", text: "正文仍在输出。", status: "streaming", createdAt: new Date(1).toISOString() },
      ],
      session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: true,
      loadingLabel: "正在继续讲解", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onReopenBoard: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).not.toContain("next-turn-placeholder");
  });

  it("完整讲解失败待重试时不同时展示旧的轮到你任务", () => {
    const base = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const session = { ...base, flow: { ...base.flow, stage: "core_explanation" as const, activeGate: understandingGate("换一种讲法后，清楚一些了吗？") } };
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [{ id: "solution-error", role: "assistant", kind: "assistant", text: "残缺讲解", scopeLabel: "原题完整讲解", status: "error", createdAt: new Date(0).toISOString() }],
      session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "完整讲解未通过内容验收", retryLabel: "重试这一步", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onReopenBoard: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("完整讲解未完成");
    expect(html).toContain("重试这一步");
    expect(html).toContain("请先重试刚才未完成的步骤");
    expect(html).not.toContain("轮到你了");
    expect(html).not.toContain("再次查看刚才的板书");
  });

  it("图片消息正在识别时立即显示等待卡片，不把学生消息误判为 AI 输出", () => {
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [{
        id: "user-image",
        role: "user",
        kind: "user",
        text: "这道题我不会，想把它学懂。",
        imageUrl: "blob:http://localhost/homework",
        status: "streaming",
        createdAt: new Date(0).toISOString(),
      }],
      session: null, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: true,
      loadingLabel: "正在识别题干与你的作答", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onReopenBoard: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("小逗号正在思考");
    expect(html).toContain("正在读懂这道题");
    expect(html).toContain("chat-thinking-border");
    expect(html).not.toContain("学习寄语");
  });

  it("渲染标题、列表、强调和数学公式", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, {
      text: "### 解题思路\n\n先看 **关键条件**：$x+2=5$。\n\n1. 移项\n2. 得到\n\n$$x=3$$",
    }));

    expect(html).toContain("rich-heading");
    expect(html).toContain("<ol>");
    expect(html).toContain("<strong>");
    expect(html).toContain("katex");
    expect(html).toContain("math");
  });

  it("不渲染模型返回的任意 HTML", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, {
      text: "正常内容<script>alert(1)</script><img src=x onerror=alert(2)>",
    }));

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
  });

  it("不加载模型返回的 Markdown 远程图片", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, {
      text: "不要加载 ![远程图](https://example.com/student.png)",
    }));

    expect(html).not.toContain("<img");
    expect(html).not.toContain("https://example.com");
    expect(html).toContain("图片：远程图");
  });

  it("把 OCR 原题中的高置信公式规范化为 KaTeX", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, {
      text: "在△ABC中，∠ACB = 90°，已知sinB + sinC = 2sinA cosC，且b = 3，面积为3√3/2。",
    }));

    expect(html.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("sqrt");
    expect(html).toContain("triangle");
    expect(html).not.toContain("sinB");
  });

  it("覆盖常见化学式、科学计数法和字母根式", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, {
      text: "水是H2O，二氧化碳是CO2，氯化钠是NaCl；常数约为6.02×10^23，并比较√x与√(2)。",
    }));

    expect(html.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(6);
    expect(html).toContain("mathrm");
    expect(html).toContain("sqrt");
  });

  it("紧凑选项中的分式根号保留完整根式结构", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, {
      text: "4√3/3",
      compact: true,
    }));

    expect(prepareLearningMarkdown("4√3/3")).toBe("$\\frac{4\\sqrt{3}}{3}$");
    expect(html).toContain("mfrac");
    expect(html).toContain("mord sqrt");
    expect(html).toContain("<svg");
    expect(html).toMatch(/style="min-width:0\.853em;height:1\.08em" class="hide-tail mtight"/);
    expect(html).toMatch(/style="height:[^"]+" class="vlist"/);
  });

  it("覆盖常见代数关系、变量列表和裸 LaTeX", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, {
      text: "角A,B,C对应边a,b,c，满足a²+b²=c²；另有2(x+3)=14，并比较\\frac{1}{2}与\\sqrt{x}。",
    }));

    expect(html.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("frac");
    expect(html).toContain("sqrt");
  });

  it("不会重复改写已经带公式定界符的内容", () => {
    const prepared = prepareLearningMarkdown("已有 $x+2=5$，裸公式 b = 3。");

    expect(prepared).toContain("$x+2=5$");
    expect(prepared).not.toContain("$$x+2=5$$");
    expect(prepared).toContain("$b = 3$");
  });

  it("把标准 LaTeX 定界符归一化后交给 KaTeX", () => {
    const text = "行内 \\(x+2=5\\)，独立公式 \\[y=3\\]。`\\(code\\)`";
    const prepared = prepareLearningMarkdown(text);
    const html = renderToStaticMarkup(createElement(RichLearningText, { text }));
    expect(prepared).toContain("$x+2=5$");
    expect(prepared).toContain("$$\ny=3\n$$");
    expect(prepared).toContain("`\\(code\\)`");
    expect(html.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("混合定界符只转换普通正文，保留已有公式与代码", () => {
    const source = "已有 $x=1$ 与 $$y=2$$，新增 \\(z=3\\)。`\\(inline code\\)`\n```js\n\\[block code\\]\n```";
    const prepared = prepareLearningMarkdown(source);
    expect(prepared).toContain("已有 $x=1$ 与 $$y=2$$");
    expect(prepared).toContain("$z=3$");
    expect(prepared).toContain("`\\(inline code\\)`");
    expect(prepared).toContain("\\[block code\\]");
  });

  it("流式代码围栏未闭合时不转换其中的标准公式定界符", () => {
    const source = "说明\n```text\n\\(还在输出";
    expect(prepareLearningMarkdown(source, true)).toBe(source);
  });

  it("把带编号标签的行内公式提升为 KaTeX 展示公式", () => {
    const text = "递推公式：$S_{n+3}=3S_{n+1}-S_n \\tag{1}$";
    const prepared = prepareLearningMarkdown(text);
    const html = renderToStaticMarkup(createElement(RichLearningText, { text }));

    expect(prepared).toContain("$$\nS_{n+3}=3S_{n+1}-S_n \\tag{1}\n$$");
    expect(html).toContain("katex-display");
    expect(html).not.toContain("katex-error");
    expect(html).not.toContain("color:#cc0000");
  });

  it("把原题前缀、题干和内联选项拆成稳定结构", () => {
    const parsed = parseLearningPrompt("现在请你独立重做原题：在△ABC中求a？A. 3√3 B. 2√3 C. 3 D. √3");

    expect(parsed.body).toBe("在△ABC中求a？");
    expect(parsed.choices).toEqual(["A. 3√3", "B. 2√3", "C. 3", "D. √3"]);
  });

  it("支持括号选项，但不会把英文小写小问误判成答案按钮", () => {
    expect(parseLearningPrompt("求解：（A）3 （B）4 （C）5").choices).toEqual(["A. 3", "B. 4", "C. 5"]);
    expect(parseLearningPrompt("完成两问： a. 求 x 的值 b. 证明结论成立").choices).toEqual([]);
    expect(stripLearningChoiceLabel("A. 3√3", 0)).toBe("3√3");
  });

  it("把 OCR 中连续的小问整理为有序列表", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, {
      text: "完成下列问题： 1. 求速度。 2. 判断方向。 3. 写出单位。",
    }));

    expect(html).toContain("<ol>");
    expect(html.match(/<li>/g)).toHaveLength(3);
  });

  it("紧凑模式使用行内容器，避免嵌入标记时产生无效 DOM", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, { text: "$x=3$", compact: true }));

    expect(html.startsWith("<span")).toBe(true);
    expect(html).toContain("katex");
  });

  it("流式输出的未闭合公式不被自动规范化破坏", () => {
    expect(prepareLearningMarkdown("正在推导 $x=3")).toBe("正在推导 $x=3");
    expect(prepareLearningMarkdown("正在推导 $$x=3")).toBe("正在推导 $$x=3");
    expect(prepareLearningMarkdown("正在推导 $$\nx=3", true)).toBe("正在推导 $$\nx=3");
  });

  it("消息完成时移除没有内容的尾部列表标记", () => {
    expect(finalizeLearningMarkdown("结论已经说明完。\n\n- ")).toBe("结论已经说明完。");
    expect(finalizeLearningMarkdown("三点说明\n\n1. 第一项\n2. ")).toBe("三点说明\n\n1. 第一项");
    expect(finalizeLearningMarkdown("内容结束。\n\n*\n\n")).toBe("内容结束。");
    expect(finalizeLearningMarkdown("内容结束。\n\n-\n*\n")).toBe("内容结束。");
    expect(finalizeLearningMarkdown("- 有实际内容")).toBe("- 有实际内容");
  });

  it("保护波浪线代码围栏，并保留无障碍文本中的大于号", () => {
    expect(prepareLearningMarkdown("~~~txt\nx = 3\n~~~")).toBe("~~~txt\nx = 3\n~~~");
    expect(learningTextToPlainText("条件 $x>3$")).toContain("x>3");
  });

  it("原题互动卡同时显示结构化题干、可点击选项和完整讲解入口", () => {
    const base = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const root = base.nodes.find((node) => node.id === base.rootNodeId)!;
    const prompt = "现在请你独立重做原题：在△ABC中，已知sinB + sinC = 2sinA cosC，求a。 A. 3√3 B. 2√3 C. 3 D. √3";
    const gate = answerGate("original_answer", "现在不看讲解，自己完成原题", prompt, root.id);
    const session = { ...base, flow: { ...base.flow, stage: "original_attempt" as const, activeGate: gate } };
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [], session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onReopenBoard: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("原题");
    expect(html).toContain("选择一个答案");
    expect(html).toContain("看完整讲解");
    expect(html).not.toContain("插画演示");
    expect(html.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toMatch(/style="min-width:[^"]+;height:[^"]+" class="hide-tail/);
    expect(html).not.toContain("A. 3√3 B. 2√3");
  });

  it("简答任务把白板和拍照收进键盘输入框", () => {
    const base = analyzeMock(recognizeMock("math", "primary"), "doubao");
    const root = base.nodes.find((node) => node.id === base.rootNodeId)!;
    const shortRoot = { ...root, check: { ...root.check, type: "short_text" as const, choices: undefined } };
    const gate = answerGate("original_answer", "现在独立完成原题", shortRoot.check.prompt, root.id);
    const session = { ...base, nodes: base.nodes.map((node) => node.id === root.id ? shortRoot : node), flow: { ...base.flow, stage: "original_attempt" as const, activeGate: gate } };
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [], session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));
    expect(html).toContain("当前环节");
    expect(html).toContain("独立完成原题，验证是否真正掌握");
    expect(html).not.toContain("作答方式");
    expect(html).not.toContain("提问方式");
    expect(html).not.toContain(">键盘<");
    expect(html).toContain('aria-label="输入你的答案"');
    expect(html).toContain('aria-label="打开白板作答"');
    expect(html).toContain('aria-label="拍照作答"');
    expect(html).toContain("改为提问");
    expect(html).toContain("chat-composer__input-row");
    expect(html).not.toContain('class="contents"');
  });

  it("理解确认环节展示真实教学意图，并允许在输入框直接反馈懂或没懂", () => {
    const base = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const gate = understandingGate("核心思路听懂了吗？");
    const session = { ...base, flow: { ...base.flow, stage: "core_explanation" as const, activeGate: gate } };
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [], session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("当前环节");
    expect(html).toContain("确认你是否理解核心思路");
    expect(html).toContain("懂了、没懂，或直接问…");
    expect(html).not.toContain("插画演示");
    expect(html).not.toContain("用连续插画演示原题步骤");
    expect(html).toContain('aria-label="辅助讲解"');
    expect(html).toContain("chat-gate__options");
    expect(html).toContain('data-emphasis="primary"');
    expect(html).not.toContain("用板书讲清楚");
    for (const label of ["懂了，继续", "这一步我来做", "这一步没懂", "看完整讲解"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("当前任务：核心思路听懂了吗？");
    expect(html).not.toContain("提问方式");
    expect(understandingChoiceFromText("我懂了。 ")).toBe("continue");
    expect(understandingChoiceFromText("这一步我来做")).toBe("try");
    expect(understandingChoiceFromText("这一步没懂！")).toBe("not_understood");
    expect(understandingChoiceFromText("为什么这里要作辅助线？")).toBeNull();
  });

  it("完整讲解进入回忆检查后自动收起，不让答案继续暴露在作答区", () => {
    const base = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const gate = answerGate("solution_recall_answer", "先说清楚一个关键步骤", "为什么第一步要这样做？", base.rootNodeId);
    const session = { ...base, flow: { ...base.flow, stage: "solution_recall" as const, viewedSolution: true, activeGate: gate } };
    const messages = [{ id: "solution", role: "assistant" as const, kind: "assistant" as const, text: "这是不应继续暴露的完整答案正文", scopeLabel: "原题完整讲解", status: "complete" as const, createdAt: new Date().toISOString() }];
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages, session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("完整讲解已收起");
    expect(html).toContain("关键步骤检查");
    expect(html).not.toContain("这是不应继续暴露的完整答案正文");
  });

  it("点击完整讲解后先完整展示，学生确认看完才进入收起动作", () => {
    const base = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const session = { ...base, flow: { ...base.flow, stage: "solution_recall" as const, viewedSolution: true, activeGate: { id: "review-solution", kind: "solution_review" as const, title: "完整讲解已经准备好", options: [{ id: "start_recall" as const, label: "我看完了，收起讲解", emphasis: "primary" as const }] } } };
    const messages = [{ id: "solution", role: "assistant" as const, kind: "assistant" as const, text: "这是学生刚刚请求查看的完整讲解正文", scopeLabel: "原题完整讲解", status: "complete" as const, createdAt: new Date().toISOString() }];
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages, session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));
    expect(html).toContain("这是学生刚刚请求查看的完整讲解正文");
    expect(html).toContain("我看完了，收起讲解");
    expect(html).not.toContain("完整讲解已收起");
  });

  it("看懂但暂不验证时明确显示尚未掌握，并保留三种后续路径", () => {
    const base = analyzeMock(recognizeMock("physics", "junior"), "doubao");
    const session = { ...base, flow: { ...base.flow, stage: "reviewed_complete" as const, viewedSolution: true, solutionRecallPassed: true, activeGate: null } };
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages: [], session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onReopenBoard: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("已学习 · 尚未验证掌握");
    expect(html).toContain("遮住讲解，重做原题");
    expect(html).toContain("换一道同知识点题");
    expect(html).not.toContain("再次查看刚才的板书");
    expect(html).toContain("开始新题");
  });

  it("离开完整讲解后不再提供展开答案入口", () => {
    const base = analyzeMock(recognizeMock("physics", "junior"), "doubao");
    const session = { ...base, flow: { ...base.flow, stage: "reviewed_complete" as const, viewedSolution: true, solutionRecallPassed: true, activeGate: null } };
    const messages = [{ id: "solution", role: "assistant" as const, kind: "assistant" as const, text: "完整答案正文", scopeLabel: "原题完整讲解", status: "complete" as const, createdAt: new Date().toISOString() }];
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages, session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));
    expect(html).toContain("完整讲解已收起");
    expect(html).not.toContain("点击展开复习");
    expect(html).not.toContain("完整答案正文");
  });

  it("完整讲解传输中断时隐藏残缺答案", () => {
    const base = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const messages = [{ id: "partial", role: "assistant" as const, kind: "assistant" as const, text: "残缺的答案开头", scopeLabel: "原题完整讲解", status: "error" as const, createdAt: new Date().toISOString() }];
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages, session: base, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));
    expect(html).toContain("完整讲解未完成");
    expect(html).not.toContain("残缺的答案开头");
  });

  it("异步猜你想问位于任务按钮之后，且保留来源和引用关系", () => {
    const base = analyzeMock(recognizeMock("physics", "junior"), "doubao");
    const suggestion = { id: "suggest-abcd1234", text: "为什么这条条件会决定第一步？", scopeLabel: "原题核心思路", sourceSummary: "先抓住焦距与物距之间的关系" };
    const session = { ...base, flow: { ...base.flow, activeGate: understandingGate(), suggestedQuestions: [suggestion] } };
    const messages = [
      { id: "assistant-one", role: "assistant" as const, kind: "assistant" as const, text: "先比较题目给出的关键条件。", status: "complete" as const, suggestions: [suggestion], createdAt: new Date().toISOString() },
      { id: "user-one", role: "user" as const, kind: "user" as const, text: suggestion.text, status: "complete" as const, reference: { scopeLabel: suggestion.scopeLabel, sourceSummary: suggestion.sourceSummary }, createdAt: new Date().toISOString() },
    ];
    const html = renderToStaticMarkup(createElement(LearningChat, {
      messages, session, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: false,
      loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
      onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
      onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onNewProblem: () => {}, onRetry: () => {},
    }));
    expect(html).toContain('aria-label="猜你想问"');
    expect(html.indexOf('aria-label="猜你想问"')).toBeGreaterThan(html.indexOf("看完整讲解"));
    const suggestionStart = html.indexOf('aria-label="猜你想问"');
    expect(html.lastIndexOf("</article>", suggestionStart)).toBeGreaterThan(html.lastIndexOf("<article", suggestionStart));
    expect(html).toContain("suggested-question-trail__branches");
    expect(html).toContain(suggestion.text);
    expect(html).toContain("引用 · 原题核心思路");
    expect(html).toContain(suggestion.sourceSummary);
    expect(html).toContain("chat-message--referenced");
    expect(html).toContain('class="chat-message-reference"');
    expect(html).toContain('class="chat-message-reference__summary"');
    if (process.env.SUGGESTION_PREVIEW_CSS) {
      mkdirSync("outputs/suggestion-preview", { recursive: true });
      writeFileSync("outputs/suggestion-preview/index.html", `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${process.env.SUGGESTION_PREVIEW_CSS}"></head><body>${html}</body></html>`);
    }
  });

  it("板书正文、重点标记和说明共用同一套公式渲染", () => {
    const lesson: BoardLesson = {
      title: "速度关系 $v=s/t$",
      subtitle: "把 $s$、$t$ 与 $v$ 的关系放在一起看。",
      layout: "formula",
      blocks: [
        { id: "board-1", label: "核心关系", content: "先圈出 $v=s/t$，再核对单位。", tone: "key" },
        { id: "board-2", label: "单位核对", content: "最后回到 $v=s/t$ 检查三个量的单位。", tone: "plain" },
      ],
      annotations: [{ blockId: "board-1", target: "$v=s/t$", kind: "circle", reason: "这是连接路程与时间的核心公式 $v=s/t$。" }],
      visual: null,
      returnLabel: "回到原题",
    };
    const document = compileBoardDocument(compileBoardExperience(lesson));
    const html = renderToStaticMarkup(createElement(LearningBoard, {
      experience: compileBoardExperience(lesson), document, workspaceState: createBoardWorkspaceState(document), onWorkspaceChange: () => {},
      messages: [], busy: false, loadingLabel: "", notice: "", retryLabel: "",
      onAsk: () => {}, onRegenerate: () => {}, onClose: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("board-mark--circle");
    expect(html.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("板书重点只命中公式内部时仍保留完整 KaTeX 公式", () => {
    const lesson: BoardLesson = {
      title: "速度关系",
      subtitle: "看清变量之间的关系。",
      layout: "formula",
      blocks: [
        { id: "board-1", label: "核心关系", content: "先由 $x+2=5$ 求出未知数。", tone: "key" },
        { id: "board-2", label: "回看等式", content: "变形后再代回原等式核对。", tone: "plain" },
      ],
      annotations: [{ blockId: "board-1", target: "x+2=5", kind: "circle", reason: "这是当前推理使用的核心等式。" }],
      visual: null,
      returnLabel: "回到原题",
    };
    const document = compileBoardDocument(compileBoardExperience(lesson));
    const html = renderToStaticMarkup(createElement(LearningBoard, {
      experience: compileBoardExperience(lesson), document, workspaceState: createBoardWorkspaceState(document), onWorkspaceChange: () => {},
      messages: [], busy: false, loadingLabel: "", notice: "", retryLabel: "",
      onAsk: () => {}, onRegenerate: () => {}, onClose: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("board-mark--circle");
    expect(html).toContain("class=\"katex\"");
    expect(html).not.toContain("$</span>");
  });

  it("专用介质承担主内容时不再重复展示长正文和失去目标的标记", () => {
    const lesson: BoardLesson = {
      title: "等式变形",
      subtitle: "看清每一步为什么成立",
      layout: "formula",
      blocks: [
        { id: "given", label: "已知关系", content: "先确认题目给出的等式。", tone: "plain" },
        { id: "derive", label: "推导过程", content: "这段迁移正文不应和公式脉络重复出现。", tone: "key" },
      ],
      annotations: [{ blockId: "derive", target: "迁移正文", kind: "box", reason: "隐藏正文的标记说明也不应单独出现。" }],
      plan: {
        learningGoal: "看清每一步为什么成立",
        sourceMessageIds: [],
        scenes: [
          { id: "given", title: "已知关系", content: "先确认题目给出的等式。", tone: "plain", intent: "extract", sourceMessageIds: [], visual: null },
          {
            id: "derive", title: "推导过程", content: "这段迁移正文不应和公式脉络重复出现。", tone: "key", intent: "derive", sourceMessageIds: [],
            visual: {
              kind: "formula_chain", title: "公式脉络", evidence: "题目给出 $a=b$", caption: "每次只做一次等价变形。",
              steps: [{ id: "f1", expression: "$a=b$", explanation: "写出已知" }, { id: "f2", expression: "$a+c=b+c$", explanation: "两边同加一个量" }],
            },
          },
        ],
      },
      returnLabel: "回到原题",
    };
    const document = compileBoardDocument(compileBoardExperience(lesson));
    const html = renderToStaticMarkup(createElement(LearningBoard, {
      experience: compileBoardExperience(lesson), document, workspaceState: createBoardWorkspaceState(document), onWorkspaceChange: () => {},
      messages: [], busy: false, loadingLabel: "", notice: "", retryLabel: "",
      onAsk: () => {}, onRegenerate: () => {}, onClose: () => {}, onRetry: () => {},
    }));
    expect(html).toContain("board-scene-visual--primary");
    expect(html).toContain("公式脉络");
    expect(html).not.toContain("这段迁移正文");
    expect(html).not.toContain("隐藏正文的标记说明也不应单独出现");
  });

  it("新版板书默认是一页连续课程，不展示无持久价值的学习记录工具", () => {
    const session = analyzeMock(recognizeMock("math", "junior"), "doubao");
    const blocks = createNativeBoardBlocks(session, session.flow.focus);
    const lesson: BoardLesson = {
      title: "把题目关系铺开来看",
      subtitle: "独立学习板书",
      layout: "relation",
      blocks,
      annotations: [],
      visual: null,
      plan: createNativeBoardFallbackPlan(session, blocks),
      quality: { status: "safe_fallback", reason: "完整板书没有通过内容验收。" },
      returnLabel: "回到原题",
    };
    const document = compileBoardDocument(compileBoardExperience(lesson));
    const html = renderToStaticMarkup(createElement(LearningBoard, {
      experience: compileBoardExperience(lesson), document, workspaceState: createBoardWorkspaceState(document), onWorkspaceChange: () => {},
      messages: [], busy: false, loadingLabel: "", notice: "", retryLabel: "",
      onAsk: () => {}, onRegenerate: () => {}, onClose: () => {}, onRetry: () => {},
    }));

    expect(html).toContain("board-course-route");
    expect(html).toContain("board-course-route-nav");
    expect(html).not.toContain("board-workspace-hero");
    expect(html).not.toContain("board-course-hero__heading");
    expect(html.indexOf("board-course-route-nav")).toBeLessThan(html.indexOf("board-course-content"));
    expect(html.match(/data-board-step-index=/g)?.length).toBe(5);
    for (const label of ["题意成模", "关系结构", "依据变换", "反查边界", "迁移骨架"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("本题这一步：");
    expect(html).toContain("本步目标");
    expect(html).toContain("怎么做");
    expect(html.match(/题目依据/g)?.length).toBe(compileBoardExperience(lesson).scenes.filter((scene) => scene.medium === "text" && scene.evidence).length);
    expect(html).toContain("为什么");
    expect(html).toContain("自己检查");
    expect(html).toContain("当前是安全学习框架，不是完整板书");
    expect(html).toContain("重试完整板书");
    expect(html).not.toContain("按需使用");
    expect(html).not.toContain("记笔记、标掌握、做草稿");
    expect(html).not.toContain("board-mode-switch");
    expect(html).not.toContain("先看结构，再进入细节");
  });

  it("要求自由追问和完整讲解输出结构化 Markdown 与 KaTeX", () => {
    expect(tutorSystemPrompt()).toContain("Markdown");
    expect(tutorSystemPrompt()).toContain("简洁不等于省略");
    expect(tutorSystemPrompt()).toContain("不要输出一整块无层次纯文本");
    expect(tutorSystemPrompt()).toContain("$...$");
    expect(solutionSystemPrompt()).toContain("有序列表");
    expect(solutionSystemPrompt()).toContain("KaTeX");
  });

  it("紧凑、流式与公式修复提示分别采用可读的降级呈现", () => {
    const compact = renderToStaticMarkup(createElement(RichLearningText, {
      compact: true, text: "# 标题\n\n> 引用\n\n- 一项\n- 二项\n\n---",
    }));
    const streaming = renderToStaticMarkup(createElement(RichLearningText, {
      streaming: true, text: "$$2+3=5$$", trailing: createElement("i", null, "继续"),
    }));
    const raw = renderToStaticMarkup(createElement(RichLearningText, {
      autoMath: false, text: "$$2+3=5$$",
    }));
    const malformed = renderToStaticMarkup(createElement(RichLearningText, {
      text: "这里有未闭合公式 $x+1",
    }));
    expect(compact).toContain("rich-learning-text--compact");
    expect(compact).not.toContain("<hr");
    expect(streaming).toContain("chat-streaming-text");
    expect(streaming).toContain("继续");
    expect(streaming).not.toContain("data-arithmetic-displays");
    expect(raw).toContain("2+3=5");
    expect(malformed).toContain("公式写法需核对");
  });

  it("标准讲解保留结构语义，同时屏蔽链接与图片等不受信任内容", () => {
    const html = renderToStaticMarkup(createElement(RichLearningText, {
      text: "# 一级标题\n\n## 二级标题\n\n### 三级标题\n\n普通 **重点** 与 *强调*、`代码`。\n\n> 引用依据\n\n1. 第一步\n2. 第二步\n\n- 条件\n- 结论\n\n[外部链接](https://example.com)\n\n![图示](https://example.com/a.png)\n\n---\n\n```txt\n不执行\n```",
    }));
    expect(html).toContain("rich-heading--primary");
    expect(html).toContain("rich-heading--secondary");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<code>代码</code>");
    expect(html).toContain("外部链接");
    expect(html).not.toContain("href=");
    expect(html).toContain("图片：图示");
    expect(html).toContain("<hr");
    expect(html).toContain("<pre>");
  });
});

function renderLearningChatWithMessage(status: "streaming" | "complete"): string {
  return renderToStaticMarkup(createElement(LearningChat, {
    messages: [{ id: "assistant-1", role: "assistant", kind: "assistant", text: "正在推导第一步。", status, createdAt: new Date(0).toISOString() }],
    session: null, reasoningLevels: [], reasoningLevel: "light", ready: true, busy: status === "streaming",
    loadingLabel: "", notice: "", retryLabel: "", reviewProblem: null,
    onReasoningLevel: () => {}, onFile: () => {}, onResponsePhoto: () => {}, onWhiteboard: () => {}, onSend: () => {}, onQuestion: () => {}, onChoice: () => {}, onSuggestion: () => {},
    onConfirmProblem: () => {}, onRetryOriginal: () => {}, onRequestTransfer: () => {}, onReopenBoard: () => {}, onNewProblem: () => {}, onRetry: () => {},
  }));
}
