---
title: '修复整题题号被误判为小问'
type: 'bugfix'
created: '2026-09-03'
status: 'done'
baseline_commit: 'f30047e48d04fcb1ee0d50c405b6f0f05697e5b1'
context:
  - '_bmad-output/implementation-artifacts/spec-stabilize-full-solution-generation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 完整讲解验收器把题目开头的“6.”识别成“第 6 个小问”，导致单问题已经讲完仍被判为未覆盖第 6 问，用户只能反复重试，永远无法继续学习。

**Approach:** 将小问识别改为保守的结构识别：单独题号不触发多小问验收；只有出现至少两个从 1 开始、连续且同级的任务编号时，才要求完整讲解逐项覆盖。显式“第 1 问/问题 1”和括号编号保留为强信号，并排除条件清单。

## Boundaries & Constraints

**Always:** “6. 如图……”和“1. 一道单题……”均视为整题题号；“6. 题干（1）求……（2）判断……”只识别内部 1、2；真正多小问仍必须逐项回答；规则面向所有学科与题号，不写第 6 题特例。

**Ask First:** 若需要让模型额外输出结构化小问字段，或改变完整讲解的四段内容标准，先由用户确认。

**Never:** 通过跳过完整讲解验收、放宽所有多小问检查或看到“如图”就特殊处理来掩盖误判。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 单独整题题号 | `6. 如图，求周长` | 不产生第 6 问缺失错误 | 继续执行其他内容验收 |
| 真正多小问 | `1. 求速度；2. 判断方向` | 识别 1、2，并要求逐项覆盖 | 缺一问时返回具体缺项 |
| 外层题号加内层小问 | `6. 题干（1）求值（2）说明理由` | 排除 6，只识别 1、2 | 不把外层题号混入缺项 |
| 编号条件清单 | `1. 长为15米；2. 宽为12米；问周长` | 不视为两个小问 | 按单问题验收 |
| 跳号或重复 | `1. ...；3. ...` 或 `1. ...；1. ...` | 不臆造多小问结构 | 保守地不做小问覆盖判断 |

</frozen-after-approval>

## Code Map

- `lib/learning/solution-quality.ts` -- 提取题目小问编号并生成内容验收结果。
- `tests/solution-stream.test.ts` -- 覆盖单题题号、条件清单和真实多小问回归。
- `functions/learning-api/dist/lib/learning/solution-quality.js` -- 由服务端构建同步生成。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/solution-quality.ts` -- 将宽松编号正则拆成候选解析、同级序列判断和任务意图判断，避免题号与条件列表误报。
- [x] `tests/solution-stream.test.ts` -- 增加单题题号、外层题号、编号条件、显式多问、跳号和重复编号测试。
- [x] `functions/learning-api/dist/` -- 运行服务端构建，确保本地常驻服务加载相同规则。

**Acceptance Criteria:**
- Given 截图中的第 6 题完整讲解已经包含思路、推导、结论与易错提醒，when 执行内容验收，then 不再出现“没有逐项覆盖全部小问（第 6 问）”。
- Given 真正包含第 1、2 问的题目只回答第 1 问，when 执行内容验收，then 仍明确报告缺少第 2 问。
- Given 编号只是已知条件列表，when 执行内容验收，then 不要求把条件分别写成第 1、2 问。

## Spec Change Log

## Design Notes

小问识别优先保证“不要阻断已完成的单题”，同时保留对明确多问结构的严格验收。自然语言无法仅靠编号百分之百区分条件和任务，因此裸编号必须同时满足连续序列和任务意图；无法确定时不制造缺项。

## Verification

**Commands:**
- `npm test -- --run tests/solution-stream.test.ts` -- 31 个新旧小问场景全部通过。
- `npm run typecheck`、`npm run lint` -- 类型与规范通过。
- `npm run build:function` -- 云函数产物同步更新。
- `npm test` -- 27 个测试文件、486 个测试全部通过。

## Suggested Review Order

**小问结构验收**

- 从统一候选序列理解整题编号与真实小问如何分离。
  [`solution-quality.ts:79`](../../../lib/learning/solution-quality.ts#L79)

- 通过任务、条件、选项与回指标记收紧误判边界。
  [`solution-quality.ts:118`](../../../lib/learning/solution-quality.ts#L118)

**回归保护**

- 直接覆盖截图中的第 6 题误判与外层题号场景。
  [`solution-stream.test.ts:63`](../../../tests/solution-stream.test.ts#L63)

- 覆盖混排、回指、公式、选项与中文编号边界。
  [`solution-stream.test.ts:144`](../../../tests/solution-stream.test.ts#L144)
