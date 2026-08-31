---
title: '移除会话页无效品牌字样并发布'
type: 'bugfix'
created: '2026-08-29'
status: 'done'
route: 'one-shot'
---

# 移除会话页无效品牌字样并发布

## Intent

**Problem:** 会话页标题“AI 学习教练”不提供当前学习信息，占用头部注意力。

**Approach:** 会话中移除该标题，仅保留日期时间；首页短句、开始新题和学习流程保持不变。通过完整工程门禁与线上真实模型旅程后发布 CloudBase 新版本。

## Suggested Review Order

1. [会话头部：仅保留有效状态信息](../../../components/learning-chat.tsx) — 核对首页与学习中两种头部状态。
2. [部署配置](../../../cloudbaserc.json) — 核对云函数与静态应用仍指向既有生产环境。
3. [真实用户验收脚本](../../../scripts/real-user-e2e.mjs) — 核对发布后六条学习路径门禁。
