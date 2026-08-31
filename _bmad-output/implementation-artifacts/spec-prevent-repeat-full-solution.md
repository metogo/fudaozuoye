---
title: '完整讲解单次查看约束'
type: 'bugfix'
created: '2026-08-29'
status: 'done'
route: 'one-shot'
---

# 完整讲解单次查看约束

## Intent

**Problem:** 学生查看完整讲解并作答错误后，新的互动卡仍会再次提供“看完整讲解”，可以无限重复生成答案，既形成死循环，也绕开独立作答的学习目的。

**Approach:** 复用会话已有的 `viewedSolution` 事实，在服务端统一移除后续 Gate 的完整讲解动作并拒绝重复请求；前端同时过滤刷新前遗留的旧 Gate。第一次查看后只允许独立作答、当前步骤追问或补救，不再重复展示答案。

## Suggested Review Order

**状态机约束**

- 查看记录成为服务端统一清理重复入口的唯一事实源。
  [`flow.ts:49`](../../lib/learning/flow.ts#L49)

- 重复请求被拒绝，后续生成的 Gate 自动继承限制。
  [`turn.ts:34`](../../lib/learning/http/turn.ts#L34)

- 旧密封会话恢复时同步迁移，避免刷新后入口复活。
  [`api.ts:21`](../../lib/learning/api.ts#L21)

**界面与回归**

- 客户端过滤已缓存旧 Gate，首次渲染即不再显示按钮。
  [`learning-chat.tsx:167`](../../components/learning-chat.tsx#L167)

- 回归锁定单次查看、重复拒绝和独立作答闭环。
  [`learning-turn.test.ts:172`](../../tests/learning-turn.test.ts#L172)

- 旧会话迁移测试防止刷新后再次出现入口。
  [`session-security.test.ts:65`](../../tests/session-security.test.ts#L65)
