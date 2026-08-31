---
title: '教育专属 Chat 学习闭环'
type: 'refactor'
created: '2026-08-28'
status: 'done'
baseline_commit: 'cc0ca25cf34af996e2e09290bbb7639218e91651'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前 Guide、追问弹层、知识路径和独立作答分散在不同页面，学生需要先理解产品结构，才能开始学习；AI 介入后也容易失去原题主线。

**Approach:** 改为学生自主使用的单一全屏 Chat。AI 收到文字或图片题目后先讲核心思路，再用明确但不过度阻塞的互动节点控制学习节奏；自由追问、换讲法和知识倒推都在消息流内完成，并始终回到当前学习任务。纯文字不足以呈现图形或多重关系时，由同一模型建议进入全屏专注板书；板书内追问作为局部批注，退出后恢复同一个学习节点。

## Boundaries & Constraints

**Always:** 讲解服务于理解和独立解决问题；AI 正文全部使用真实 SSE 流式输出；同一时间只有一个有效学习互动；自由提问不丢失未完成任务；“不会/不理解”触发换讲法、具体例子或直接前置；完整讲解始终可看但不等于掌握；原题独立作答通过后才完成；迁移题可选；板书只是同一 Flow 的专注呈现层，不形成第二套课程或页面路径；会话只保存在 `sessionStorage`；Loading 只弱提示，并仅展示有明确出处、直接激励学习的词条。

**Ask First:** 改变统一调用豆包的生产策略；引入账号、长期画像、数据库或新的外部服务；删除课程目录、DAG 校验或真实模型输出校验。

**Never:** 将旧 Guide/问一问/知识图改成聊天皮肤后继续保留页面跳转；用模板冒充真实模型正文；用无出处或与学习无关的鸡汤填充等待；因查看答案、自由提问或一次主观选择自动标记掌握；伪造真题、高频题或考试来源标签。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 文字发题 | 输入一道数理化题 | 用户消息立即进入聊天，系统识别学科/学段并流式讲核心思路 | 非数理化或信息不足时在聊天内要求补充 |
| 图片发题 | 拍照或相册并裁切 | 图片消息、弱识别进度和讲解连续出现在同页 | 低置信度才要求修订；失败保留重试入口 |
| 核心理解 | AI 完成一段讲解 | 显示继续、尝试、不懂、完整讲解四个动作 | 未选择前不推进，但仍可自由追问 |
| 连续不懂 | 同一节点多次反馈不懂 | 先换讲法，再举例，再向下拆直接前置并显示内联路径 | 原子点仍失败时明确需要额外帮助，不伪造掌握 |
| 自由追问 | 当前互动未完成时提问 | 回答标明引用范围，完成后恢复原互动 | 超时保留问题与互动状态 |
| 板书建议 | 图形、公式推导或多个关系难以用短文字讲清 | 模型给出具体理由，学生可进入全屏结构化板书；板书追问只显示为局部批注 | 判断失败不阻断主 Chat；退出板书恢复原互动 |
| 独立作答 | 提交原题答案 | 正确则完成；错误只修复对应步骤 | 查看过完整讲解仍必须作答 |
| 迁移练习 | 本题完成后主动选择 | 生成同知识点新题并标记“AI 生成” | 无可信来源时不展示真题/高频标签 |

</frozen-after-approval>

## Code Map

- `components/education-chat-app.tsx` -- 统一聊天会话、图片/文字入口、恢复和 SSE 消费。
- `components/learning-chat.tsx` -- 消息流、互动卡、内联路径、输入区和滚动行为。
- `components/learning-board.tsx` -- 全屏结构化板书、局部追问和返回主线。
- `lib/learning/http/turn.ts` -- 单一学习回合入口，调度讲解、追问、补基础和验收。
- `lib/learning/providers/model-support.ts` -- 模型协议、结构函数与教学提示词边界。
- `lib/learning/types.ts` -- Chat 消息、Flow、Gate、Turn 联合类型。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/types.ts` 与模型适配层 -- 建立可签名恢复的学习 Flow 和统一回合输入。
- [x] `lib/learning/http/turn.ts` 与云函数路由 -- 用 SSE 编排讲解、强制互动、追问回归、补基础、原题及可选迁移。
- [x] `components/education-chat-app.tsx` 与 `components/learning-chat.tsx` -- 替换多页面学习体验为单页 Chat，接通拍照、相册和文字。
- [x] `lib/learning/quotes.ts` 与样式 -- 限定学习励志词条并实现弱 Loading、长对话滚动及移动键盘适配。
- [x] `tests/learning-turn.test.ts` 与交互回归 -- 覆盖分支、SSE 终态、恢复和不可绕过的互动。
- [x] `components/learning-board.tsx` 与模型呈现判断 -- 仅在有教学必要时建议板书，板书问答不污染主聊天并可恢复原互动。

**Acceptance Criteria:**
- Given 学生进入首页，when 发送文字、拍照或相册题目，then 无需切换页面即可看到识别和逐字核心讲解。
- Given 当前存在未完成互动，when 学生自由提问，then AI 回答后仍返回同一互动且学习阶段不被绕过。
- Given 学生连续反馈不懂，when AI 采取补救，then 讲法逐级变化并在需要时显示真实直接前置关系。
- Given 学生查看完整讲解，when 未独立答对原题，then 系统不显示为已完成。
- Given 原题答对，when 学生不选择迁移题，then 本题仍可正常完成。
- Given 当前内容包含图形或多重关系，when 模型判断文字不足，then 当前互动出现板书建议；学生在板书内追问并退出后仍回到同一个学习互动。

## Design Notes

Chat 是唯一表面，学习状态机是产品。阶段只用消息里程碑表达，不设置顶部步骤条；当前互动贴近底部输入区，AI 可以随时介入，但每次介入都必须说明正在回应哪个步骤，并在结束后恢复主线。

## Spec Change Log

- 2026-08-28：根据用户提供的竞品演示补充“AI 教学呈现决策 + 全屏专注板书”。保留 Chat 为唯一主线；避免已知坏状态：另建板书课程页、板书追问污染主聊天、退出后找不到原学习节点。KEEP：强制互动、自由追问回归、真实知识倒推和独立作答标准均保持不变。
- 2026-08-28：选择题检查将真实选项随互动卡下发并直接渲染为可点击按钮；旧会话从题目检查项恢复选项。服务端只接受当前实际展示的选项，并拒绝伪造选项或迁移题绕过。
- 2026-08-28：首页收敛为问题输入与学习寄语，模型选择并入输入框并改为不暴露供应商的“轻度 / 中 / 高”推理强度。三档分别绑定独立豆包模型 ID，未配置档位不可选，开始分析后随会话锁定且不得静默降档。
- 2026-08-28：板书从 3 个摘要卡扩展为 5 层教学展开，并为每层生成逐字存在于正文的圈画目标。前端使用 React 状态与 CSS 标注层依次呈现圈、划线和重点框，支持重播及减少动态效果；朗读稿和语音同步暂不伪实现。

## Verification

**Commands:**
- `npm run typecheck` -- 类型通过。
- `npm run lint` -- 无 ESLint 错误。
- `npm test` -- 86 个 Flow、SSE、选择题交互、会话安全、三档推理模型契约和知识图回归全部通过。
- `npm run build:function` -- 云函数编译通过。
- `npm run build:cloudbase` -- 静态 H5 生产构建通过。
- 本地真实豆包烟测 -- 复杂几何题输出 121 段 SSE；模型建议关系型板书，互动卡包含板书入口，实际 provider 保持豆包。
- 本地高推理强度烟测 -- 文字识别返回 `recognized` 与 `complete` SSE 事件，且实际模型 ID 与 `DOUBAO_MODEL_ID_HIGH` 一致。

**Manual checks (if no CLI):**
- 手机宽度依次走文字、拍照、相册、追问、不懂两次、独立作答、可选迁移和刷新恢复；检查键盘、滚动、流式光标及返回首页。

## Suggested Review Order

**统一学习主线**

- 从单一会话控制器理解识别、回合、恢复与板书如何串联。
  [`education-chat-app.tsx:21`](../../components/education-chat-app.tsx#L21)

- 状态机在一个 SSE 回合中约束讲解、追问、补救与验收。
  [`turn.ts:13`](../../lib/learning/http/turn.ts#L13)

- 全屏 Chat 只呈现当前任务，不再暴露旧页面结构。
  [`learning-chat.tsx:31`](../../components/learning-chat.tsx#L31)

**AI 教学呈现决策**

- 模型按当前学习焦点决定是否需要板书，而非固定展示。
  [`adapter.ts:386`](../../lib/learning/providers/adapter.ts#L386)

- 豆包使用受约束结构函数，避免复杂题静默丢失板书建议。
  [`model-support.ts:56`](../../lib/learning/providers/model-support.ts#L56)

- 板书内追问局部显示，退出后返回同一个强制互动。
  [`learning-board.tsx:20`](../../components/learning-board.tsx#L20)

**可靠性与回归**

- Flow、Gate、板书与消息表面类型共同保证可恢复状态。
  [`types.ts:24`](../../lib/learning/types.ts#L24)

- 端到端状态测试覆盖不可绕过互动、补基础和独立作答。
  [`learning-turn.test.ts:7`](../../tests/learning-turn.test.ts#L7)

- 供应商契约锁定板书结构函数，防止再次退化为自由 JSON。
  [`provider-contract.test.ts:365`](../../tests/provider-contract.test.ts#L365)

- Loading 仅从有出处、与学习直接相关的白名单取词。
  [`quotes.ts:10`](../../lib/learning/quotes.ts#L10)
