---
title: 插画页只做图解讲解
type: refactor
created: 2026-09-05
status: done
baseline_commit: 8c7778729db278d6d55375956dd786d9e8efd1fd
context: []
---

<frozen-after-approval reason="用户已明确直接实施">

## Intent

插画页服务于完整理解原题，而非考查学生或展示内部质量日志。以图形关系、必要算式、简短解释连续剖析所有小问；不出现想一想、练习或理解确认。

## Boundaries & Constraints

Always：保留后台核验、失败拦截及原35秒/校对8秒预算；保留步骤切换、关闭、重试与缓存能力。保留必要且易懂的图示限制和表达式含义，不能用隐藏诊断掩盖已知错误。只改插画体验，不改主聊天教学流程。保留上一轮全部工作。

Ask First：新增服务、放宽核验、增加调用预算或部署。

Never：学生页面展示核验日志、对象编号、内部缓存机制；新增提问或答题控件；承诺所有题都高质量。

## I/O & Edge-Case Matrix

| 场景 | 预期 |
|---|---|
| 已生成/旧缓存 | 图、步骤标题、讲解可见；verification不渲染 |
| 图形/纯公式步 | 图形为主；纯公式步不留空画布 |
| 加载/失败 | 学生可理解的状态、重试；原始错误不丢失于后台 |
| 多步演示 | 可切换、关闭、重新生成，不出现考查 |

</frozen-after-approval>

## Code Map

- `components/learning-illustration.tsx`：学生页面及导航。
- `lib/learning/providers/general-teaching.ts`：图解编排要求。
- `lib/learning/teaching-audit.ts`：已有独立审核，保留边界。
- `tests/`、`scripts/illustration-e2e.mjs`：回归与浏览器验收。

## Tasks & Acceptance

- [x] 调整插画页面：移除核验、机械承接和重复来源块；精简提示，保留必要图义信息。
- [x] 调整生成提示词：直接完整图解，无提问；跨步承接体现在图与讲解中，保留后台校验和预算。更新缓存版本。
- [x] 加入渲染/提示词回归，检查加载、失败及旧结果；实际浏览器验证页面与导航。
- [x] lint、typecheck、测试及函数构建通过，记录本轮结果，不将已有通用质量缺口声明为解决。

Given 含核验日志的结果，when 打开插画，then 日志不出现在学生页面且数据仍保留。
Given 新题，when 编排步骤，then 要求覆盖所有小问，用图与必要算式直接说明，不要求学生作答。
Given 移动页面，when 浏览和切换步骤，then 图文可读、无新增考查且导航正常。

## Spec Change Log

用户确认保留脏工作树直接实施；不再追加方案批准。上一轮通用能力仍未整体验收，属于既有背景，不在本次展示调整中宣称完成。

三路只读审查完成：边界与验收未见阻断；两项patch已处理——保留clarification的具体缺失条件、E2E增加正文及图中标签的考查文案断言。无需意图变更。当前分支包含上一轮未完成且与本轮重叠的通用底座，保留未提交状态，避免把未验收背景工作一并提交。

## Verification

执行测试、lint、typecheck、函数构建；浏览器覆盖正常结果与失败态，并检查截图。

651项测试通过；lint、typecheck、函数构建通过。浏览器注入历史三步结果（不是模型生成验收），验证核验数据不可见、导航、关闭重开缓存和友好错误：`outputs/illustration-explain-only-ui/`。真实二次方程调用记录 `outputs/illustration-explain-only-live/` 失败，作为已有生成稳定性缺口保留，不宣称真实图解质量通过。

审查修补后最终652项测试、lint、typecheck、函数构建与生产构建全部通过。仅恢复Next自动生成的路径差异；未部署。

## Suggested Review Order

- 学生页面只呈现图解主体。
  [learning-illustration.tsx:165](../../components/learning-illustration.tsx#L165)
- 失败摘要保留具体缺失条件，隐藏技术日志。
  [learning-illustration.tsx:27](../../components/learning-illustration.tsx#L27)
- 生成与既有审查共同约束直接讲解。
  [general-teaching.ts:11](../../lib/learning/providers/general-teaching.ts#L11)
  [teaching-audit.ts:7](../../lib/learning/teaching-audit.ts#L7)
- 回归覆盖历史数据、导航、失败及讲解要求。
  [learning-illustration.test.ts:20](../../tests/learning-illustration.test.ts#L20)
