---
title: 'Flow 内联「猜你想问」与引用式追问'
type: 'feature'
created: '2026-08-29'
status: 'done'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前 Chat 只允许学生主动输入追问，AI 无法在恰当节点提示那些“学生可能没意识到、但会妨碍继续理解”的问题；如果直接增加推荐问题，又容易与强制学习 Gate 争夺注意力、打断主线，并在历史消息中失去问题所指的上下文。

**Approach:** 在服务端 Flow 先判断当前时机是否适合，再由模型生成 0–3 个严格关联当前题目与讲解段落的问题。推荐以内联轻入口附着在对应 AI 消息下；学生点击后，以带引用的学生消息发起追问，AI 回答完成后回到原 Gate 和学习位置。

## Boundaries & Constraints

**Always:** 推荐必须锚定当前原题、知识点或刚完成的讲解消息；每组最多 3 个且不可重复当前 Gate 已提出的问题；同一时刻仅一组有效推荐；推荐只在一段 AI 讲解完整结束且当前没有流式输出、识别确认、答案判定或板书全屏占用时出现；点击推荐必须由服务端使用已密封的推荐 ID 还原问题与范围，不能信任客户端自报引用；学生消息必须清晰显示“引用：范围标签 + 被引用讲解摘要”，AI 回复继续显示相同范围；追问期间原 Gate 保留，回答后用既有回流里程碑返回原任务；刷新后引用消息、有效推荐和当前 Gate 均可恢复；推荐生成失败时静默不展示，不阻断学习。

**Ask First:** 修改“原题独立作答必须通过才能完成”的产品规则；让推荐问题自动推进 Flow 或替学生完成 Gate；增加新的模型、服务或第三方依赖；将推荐扩展为跨题、长期画像或商业推荐。

**Never:** 在 loading 中、学生作答中或强制互动卡之前弹窗打断；把“猜你想问”做成新的必答步骤；生成索要最终答案、完整解法、与当前题无关或已经回答过的问题；点击后清空、替换或绕过当前 Gate；只在前端拼接任意问题与引用；推荐尚未返回时延迟 `message.complete` 或让页面继续显示 busy。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 合适时机 | 一段核心讲解/补救讲解已结束，当前任务仍待处理 | 模型可返回 2–3 个相关问题；以内联轻量 chips 附着于该 AI 消息 | 模型判断“不适合”则不展示 |
| 点击推荐 | 有效推荐 ID，原 Gate 尚未回答 | 新增带引用的学生消息；流式回答该问题；回答后回到原 Gate | 推荐过期或 ID 不存在时提示“这组问题已更新”，不发送伪造问题 |
| 自由提问 | 学生自己输入问题 | 保持现有自由追问与回流行为，不强制附加推荐引用 | N/A |
| 强制任务中 | 正在识别、评分、生成板书或 SSE 正在输出 | 不生成、不展示新推荐 | 保留上一条历史引用，但取消其可点击状态 |
| 刷新恢复 | 消息含已点击引用，Flow 含未点击推荐 | 恢复引用外观、推荐可用性及原 Gate | 结构或签名不合法时丢弃推荐，不破坏会话 |
| 重复/泄露 | 模型返回重复问题、完整答案请求或无可靠锚点 | 校验后删除；剩余不足 1 条则整组不展示 | 不用模板问题兜底 |

</frozen-after-approval>

## Code Map

- `lib/learning/types.ts` -- 定义密封推荐、消息引用、Turn 输入和 SSE 数据契约。
- `lib/learning/flow.ts` -- 校验有效推荐与 Flow 状态，负责清除过期推荐。
- `lib/learning/providers/adapter.ts` -- 新增模型“是否适合 + 推荐问题”决策能力及统一输出校验。
- `lib/learning/providers/tutor.ts` -- 构造基于原题、当前焦点和刚完成讲解的推荐提示词与安全 Mock。
- `lib/learning/http/turn.ts` -- 在合适的讲解结束点异步产生推荐；按密封 ID 处理引用追问并保持 Gate。
- `components/education-chat-app.tsx` -- 消费 `flow.suggestions`，创建引用式学生消息并持久化。
- `components/learning-chat.tsx` -- 在来源 AI 消息下轻量展示推荐，并渲染可回看的引用关系。
- `tests/learning-turn.test.ts`、`tests/tutor-stream.test.ts` -- 覆盖时机、作用域、伪造/过期 ID、失败不阻塞和 Gate 回流。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/types.ts`、`lib/learning/flow.ts` -- 增加 `SuggestedQuestion`、`ChatMessageReference`、有效推荐状态与严格结构校验。
- [x] `lib/learning/providers/tutor.ts`、`lib/learning/providers/adapter.ts` -- 让模型决定是否推荐并生成有锚点、无答案泄露的 0–3 个问题。
- [x] `lib/learning/http/turn.ts` -- 增加 `flow.suggestions` 事件和 `choose_suggestion` Turn；保留并恢复原 Gate。
- [x] `components/education-chat-app.tsx`、`components/learning-chat.tsx` -- 将推荐附着到来源回复；点击后展示引用式学生消息与同范围 AI 回复。
- [x] `tests/learning-turn.test.ts`、`tests/tutor-stream.test.ts` 及前端测试 -- 覆盖矩阵中的正常、失败、恢复和安全边界。

**Acceptance Criteria:**
- Given 学生正在按主 Flow 学习，when AI 认为当前没有必要补充问题，then 页面不增加任何占位或提示。
- Given 推荐出现，when 学生忽略它并处理当前 Gate，then 主 Flow 正常推进，推荐自动失效且不抢占焦点。
- Given 学生点击某条推荐，when 查看随后对话，then 学生消息能看出引用了哪段讲解，AI 回答能看出针对哪个题目范围，回答后原 Gate 仍在。
- Given 客户端提交任意文本或旧推荐 ID，when 服务端处理，then 不得把它伪装成模型推荐或改变学习状态。
- Given 长对话或页面刷新，when 回看历史，then 已点击问题仍保留引用关系，未点击的有效推荐只在其来源消息下出现一次。

## Spec Change Log

- 2026-08-29：完成模型时机判断、密封推荐 ID、引用式消息、Gate 回流、刷新恢复与安全边界，并加入真实模型可达性验证。

## Design Notes

推荐视觉层级低于 Gate：使用“顺着这里，你可能还想问”小标题和短 chips，不使用弹窗、全宽卡片或自动滚动。点击后学生消息采用小型引用块（范围标签 + 来源摘要）置于问题正文上方；这是消息的一部分，而非临时 UI。

服务端采用“双层判断”：代码先判断 Flow 时机，模型再决定内容上是否值得推荐。推荐必须写入密封会话后才能点击；`choose_suggestion` 只接受 ID。该设计避免前端篡改题目范围，也确保自由追问与推荐追问在产品语义上可区分。

## Verification

**Commands:**
- `npm run typecheck` -- expected: TypeScript 零错误。
- `npm run lint` -- expected: ESLint 零 warning/error。
- `npm test` -- expected: 全量单元与契约测试通过。
- `npm run build` -- expected: Next.js 生产构建成功。
- `npm run build:function` -- expected: 云函数构建成功且类型契约一致。

**Manual checks (if no CLI):**
- 在手机宽度分别走核心讲解、连续不懂、自由提问、推荐追问、独立作答；确认推荐不抢 Gate、引用清晰、回流位置正确。
- 滚离底部后触发推荐和回答；确认不强制拉回，仅沿用“有新讲解”提示。
