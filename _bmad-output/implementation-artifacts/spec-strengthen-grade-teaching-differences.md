---
title: 拉开小学初中高中教学差异
type: feature
created: 2026-09-02
status: done
baseline_commit: 7716343dae309cc9374436feaa2f51cb175c44e6
context:
  - _bmad-output/implementation-artifacts/spec-grade-adaptive-teaching.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 用户选择小学、初中或高中后，当前输出主要只有词汇和口气差异，信息组织、例子、提问方式与推导密度仍然接近；高中模式甚至会出现“小朋友折纸”等低龄类比，学生和家长难以感知选择的实际价值。学习页又只显示题目所属课程学段，导致“小学题按高中方式讲”时看起来像选择未生效。

**Approach:** 把三档从“文案风格”升级为可检查的教学结构契约：小学采用一个动作一个理由、短段落和当前题内的具体例子；初中采用术语加白话、条件—操作—理由；高中优先变量、关系式、论证与边界，能直接表达时不使用低龄类比。继续复用现有生成与一次重写链路，并在学习页同时展示题目学段和讲解方式。

## Boundaries & Constraints

**Always:** 三档结论、题干证据和知识要求一致；差异必须同时体现在信息密度、步骤粒度、例子类型、提问方式和公式使用；小学内容尊重学生且不幼儿化，高中内容不以晦涩术语冒充专业；诊断、Chat、完整讲解、练习、推荐问题、反馈和板书共用中央契约；保持 SSE 首字延迟、答案保护与现有课程归一逻辑不变。

**Ask First:** 新增年龄/年级细分、改变模型或外部服务、改变课程学段支持范围、为学段分别设计新的页面流程。

**Never:** 只做同义词替换；用题目难度覆盖用户选择；为高中强行堆公式；为小学删除决定结论的步骤；用“小朋友、糖果、折纸、卖萌”等低龄类比生成高中讲解；修改或覆盖本轮之前尚未提交的学段功能改动。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 同题三档 | 同一道小学工程题分别选择小学、初中、高中 | 小学逐步算“每天一共做多少”；初中建立工作量关系并解释；高中直接定义工作率或变量、写关系并追问依据 | 结构化内容不符合所选契约时沿用现有一次重写 |
| 高中低龄类比 | 高中输出包含“小朋友折纸/拼图”等无必要类比 | 判为不合格，不展示该结构化结果 | 一次重写仍不合格则按现有错误流程明确失败 |
| 小学高密表达 | 小学输出堆叠抽象教学词、长句或连续多个任务 | 判为不合格 | 同上；不得静默吞掉或原样放行 |
| 跨学段题目 | 题目课程为小学，讲解方式选择高中 | 内容按高中方式生成，课程范围仍保持小学 | 页面显示“小学题 · 按高中方式讲” |
| 相同学段 | 题目课程与讲解方式都为初中 | 不制造重复或歧义 | 页面显示“初中题 · 按初中方式讲” |

</frozen-after-approval>

## Code Map

- `lib/learning/grade-pedagogy.ts` -- 三档教学结构契约、分场景要求和可机检语言问题的唯一事实源。
- `lib/learning/providers/model-support.ts` -- 诊断与完整讲解提示入口，承接结构契约。
- `lib/learning/providers/tutor.ts` -- SSE Chat 与推荐问题入口，保持流式同时拉开提问和例子差异。
- `lib/learning/providers/adapter.ts`、`lib/learning/providers/solution.ts` -- 结构化生成及完整讲解的现有质量门禁与重写链路。
- `components/learning-chat.tsx` -- 同时呈现题目课程学段与用户选择的讲解方式。
- `tests/grade-pedagogy.test.ts`、`tests/rich-learning-text.test.ts` -- 三档契约、反例门禁及界面语义回归。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/grade-pedagogy.ts` -- 将通用口气要求重构为三档结构契约与分场景规则，并增加小学高密表达、高中低龄类比检查。
- [x] `lib/learning/providers/model-support.ts`、`lib/learning/providers/tutor.ts` -- 让诊断、完整讲解、Chat 和推荐问题明确采用各档组织方式，不改变 SSE 协议。
- [x] `components/learning-chat.tsx` -- 把单一“课程内容”改为题目学段与讲解方式的无歧义组合。
- [x] `tests/grade-pedagogy.test.ts`、`tests/rich-learning-text.test.ts` -- 增加同题三档、已知反例、跨学段显示与既有功能回归。

**Acceptance Criteria:**
- Given 同一道工程题，when 分别选择小学、初中、高中，then 三档提示必须在步骤粒度、例子策略、数学表示和追问目标上具有断言可验证的不同，而不只是替换词汇。
- Given 高中模式生成无必要的低龄类比，when 进入已有结构化质量门禁，then 触发一次重写且该内容不能直接展示。
- Given 小学模式生成抽象词堆叠、长句或一次推进多个任务，when 验收，then 返回明确的学段表达问题。
- Given 题目学段和讲解方式不同，when 进入学习页，then 用户一眼能同时看到两者，且后续请求仍使用所选讲解方式。
- Given 既有九学科、完整讲解、SSE、板书和答案保护测试，when 执行全量验证，then 无回归。

## Spec Change Log

## Design Notes

“更简单/更专业”不能只落在形容词上。契约的最小差异单元是：小学每轮只推动一个可执行动作；初中把术语、白话解释和理由配对；高中用符号或学科关系压缩重复叙述，并把问题指向论证依据、适用条件或边界。高中禁止的是无必要的低龄类比，不是禁止所有类比；当前题本身涉及儿童或生活情境时仍应忠实保留题干事实。

## Verification

**Commands:**
- `npm test` -- 全量测试通过，包含同题三档和已知反例。
- `npm run typecheck` -- TypeScript 无错误。
- `npm run lint` -- lint 无错误。
- `npm run build:function` -- 服务端产物与源码同步。
- `npx next build --webpack` -- 生产构建通过。
- `git diff --check` -- 无空白错误。

**Manual checks:**
- 使用同一道工程题分别选择小学、初中、高中，核对首屏引导、猜你想问和完整讲解的组织方式确实不同；小学题选择高中时，页头明确显示“小学题 · 按高中方式讲”。

## Suggested Review Order

**教学结构契约**

- 三档从语气差异升级为各教学场景的组织规则。
  [`grade-pedagogy.ts:23`](../../lib/learning/grade-pedagogy.ts#L23)

- 质量门禁兼顾连环任务、必要术语和低龄类比。
  [`grade-pedagogy.ts:85`](../../lib/learning/grade-pedagogy.ts#L85)

- 小学断句避开公式，防止可读性处理破坏知识内容。
  [`grade-pedagogy.ts:222`](../../lib/learning/grade-pedagogy.ts#L222)

**界面与选择**

- 学习页同时交代题目学段和实际讲解方式。
  [`learning-chat.tsx:173`](../../components/learning-chat.tsx#L173)

- 首页学段区压缩到 78px，仍保留 44px 点击热区。
  [`grade-band-picker.tsx:4`](../../components/grade-band-picker.tsx#L4)

- 与推理强度仅留轻微间距，不制造新分区。
  [`learning-chat.tsx:197`](../../components/learning-chat.tsx#L197)

**生成与容错**

- 完整讲解保持 SSE，并在不合格时执行唯一一次重写。
  [`solution.ts:15`](../../lib/learning/providers/solution.ts#L15)

- 单个不合格推荐问题不再拖垮整组结果。
  [`tutor.ts:95`](../../lib/learning/providers/tutor.ts#L95)

**回归证据**

- 同题三档、已知反例、公式保护与九学科板书集中验证。
  [`grade-pedagogy.test.ts:25`](../../tests/grade-pedagogy.test.ts#L25)

- 首页紧凑结构和跨学段标签具有渲染断言。
  [`rich-learning-text.test.ts:44`](../../tests/rich-learning-text.test.ts#L44)
