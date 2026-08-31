---
title: '图片识别等待反馈立即出现'
type: 'bugfix'
created: '2026-08-31'
status: 'done'
route: 'one-shot'
---

# 图片识别等待反馈立即出现

## Intent

**Problem:** 图片进入聊天后，学生图片消息本身处于 `streaming` 状态，页面误以为 AI 正在输出正文并隐藏等待卡片；用户只能在图片识别完成后看到“正在理解题目”，误以为系统长时间没有响应。

**Approach:** 只有 `assistant` 消息的 `streaming` / `finishing` 状态才能抑制等待卡片。学生图片的处理状态继续保留，但不再参与 AI 输出状态判断；Chat 与板书使用同一角色边界，并增加图片识别期间的渲染回归测试。

## Suggested Review Order

1. [Chat 等待状态边界](../../components/learning-chat.tsx)
2. [板书等待状态边界](../../components/learning-board.tsx)
3. [图片识别回归测试](../../tests/rich-learning-text.test.ts)
