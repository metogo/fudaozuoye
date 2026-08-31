---
title: 统一学习内容排版与公式渲染
status: done
baseline_commit: cc0ca25cf34af996e2e09290bbb7639218e91651
context: []
---

# 统一学习内容排版与公式渲染

## Intent

当前活动入口中的模型讲解已经支持 Markdown 与 KaTeX，但 OCR 原题、强制互动卡、作答反馈、板书正文、板书标记说明和配图文字仍存在散落的纯文本出口。用户会看到题干、选项和公式挤成一段，且同一题在不同区域呈现标准不一致。本次改动建立单一展示规范，不改变用户输入、OCR 修订和学习状态机。

## Tasks & Acceptance

- [x] 建立统一的展示前数学规范化层。
  - Given 内容已经包含 `$...$`、`$$...$$`、代码或 HTML 标签，When 进入展示层，Then 不重复包裹公式、不破坏代码边界，且任意 HTML 不被执行。
  - Given OCR 含三角形、角度、三角函数、根式、科学计数法、坐标或常见化学式，When 内容展示，Then 高置信数学片段由 KaTeX 渲染，原始语义不被改写。
- [x] 把原题互动卡改为结构化题目展示。
  - Given 原题含内联 `A-D` 选项，When 进入独立作答，Then 题干和选项分区显示，选项可直接点击，完整讲解入口不能遮挡选项。
  - Given OCR 含连续编号小问，When 展示题干，Then 小问以有序列表呈现。
- [x] 覆盖当前活动 Chat 的模型内容出口。
  - Given AI 讲解、知识路径、作答反馈、Gate 标题/题干或答案选项含公式，When 渲染，Then 全部使用统一富文本与 KaTeX；用户消息、编辑框、错误提示等忠实原文/UI 文案不执行 Markdown。
- [x] 覆盖当前活动 Board 的模型内容出口。
  - Given板书标题、总览、正文、重点说明、板书问答、配图标题/图注/依据含公式，When 渲染，Then 全部使用统一富文本与 KaTeX，并保留圈画重点。
  - Given SVG 图元标签，When 模型返回公式标签，Then 服务端拒绝并要求把公式放进可由 KaTeX 渲染的图注。
- [x] 补齐生成合同与回归验证。
  - Given 后续模型生成教学、验收、选择题、板书或配图内容，When 输出包含公式，Then提示词要求 KaTeX 兼容格式。
  - Given 本次改动，When 执行类型检查、Lint、全量测试与生产构建，Then 全部通过。

## Non-goals

- 不把学生输入或 OCR 修订 textarea 变成 Markdown 编辑器。
- 不改变模型、学习 Flow、会话持久化或答案判断规则。
- 不在 SVG `<text>` 内运行 KaTeX；复杂公式必须移到图注。

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- 390×844 手机视口检查生产构建可正常加载，无浏览器错误。

## Suggested Review Order

**统一展示边界**

- 从单一规范化入口理解 OCR、流式文本与公式边界。
  [`presentation.ts:19`](../../lib/learning/presentation.ts#L19)

- 富文本组件统一封装安全 Markdown、KaTeX 与外链图片拦截。
  [`rich-learning-text.tsx:50`](../../components/rich-learning-text.tsx#L50)

- 公式滚动、题干层级和移动端可读性集中在展示样式。
  [`globals.css:42`](../../app/globals.css#L42)

**学习界面接入**

- 原题卡拆分题干与选项，并保留独立作答控制。
  [`learning-chat.tsx:187`](../../components/learning-chat.tsx#L187)

- 板书圈画扩展到完整公式边界，避免切断 KaTeX。
  [`learning-board.tsx:187`](../../components/learning-board.tsx#L187)

**服务端可靠性**

- 板书内容、标记和 SVG 标签在进入页面前完成校验。
  [`board.ts:173`](../../lib/learning/providers/board.ts#L173)

- 选项判等保留正负号与关系符，防止标准答案翻转。
  [`blueprint.ts:427`](../../lib/learning/providers/blueprint.ts#L427)

**回归证据**

- 覆盖原题卡、常见公式、板书圈画和不可信 Markdown。
  [`rich-learning-text.test.ts:125`](../../tests/rich-learning-text.test.ts#L125)

- 覆盖正负选项去重和标准答案映射。
  [`curriculum-blueprint.test.ts:118`](../../tests/curriculum-blueprint.test.ts#L118)
