---
title: '修复根号渲染与本地 API 版本错位'
type: 'bugfix'
created: '2026-08-29'
status: 'done'
route: 'one-shot'
---

# 修复根号渲染与本地 API 版本错位

## Intent

**Problem:** KaTeX 根号依赖的行内布局样式在富文本组件中被丢弃，导致分数可见但根号消失；同时本地开发只热更新页面，学习 API 长时间运行旧代码，使白板作答被新版页面发送到旧版接口并返回 400。

**Approach:** 富文本组件完整转交 KaTeX 生成的安全展示属性，并用真实浏览器尺寸检查根号可见性；本地开发同时监听函数编译产物和 API 进程，确保前后端版本同步。保留现有学习 Flow、白板消息和失败重试行为。

## Suggested Review Order

**公式展示边界**

- 确认 KaTeX 的定位和尺寸属性不再被组件截断。
  [`rich-learning-text.tsx:28`](../../components/rich-learning-text.tsx#L28)

**本地开发一致性**

- 确认函数源码重新编译后，API 自动重载且退出时完整清理子进程。
  [`dev-local.sh:9`](../../scripts/dev-local.sh#L9)

**回归证据**

- 检查根式 DOM 布局属性和原题互动卡中的多处根号。
  [`rich-learning-text.test.ts:58`](../../tests/rich-learning-text.test.ts#L58)
