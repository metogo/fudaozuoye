---
title: '压缩板书总览并重整五步卡片层级'
type: 'refactor'
created: '2026-09-02'
status: 'done'
baseline_commit: '1850bfc45c9fa4e6b7ea627771ce1ce73b78a4cc'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前板书把“本页目标”和“五步目录”拆成两张大卡片，顶部占用过多；每一步内部虽然包含目标、正文、依据、图形、解释和自查，但层级弱、辅助字号过小，学生需要逐行寻找重点。

**Approach:** 将学习目标与五步脉络合并为一张紧凑总览卡；每一步统一为“本步目标—怎么做—题目依据/辅助图—为什么—自己检查”的阅读顺序，并提高移动端辅助文字的可读字号。保留学科原生内容和公式，不通过删减教学信息换取简洁。

## Boundaries & Constraints

**Always:** 数学五步使用已确认文案；目录与卡片标题必须来自同一展示规则；正文、公式、图形、原题依据和自查能力完整保留；手机端优先，桌面端自然扩展；非数学学科继续显示自己的专业步骤标题。

**Ask First:** 若需要删除学习目标、原题依据、为什么成立、自查或任何学科内容，必须先由用户确认。

**Never:** 不把所有学科强行改成数学五步；不通过 10px 以下文字压缩空间；不引入新的 UI 依赖；不修改模型生成协议、教学推导内容或答案保护规则；不提交、不推送、不部署。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 数学五步板书 | 5 个标准教学场景 | 单张总览卡内呈现目标与五步；目录和正文卡片显示确认后的五组文案 | 缺少学科信息时保留原始标题 |
| 其他学科板书 | 5 个学科原生场景 | 使用相同清晰结构，但保留物理、化学、语文等专业标题 | 不套用数学标题 |
| 非标准板书 | 场景数量不是 5 或角色顺序异常 | 保留模型/引擎原始标题，不错误映射五步 | 使用通用角色提示词 |
| 内容较长 | 长正文、公式或辅助图 | 分区清楚、公式可横向滚动、正文不缩小到难读 | 页面继续纵向滚动，不截断内容 |

</frozen-after-approval>

## Code Map

- `components/board-workspace.tsx` -- 总览与步骤卡片的语义结构、标题展示入口。
- `lib/learning/board-step-copy.ts` -- 数学标准五步与非标准场景的安全展示规则。
- `app/globals.css` -- 当前板书样式入口；应只保留导入，避免继续扩大超限文件。
- `app/board-course.css` -- 承接并重整板书总览、卡片、辅助内容和可视化字号。
- `tests/rich-learning-text.test.ts` -- 服务端渲染验收五步文案、合并结构与内容完整性。
- `tests/board-step-copy.test.ts` -- 验收数学、非数学和角色顺序异常的映射边界。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/board-step-copy.ts` -- 只在标准数学五步角色顺序成立时使用确认文案，防止索引错配。
- [x] `components/board-workspace.tsx` -- 合并顶部总览与五步目录，并为卡片正文补充稳定的语义分区标题。
- [x] `app/board-course.css`、`app/globals.css` -- 将板书样式从超限全局文件拆出，压缩顶部间距，提高所有辅助文字和控件字号。
- [x] `tests/rich-learning-text.test.ts`、`tests/board-step-copy.test.ts` -- 覆盖合并布局、双处标题一致、学科隔离和异常回退。

**Acceptance Criteria:**
- Given 手机端打开标准数学板书, when 浏览顶部, then 一张总览卡内可读到学习主线、学完目标和五步目录，不再出现上下两张独立大卡。
- Given 学生阅读任一步骤, when 从标题向下浏览, then 能按“本步目标—怎么做—依据/图形—为什么—自己检查”辨认内容职责，辅助文字不低于舒适的移动端阅读字号。
- Given 非数学或非标准五步板书, when 页面渲染, then 原有学科标题与内容不被数学文案覆盖。
- Given 长公式和长正文, when 页面渲染, then 内容不截断、不溢出，公式仍可横向查看，页面仍可正常纵向滚动。

## Spec Change Log

## Design Notes

总览卡只合并容器，不删除信息：顶部保留一条学科标识、一句主线、一句学完目标和紧凑五步。步骤卡使用轻量标签建立层级，正文仍是视觉主体；深绿色块只承担“为什么”，避免每个区域都变成同等重量的卡中卡。

## Verification

**Commands:**
- `npm run typecheck` -- TypeScript 无错误。
- `npm run lint` -- ESLint 无错误。
- `npm test` -- 全量测试通过。
- `npx next build --webpack` -- 生产构建通过。
- `git diff --check` -- 无空白或补丁格式问题。

**Manual checks (if no CLI):**
- 在手机宽度检查顶部只剩一张总览卡、五步不截断、正文与辅助说明字号舒适、长公式和页面滚动正常。

## Suggested Review Order

**总览与卡片层级**

- 合并目标与路线，并保留每题原生步骤定位。
  [`board-workspace.tsx:19`](../../components/board-workspace.tsx#L19)

- 标准数学五步只在完整角色序列下生效。
  [`board-step-copy.ts:3`](../../lib/learning/board-step-copy.ts#L3)

**移动端可读与边界**

- 统一辅助字号、长标题、公式和自适应路线布局。
  [`board-course.css:131`](../../app/board-course.css#L131)

- 小屏证据链与比较矩阵保留完整内容。
  [`board-course.css:57`](../../app/board-course.css#L57)

**验收保护**

- 覆盖数学、非数学及零、四、六步回退。
  [`board-step-copy.test.ts:7`](../../tests/board-step-copy.test.ts#L7)

- 验证单卡总览、原生标题和逐卡题目依据。
  [`rich-learning-text.test.ts:480`](../../tests/rich-learning-text.test.ts#L480)
