---
title: '暂时停用图片复制'
type: 'chore'
created: '2026-09-04'
status: 'done'
route: 'one-shot'
---

# 暂时停用图片复制

## Intent

**Problem:** 用户要求先停用生成图片功能。

**Approach:** 移除图片复制入口及菜单，点击复制图标直接复制文本。图片实现与测试保留，注释说明暂停原因，不提交代码。

## Suggested Review Order

1. [复制入口](../../components/copyable-learning-text.tsx)：直接复制文本，不再调用图片生成。
2. [展示回归](../../tests/rich-learning-text.test.ts)：完成后显示文本复制按钮，没有图片菜单。相关 67 项测试、类型检查和针对性 lint 通过。
