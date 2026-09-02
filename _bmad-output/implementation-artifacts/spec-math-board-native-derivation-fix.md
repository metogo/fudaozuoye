---
title: '修复数学板书缺少原生推导内容'
type: 'bugfix'
created: '2026-09-02'
status: 'done'
baseline_commit: '1850bfc45c9fa4e6b7ea627771ce1ce73b78a4cc'
context:
  - '_bmad-output/implementation-artifacts/spec-subject-native-board-engine-phase-2.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 数学板书已有五段结构、KaTeX 和几何外观，但正文仍由通用话术拼接。截图中的关系、变换和复核只重复题干片段、单个已知量和选项，没有推进数学关系；图形也未参与推理，不满足第二阶段的内容质变要求。

**Approach:** 增加确定性的数学内容层：先提取对象、已知、目标和关系，再生成推导、检查与题型专属迁移骨架；正文、公式链和几何图共同消费这份结构。首先完整覆盖一般三角形三角函数题，并保留其他题型的安全边界。

## Boundaries & Constraints

**Always:** 五张卡片产生不同且可执行的数学动作；只使用题干条件和明确的中学数学关系；图形、公式与正文符号一致；保留答案隔离、KaTeX、即时打开、缓存恢复和其他学科行为。

**Ask First:** 引入 CAS、外部解题服务或新依赖；改变答案展示或学习 Gate。

**Never:** 写死截图数字、选项或答案；让模型自由生成数学事实；用元话术冒充推导；展示与推理无关的装饰图。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般三角形题 | 边角对应、三角式、边长、面积、待求边 | 条件模型、角边转换、关系推进与验证方法 | 条件不足时指出缺口，不补造关系 |
| 数学题型未命中 | 其他数学题 | 保留原题支持的最小关系板书 | 不生成伪推导或无关图 |
| 非数学题 | 其他八学科 | 沿用原学科引擎 | 不受数学层影响 |

</frozen-after-approval>

## Code Map

- `lib/learning/board-math-content.ts` -- 数学条件模型、推导链和复核骨架的唯一来源。
- `lib/learning/board-subject-engine.ts` -- 将数学题路由到原生内容层。
- `lib/learning/board-aids.ts` -- 用同一数学模型生成几何与公式辅助。
- `lib/learning/board-content-contract.ts` -- 拒绝空洞、重复或无关系的数学内容。
- `tests/subject-native-board.test.ts` -- 目标题、变体、安全与跨学科回归。

## Tasks & Acceptance

**Execution:**
- [x] 新建数学内容模型，覆盖一般三角形三角函数题的条件、关系、推导和复核。
- [x] 接入五段正文，移除数学通用 composer 的正文权威。
- [x] 让几何图和公式链消费相同模型，标出边角及已知关系。
- [x] 增加内容深度校验与跨题型回归。

**Acceptance Criteria:**
- Given 截图题，when 打开板书，then 五段依次呈现全部已知、三角函数到边关系、至少两步有依据的推进、可执行的验证方法和题型专属迁移顺序。
- Given 同一道题，when 查看辅助，then 三角形标出边角及已知量，公式链与正文关系一致，图形不只是三点轮廓。
- Given 只替换边长、面积或未知边的同型题，when 生成板书，then 内容随题干变化，不依赖固定数字和选项。
- Given 条件缺失或非数学题，when 生成板书，then 不虚构关系、不泄露答案，原有学科行为不回归。

## Design Notes

数学层输出 `givens / target / relations / derivations / checks / transfer`，卡片与语义图从同一结构渲染。一般三角形只在题干支持时使用正弦定理、余弦定理和面积关系，并停在最终答案之前。

已知边必须按题干实际出现的边收集，待求边允许是三边中的任一合法边；推导关系保持不变，验证步骤根据实际已知集合组织，不能把某条边固定成“唯一已知”或“唯一待求”。

## Spec Change Log

- 迭代 2：验收审查发现实现把关系式右侧对应边误当成唯一待求边，并只收集固定一条已知边。补充“按实际已知集合与任一待求边生成”的设计约束；避免同型题换未知边后退回通用板书。KEEP：保留已完成的五段数学推进、共享公式/图形模型、答案隔离和最终值前停步。

## Verification

- `npm run typecheck`、`npm run lint`、`npm test`
- `npm run build:function`、`npx next build --webpack`
- 390 × 844 视口使用截图原题检查：每张卡片增加新的数学信息，图形与推导能够支持学生继续动笔。

## Suggested Review Order

**数学内容模型**

- 从题干事实建立唯一共享的三角关系模型。
  [`board-math-content.ts:30`](../../lib/learning/board-math-content.ts#L30)

- 五段正文按条件、关系、推导、复核、迁移递进。
  [`board-math-content.ts:69`](../../lib/learning/board-math-content.ts#L69)

- 设问、选项和其他三角形不会污染已知条件。
  [`board-math-content.ts:201`](../../lib/learning/board-math-content.ts#L201)

- 标量只接受可验证的正数、根式与分式。
  [`board-math-content.ts:230`](../../lib/learning/board-math-content.ts#L230)

**公式与重点标记**

- 标记范围横跨公式时自动扩展到完整定界符。
  [`presentation.ts:38`](../../lib/learning/presentation.ts#L38)

- 确定性重点只从公式外纯文本提取。
  [`board.ts:600`](../../lib/learning/providers/board.ts#L600)

**图形参与推导**

- 图形、公式链与正文共同消费数学模型。
  [`board-math-content.ts:95`](../../lib/learning/board-math-content.ts#L95)

- JSXGraph 显式绘制三边标签、已知量与目标角。
  [`board-math-visual.tsx:50`](../../components/board-math-visual.tsx#L50)

- 几何协议新增普通角对象并纳入缓存校验。
  [`types.ts:145`](../../lib/learning/types.ts#L145)

**验收证据**

- 截图题验证五段内容、公式渲染与语义图一致。
  [`math-board-content.test.ts:12`](../../tests/math-board-content.test.ts#L12)

- 选项污染、对象串题与非法公式边界均有回归。
  [`math-board-content.test.ts:65`](../../tests/math-board-content.test.ts#L65)
