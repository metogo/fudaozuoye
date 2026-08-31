---
title: '等待卡片流动描边反馈'
type: 'feature'
created: '2026-08-29'
status: 'done'
route: 'one-shot'
context: []
---

# 等待卡片流动描边反馈

## Intent

**Problem:** AI 等待卡片只有静态边框和圆点，用户容易误以为页面停住。

**Approach:** 在原卡片边缘增加缓慢移动的灰阶高光，保留安静的阅读体验，并服从系统的减少动态效果设置。

## Suggested Review Order

- 以遮罩限制动画只出现在边缘，不干扰正文阅读。
  [`globals.css:428`](../../app/globals.css#L428)

- 慢速往返与低对比度共同表达“仍在处理”。
  [`globals.css:662`](../../app/globals.css#L662)
