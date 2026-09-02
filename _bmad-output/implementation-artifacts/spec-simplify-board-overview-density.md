---
title: '降低板书总览信息密度'
type: 'refactor'
created: '2026-09-02'
status: 'done'
route: 'one-shot'
context: []
---

# 降低板书总览信息密度

## Intent

**Problem:** 标准数学五步在顶部同时展示动作名与长解释，形成高密度双列文字网格；学习目标又被误套成整条绿色胶囊，主线、目标和路线互相抢夺注意力。

**Approach:** 标准数学五步改为单行五节点，只在总览保留五个短动作名，长解释继续留在对应步骤卡；学习目标恢复为普通辅助文字，并统一节点文字高度。非标准路线与其他学科继续保留原生标题。

## Suggested Review Order

**总览降噪**

- 标准五步只展示短动作，完整解释仍由步骤卡承载。
  [`board-workspace.tsx:29`](../../components/board-workspace.tsx#L29)

- 五节点时间线、目标文字和移动端对齐规则集中在此。
  [`board-course.css:134`](../../app/board-course.css#L134)

**稳定判定**

- 简洁模式只依赖学科与角色，不受 AI 标题措辞影响。
  [`board-step-copy.ts:18`](../../lib/learning/board-step-copy.ts#L18)

**回归保护**

- 验证顶部短文案只出现一次，完整解释仍留在正文卡片。
  [`rich-learning-text.test.ts:501`](../../tests/rich-learning-text.test.ts#L501)

- 覆盖原生标题恰好等于标准描述的边界。
  [`board-step-copy.test.ts:22`](../../tests/board-step-copy.test.ts#L22)
