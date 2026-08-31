---
title: '稳定完整讲解生成与展示'
type: 'bugfix'
created: '2026-08-31'
status: 'done'
route: 'one-shot'
---

# 稳定完整讲解生成与展示

## Intent

**Problem:** 完整讲解经常因模型标题写法或推导结构不符合硬编码规则而失败；失败前草稿已进入聊天流，导致用户看到重复的“传输中断”，即使上游传输实际正常。

**Approach:** 完整讲解继续把上游 SSE 增量直接转发给页面，保持打印机效果；结束时做内容验收，未通过则发送原位重置事件，并携带具体缺项自动流式重写一次。只有最终通过验收才推进学习状态，同时保留篇幅、四段结构、至少两步推导和逐小问覆盖等质量底线。

## Suggested Review Order

1. [完整讲解质量诊断](../../../lib/learning/solution-quality.ts) — 检查明确缺项、等价标题和步骤识别是否仍守住质量底线。
2. [生成与自动重写](../../../lib/learning/providers/solution.ts) — 检查上游增量即时转发，第一次不合格时原位重置且只重写一次。
3. [实时模型接入](../../../lib/learning/providers/adapter.ts) — 检查完整讲解统一走验收链路。
4. [聊天学习流](../../../lib/learning/http/turn.ts) — 检查验收通过后才发送正文并推进状态。
5. [旧解答接口](../../../lib/learning/http/solution.ts) — 检查旧入口也不会输出残缺答案。
6. [提示合同](../../../lib/learning/providers/model-support.ts) — 检查四段 Markdown 结构要求明确且不压缩讲解深度。
7. [可靠性回归](../../../tests/provider-contract.test.ts) — 检查自动重写、上游 SSE 和草稿隔离。
8. [完整讲解验收测试](../../../tests/solution-stream.test.ts) — 检查多小问、等价标题、中文步骤和具体失败原因。
9. [真实用户测试脚本](../../../scripts/real-user-e2e.mjs) — 检查三档推理强度可独立运行且使用同一质量判定。
