---
title: '理清板书问答区域'
type: 'bugfix'
created: '2026-08-29'
status: 'done'
route: 'one-shot'
---

# 理清板书问答区域

## Intent

**Problem:** 板书底部把标题、范围说明、输入、返回主线和状态反馈混在同一层级，学生不容易判断该在哪里提问、哪个动作会返回学习任务；空状态也占用过多板书可视空间。

**Approach:** 将问答区重排为单一可折叠操作坞，明确区分“围绕当前板书提问”和“回到学习主线”，按真实高度为板书正文留位，并补齐流式回答、未读、键盘和可访问性状态。

## Suggested Review Order

**信息层级与操作关系**

- 单一折叠入口统领标题、状态、输入与主线返回。
  [`learning-board.tsx:144`](../../components/learning-board.tsx#L144)

- 输入框与学习主线形成两个明确、互不混淆的动作。
  [`learning-board.tsx:165`](../../components/learning-board.tsx#L165)

**移动端与动态状态**

- 面板按真实高度留位，并随软键盘移动，避免遮挡板书。
  [`learning-board.tsx:53`](../../components/learning-board.tsx#L53)

- 流式回答自动跟随，并在折叠状态提供完成提示。
  [`learning-board.tsx:76`](../../components/learning-board.tsx#L76)

**可访问性**

- 全屏板书具备模态语义、焦点恢复和键盘焦点约束。
  [`learning-board.tsx:101`](../../components/learning-board.tsx#L101)
