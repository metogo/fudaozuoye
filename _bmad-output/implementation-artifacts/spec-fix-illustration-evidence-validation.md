---
title: '修复插画演算依据误拒绝'
type: 'bugfix'
created: '2026-09-05'
status: 'done'
route: 'one-shot'
---

# 修复插画演算依据误拒绝

## Intent

**Problem:** 插画分镜把少于六个字符的演算依据一律判为非法，也拒绝 JSON 字符串中的换行，导致 `18+4` 等真实、已核验的短公式无法生成插画。

**Approach:** 允许来源匹配的完整短公式、明确操作短语及换行证据，同时继续拒绝空泛短语、残缺算式、数字边界错配和非逐字 Unicode 替换；展示文本保持原样。

## Suggested Review Order

**校验边界**

- 接受有效短证据，同时严格限定公式完整性和操作语义。
  [`illustration.ts:150`](../../lib/learning/providers/illustration.ts#L150)

- 用字符与数字边界核对证据确实来自已核验解答。
  [`illustration.ts:168`](../../lib/learning/providers/illustration.ts#L168)

**模型契约与回归**

- 明确要求单字符串证据，并允许模型保留短公式。
  [`illustration.ts:29`](../../lib/learning/providers/illustration.ts#L29)

- 覆盖短公式、换行、残缺表达式和相似数字误匹配。
  [`illustration-demo.test.ts:38`](../../tests/illustration-demo.test.ts#L38)
