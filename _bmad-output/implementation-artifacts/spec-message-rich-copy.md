---
title: '讲解完成后复制正文与格式'
type: 'feature'
created: '2026-09-04'
status: 'done'
baseline_commit: 'f30047e48d04fcb1ee0d50c405b6f0f05697e5b1'
---

## Intent

正文输出完成后，尾部完成对钩消失，正文右下角出现复制图标。复制本段正文，不含猜你想问或其他操作。富文本剪贴板保留标题、列表、段落、强调和数学结构，同时提供可读纯文本。目标应用支持能力不同，不承诺任意应用像素一致。

## Boundaries

不修改里程碑对钩，不改变讲解流程，不引入依赖。输出中、收尾中、错误和隐藏答案不提供复制。拒绝剪贴板权限时明确提示失败，纯文本降级时明确告知。保留已有未提交改动，不提交。

## Tasks & Acceptance

- [x] 新增独立复制组件与剪贴板格式构造；将 MessageBubble 正文接入。
- [x] Given 已完成非空讲解，when 点击复制，then 写入 text/html 与 text/plain，反馈成功；其他状态无按钮。
- [x] Given 含公式与列表正文，when 复制，then 不重复 KaTeX 双份内容，保留列表编号与公式意义。
- [x] Given 剪贴板拒绝或不支持富文本，when 点击，then 明确失败或纯文本降级，不假报保留格式。

## Verification

静态渲染与剪贴板 API 单测，类型检查、lint，浏览器实际点击读取剪贴板。

实际结果：520项测试、typecheck、lint通过。真实本地会话点击复制显示“已复制”，截图确认按钮位于正文右下角，完成后的流式对钩不存在。浏览器DOM导出夹具验证标题、起始编号3、嵌套子项、单份MathML分数、代码缩进/连续空行均通过。自动化浏览器虚拟剪贴板无法回读实际复制内容，因此未宣称Word/微信等外部应用粘贴验收通过。临时公开测试页面和生成脚本已清理。

## Review Notes

审查发现纯文本归一化损坏代码缩进、列表丢失嵌套层次，已修复并在浏览器夹具验证。
验收审查无阻塞；盲审待核对项已确认只替换 .katex 自身，不删除其段落。未提交代码；全局finalizer仍受此前写入权限限制。

## Suggested Review Order

- 复制按钮状态和正文范围。
  [copyable-learning-text.tsx:21](../../components/copyable-learning-text.tsx#L21)
- 富文本和纯文本格式转换。
  [copy-rich-text.ts:43](../../lib/learning/copy-rich-text.ts#L43)
- 剪贴板失败与降级测试。
  [copy-rich-text.test.ts:1](../../tests/copy-rich-text.test.ts#L1)
