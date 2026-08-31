---
title: 'SSE 铅笔书写光标'
type: 'feature'
created: '2026-08-31'
status: 'done'
route: 'one-shot'
---

# SSE 铅笔书写光标

## Intent

**Problem:** 流式讲解只有文字逐步出现，用户看不出 AI 是开始生成、正在连续输出、暂时思考还是已经结束；旧的竖线光标也无法传达教学产品的书写感。

**Approach:** 使用轻量内联 SVG 的手握铅笔角色跟随最后一段正文。浏览器按顺序等待每个 SSE 事件完成一次可见绘制，即使多个 `message.delta` 被网络合并到同一分片，也不会被 React 批处理成整段突现。每个过大的正文分片再按 4–5 个字符拆成可见书写节奏；等待首字时手腕落笔，持续收到正文时手与铅笔共同书写，超过短暂间隔未收到新内容时悬笔思考。收到 `message.complete` 后先保持停笔 0.8 秒，再从握笔姿态过渡为打响指，响指完成后整体消失。普通 Chat 与板书问答共用同一状态组件，并遵守系统的减少动态效果设置。

## Acceptance

- 首个正文 token 出现前可看到落笔状态。
- SSE 持续输出时铅笔贴在最后一段正文后书写。
- 同一个网络分片内的多个正文事件仍须逐次绘制，不能一次性显示整段。
- token 停顿超过约半秒时转为轻微悬笔，不伪装仍在输出。
- 收到完成事件后原地停笔 0.8 秒，再切换为打响指动作，完整结束周期约 1.76 秒。
- 普通 Chat、板书问答和手机宽度均可用；旧竖线光标不再重复出现。
- 历史完成消息不会重新播放动画；刷新时已完成的收笔状态恢复为完成消息。
- 当前回合正文已经出现后，不得因为后台仍在生成推荐问题而重新插入等待卡片。

## Verification

- 自动化：类型检查、Lint、生产构建通过；16 个测试文件、214 项测试全部通过。
- 真实页面首反馈：提交题目后约 0.4 秒显示等待状态。
- 真实普通讲解：首段约 0.3 秒出现，正文从 4 字持续增长到 403 字；铅笔经历 `streaming → paused → streaming → finishing → none`。
- 真实完整讲解：记录 112 次可见正文增长，从 4 字持续增长到 840 字；输出期间没有等待卡片反复出现。
- 真实自由追问：目视确认铅笔位于当前最后一个字后；完成动作后约 0.9 秒消失。

## Suggested Review Order

1. [铅笔状态组件](../../../components/streaming-pencil.tsx)
2. [Chat 消息接入](../../../components/learning-chat.tsx)
3. [板书问答接入](../../../components/learning-board.tsx)
4. [SSE 完成生命周期](../../../components/education-chat-app.tsx)
5. [浏览器 SSE 顺序消费](../../../lib/learning/client-sse.ts)
6. [动画与无障碍降级](../../../app/globals.css)
7. [排版与状态回归](../../../tests/rich-learning-text.test.ts)
8. [SSE 批处理回归](../../../tests/client-sse.test.ts)
