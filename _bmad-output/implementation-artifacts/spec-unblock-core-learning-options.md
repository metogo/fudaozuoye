---
title: '首讲结束立即开放学习选项'
type: 'bugfix'
created: '2026-08-31'
status: 'done'
baseline_commit: 'cc0ca25cf34af996e2e09290bbb7639218e91651'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 首讲正文已经输出完成时，页面仍等待后台标准答案准备，导致“懂了，继续 / 我来试试 / 这一步没懂 / 用板书讲清楚”等互动入口不出现，输入区也保持禁用。

**Approach:** 将“首讲可交互”和“标准答案准备”拆成两个独立阶段。正文完成后立即发送带唯一 Gate 的学习状态并解除前端忙碌；标准答案继续后台准备，使用旧的临时状态点击验题相关操作时由服务端安全补齐答案。

## Boundaries & Constraints

**Always:** Gate 必须先于后台标准答案完成而可见；临时状态不得拿“等待后台核验”参与答案判断；完成准备后的状态必须保留相同 Gate、学习进度和已显示首讲；SSE、图片、板书、完整讲解与猜你想问现有逻辑不得丢失。

**Ask First:** 若需要更改学习选项数量、文案或引入新的外部服务，先由用户确认。

**Never:** 不用前端假按钮掩盖服务端状态；不吞掉验题错误；不允许临时占位答案被判为正确或错误；不重新串行等待“猜你想问”。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 后台答案较慢 | 首讲正文已完成，标准答案 Promise 未完成 | 立即发出 `flow.update`、`flow.ready` 和全部互动选项 | 标准答案继续后台准备 |
| 用户立即点击 | 客户端持有临时状态 token | 服务端先补齐标准答案，再执行所选动作 | 补齐失败时保留 Gate 并允许重试 |
| 后台答案失败 | 首讲已经可读 | 当前 Gate 和输入能力不消失 | 到真正需要答案时再明确报错 |
| 正常快速返回 | 标准答案先于首讲完成 | 选项仍在首讲结束后立即出现 | 不重复 Gate、不重置进度 |

</frozen-after-approval>

## Code Map

- `lib/learning/http/turn.ts` -- 首讲、Gate、标准答案准备和后续学习回合的服务端事件编排。
- `tests/learning-turn.test.ts` -- SSE 事件顺序、临时状态点击和学习流不变量测试。
- `components/education-chat-app.tsx` -- 接收 `flow.update` / `flow.ready` 并解除忙碌状态；原则上无需新增前端补丁。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/http/turn.ts` -- 首讲流结束后先构造并发出可交互状态，再合并后台准备完成的根题答案。
- [x] `lib/learning/http/turn.ts` -- 对临时状态下需要标准答案的后续动作增加服务端补齐，保留 Gate 与学习上下文。
- [x] `tests/learning-turn.test.ts` -- 覆盖标准答案未完成时选项已经出现、临时 token 点击安全补齐、失败不撤销 Gate。

**Acceptance Criteria:**
- Given 首讲文字已经完成但标准答案仍在准备，when 客户端接收 SSE，then 五个现有动作立即可见且输入区解除禁用。
- Given 用户持有临时状态并立即点击验题相关动作，when 服务端处理新回合，then 不使用占位答案且不会发生 Gate 过期或学习状态丢失。
- Given 后台标准答案准备失败，when 首讲结束，then 已显示内容和互动 Gate 仍可用。

## Spec Change Log

## Design Notes

首讲 Gate 是用户交互状态，不应依赖内部标准答案任务。后台结果只能补强状态，不能成为首屏互动的阻塞条件。合并时只替换根题核验内容，保留客户端已经拿到的 flow、Gate ID、首讲文本和后续诊断节点。

## Suggested Review Order

**首讲解阻塞**

- 首讲结束立即开放 Gate，推荐问题与标准答案各自独立完成。
  [`turn.ts:101`](../../lib/learning/http/turn.ts#L101)

- 仅在操作真正需要核验答案时补齐，板书和追问不等待。
  [`turn.ts:649`](../../lib/learning/http/turn.ts#L649)

- 后台结果只补答案字段，避免覆盖当前 Gate 和学习进度。
  [`turn.ts:661`](../../lib/learning/http/turn.ts#L661)

**并发与失败保护**

- 覆盖慢答案、旧请求取消、临时状态点击与失败后板书。
  [`learning-turn.test.ts:37`](../../tests/learning-turn.test.ts#L37)

**本地服务常驻**

- 连续健康失败自动拉起 API，停止过程有界且可强制回收。
  [`dev-local.sh:31`](../../scripts/dev-local.sh#L31)

## Verification

**Commands:**
- `npm test -- tests/learning-turn.test.ts` -- 事件顺序与竞态回归全部通过。
- `npm run typecheck` -- 无类型错误。
- `npm run lint -- --quiet` -- 无静态检查错误。
- `npm run build:function` -- API 构建成功。

**Manual checks:**
- 在真实页面提交一道标准答案准备较慢的题，正文结束时立即看到互动选项，输入区不再持续禁用。
