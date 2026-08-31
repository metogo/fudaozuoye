---
title: '完整讲解后的有效学习检查'
type: 'refactor'
created: '2026-08-29'
status: 'done'
baseline_commit: 'cc0ca25cf34af996e2e09290bbb7639218e91651'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 学生查看完整讲解和答案后，系统立即要求重做完全相同的原题，既没有解释重复目的，也主要测到短时记忆；讲解仍在上方可见时，“不看讲解”更是无法成立。

**Approach:** 完整讲解生成后保持完整可见，学生明确点击“我看完了，收起讲解”后，系统才收起答案，并使用原题引导中已经生成且不含最终答案的第一突破口做一次短检查。通过后由学生选择遮住讲解重做原题、换一道同知识点题或暂时结束；不同完成方式明确区分“看过、基本理解、独立掌握”。

## Boundaries & Constraints

**Always:** 完整讲解只生成一次且必须给学生真实阅读机会；只有学生主动确认看完后才能收起；关键步骤检查必须绑定当前原题且不再索要最终答案；检查期间收起完整讲解；重做原题时明确说明仍是同一道题；同类题必须经过现有知识点校验；看过讲解或只通过关键步骤不得标记为掌握；自由追问后仍回到当前检查。

**Ask First:** 改变首次讲解、连续不懂、板书或知识倒推流程；取消独立掌握的客观证据；引入新的模型、依赖或外部服务。

**Never:** 把原题完整答案再次作为检查题；让学生能够无限生成完整讲解；因点击“先结束”伪造已掌握；用同类题冒充原题或真题。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| 阅读完整讲解 | 首次点击查看完整讲解 | 完整讲解保持可见，并显示“我看完了，收起讲解” | 生成失败保留原学习位置，不显示半截答案 |
| 关键步骤检查 | 学生确认已看完完整讲解 | 讲解收起，显示一个不含最终答案的短问题 | 验收失败保留同一检查和学习位置 |
| 重做原题 | 关键步骤通过后选择重做 | 明确标注“同一道原题”，独立答对才记录原题掌握 | 答错只反馈错误方向，不重新开放完整讲解 |
| 同类验证 | 关键步骤通过后选择同类题 | 生成真实同知识点题，答对后记录通过同类题验证 | 生成失败保留选择，不撤销关键步骤结果 |
| 暂时结束 | 关键步骤通过后结束 | 显示已学习但尚未验证独立掌握 | 可恢复并继续重做原题或同类验证 |
| 旧会话恢复 | 缺少新增状态字段 | 自动迁移为未通过关键步骤 | 不破坏既有 Gate 和查看记录 |

</frozen-after-approval>

## Code Map

- `lib/learning/types.ts` -- 增加讲解后检查、选择与完成状态。
- `lib/learning/flow.ts` -- 构造关键步骤后的决策 Gate，并校验可恢复状态。
- `lib/learning/http/turn.ts` -- 编排完整讲解、关键步骤验收、原题/同类题/暂时结束三条路径。
- `components/learning-chat.tsx` -- 收起完整讲解，清楚表达同题复做和三种掌握层级。
- `components/education-chat-app.tsx` -- 接通新增作答类型和恢复动作。
- `tests/learning-turn.test.ts` -- 至少三条完整路径交叉验证。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/{types,flow,api}.ts` -- 建立可签名、可恢复的新状态与 Gate。
- [x] `lib/learning/http/turn.ts` -- 将立即重做改为短检查和学生自主选择。
- [x] `components/{learning-chat,education-chat-app}.tsx` -- 收起答案并呈现清楚的学习状态。
- [x] `tests/` -- 覆盖原题复做、同类验证、暂时结束与旧会话恢复。

**Acceptance Criteria:**
- Given 学生查看完整讲解，when SSE 完成，then 完整讲解保持可见并出现明确的“我看完了，收起讲解”操作。
- Given 完整讲解可见，when 学生确认已看完，then 系统收起讲解并首先出现关键步骤检查，不直接重复整道原题。
- Given 关键步骤通过，when 学生选择重做原题，then 页面明确这是同一道题且答对后标记独立掌握。
- Given 关键步骤通过，when 学生选择同类题并答对，then 本题以同知识点迁移证据完成。
- Given 学生选择暂时结束，when 查看总结，then 页面明确“已学习、尚未验证掌握”并可继续验证。
- Given 已查看完整讲解，when 任一路径继续，then 不再出现查看完整讲解入口。

## Design Notes

掌握层级固定为：查看完整讲解＝已学习；关键步骤通过＝基本理解；原题或同类题独立答对＝已掌握。页面不再用一个“完成”状态混淆三种证据。

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- 全量静态检查与状态机回归通过。
- `npm run build:function && npm run build:cloudbase` -- 云函数与手机 H5 构建通过。
- 三条真实用户路径交叉验证 -- 原题复做、同类验证、暂时结束后恢复均符合学习语义。

## Suggested Review Order

1. [`lib/learning/http/turn.ts`](../../lib/learning/http/turn.ts) -- 先看完整讲解展示、主动收起、关键步骤检查和三条后续路径的编排。
2. [`lib/learning/flow.ts`](../../lib/learning/flow.ts) -- 核对 `solution_review` Gate、动作白名单与恢复状态约束。
3. [`components/learning-chat.tsx`](../../components/learning-chat.tsx) -- 核对完整讲解保持显示、收起后的不可重开和互动卡呈现。
4. [`lib/learning/providers/adapter.ts`](../../lib/learning/providers/adapter.ts) -- 核对关键步骤过程评分与同知识点迁移题的独立审校。
5. [`tests/learning-turn.test.ts`](../../tests/learning-turn.test.ts) 与 [`tests/rich-learning-text.test.ts`](../../tests/rich-learning-text.test.ts) -- 核对状态机和真实 UI 文案回归。
