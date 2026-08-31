---
title: '完整讲解后保留板书重看能力'
type: 'bugfix'
created: '2026-08-31'
status: 'done'
route: 'one-shot'
---

# 完整讲解后保留板书重看能力

## Intent

**Problem:** 查看完整讲解会推进学习 Gate，之前生成的板书随关闭被丢弃，学生无法在后续检查和作答阶段再次查看。

**Approach:** 将板书作为不改变学习进度的辅助材料：完整讲解、关键步骤检查、讲解后选择和原题作答均保留“按当前步骤生成板书”；已生成板书本地缓存并提供即时重开，刷新后仍可恢复，开始新题时清除。

## Suggested Review Order

1. [学习 Gate 的板书可用范围](../../../lib/learning/flow.ts) — 核对完整讲解后的各阶段仍提供板书。
2. [板书请求不改变当前任务](../../../lib/learning/http/turn.ts) — 核对任一合法 Gate 均可调用且原状态保留。
3. [板书缓存与恢复](../../../components/education-chat-app.tsx) — 核对关闭、重开、刷新和新题清理。
4. [重看入口与作答卡](../../../components/learning-chat.tsx) — 核对入口文案及不打断当前任务的表达。
5. [流程回归](../../../tests/learning-turn.test.ts) — 核对完整讲解后的板书、回忆与原题路径。
