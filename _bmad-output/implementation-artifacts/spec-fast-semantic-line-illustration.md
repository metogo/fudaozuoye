---
title: '用快速语义线框图演示原题步骤'
type: 'feature'
created: '2026-09-05'
status: 'superseded'
baseline_commit: 'abdfa23'
context:
  - '_bmad-output/implementation-artifacts/spec-step-illustration-demo.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

本方案未通过跨题型教学质量验收，已由 `spec-verified-teaching-illustration.md` 替代。下面保留原方案意图用于追溯，不代表当前实现。

**Problem:** 写实图片生成耗时过长，而且容易只描绘题目场景，不能帮助学生看懂数量关系和演算步骤。

**Approach:** 保留模型对有效步骤和帧数的判断，但把最终画面改为程序即时绘制的连续语义线框图；每幅图必须表达新增、分割、周长路径、前后比较或结果汇总等解题关系，并严格绑定当前原题的已核验解答证据。

## Boundaries & Constraints

**Always:** 点击后才生成；模型按题目复杂度选择 2–6 个有效步骤；画面以关系表达为主，不追求写实；演算文字由服务端从已核验解答中按证据 ID 回填；规划超时自动降级为可信证据驱动的线框分镜；同题同解答在当前页面直接复用。

**Ask First:** 恢复写实图片模式；增加跨设备持久化；让用户编辑分镜或图形。

**Never:** 让模型自由改写演算证据；为了凑帧重复内容；用装饰性场景代替数量关系；因图片模型缺失而禁用线框演示；生成失败时推进学习状态。

</frozen-after-approval>

## Suggested Review Order

- 分镜只选择证据 ID，服务端回填原文，并在模型超时时生成可用的动态帧数方案：`lib/learning/providers/illustration.ts`。
- 适配器只调用一次短时文本规划，再生成本地 SVG 线框图，不调用慢速图片模型：`lib/learning/providers/adapter.ts`。
- 同题缓存指纹在 JSON 往返后保持一致，客户端关闭重开不重复生成：`lib/learning/illustration-fingerprint.ts`、`components/education-chat-app.tsx`。
- 动态帧数、证据绑定、SVG 语义和真实适配器无图片调用由 `tests/illustration-demo.test.ts` 覆盖。
