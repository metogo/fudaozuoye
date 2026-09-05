---
title: '为当前原题生成分步演算插画'
type: 'feature'
created: '2026-09-05'
status: 'done'
baseline_commit: '8ebf4ea5b993a88683263d260e75974dc1ed1caf'
context:
  - '_bmad-output/implementation-artifacts/spec-semantic-visual-learning-board.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** “轮到你了”目前没有把当前原题的数量关系和演算过程呈现为连续插画的入口。

**Approach:** 新增“插画演示”。点击后，服务端以密封会话中的原题和已核验解答生成分镜，由模型按题目复杂度判断最合适的帧数，再调用豆包图片模型生成风格与对象一致的组图；客户端逐帧串联步骤。

## Boundaries & Constraints

**Always:** 仅点击时生成；题目、视觉事实和答案只取自服务端会话，不接受客户端题干或提示词；模型依据有效演算步骤自由决定 2–6 帧，不为凑数量拆分或重复；每帧包含序号、标题、可信演算文字、承接关系、图片和替代文本；公式与答案由校验后的 DOM 文本显示，图片只作具象表达；完整成功后沿用“看完整讲解”的答案记录与关键步骤回忆；失败或关闭保留原 Gate；密钥只留在服务端。

**Ask First:** 增加对象存储或跨设备保存；接入其他图片供应商；开放提示词或分镜编辑；自动生成插画。

**Never:** 把原题照片、图片内容或 URL 写进会话令牌；信任图片内的数学文字；生成无关装饰图；向浏览器发送密钥；失败时推进学习状态；重复点击静默计费。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| 首次生成 | 有效原题 Gate，图片模型可用 | 反馈进度并展示模型判定的 2–6 帧连续演示 | 完成后进入关键步骤回忆 |
| 重复查看 | 同一题已在本页生成 | 直接重开现有插画 | 仅“重新生成”才再次请求 |
| 配置缺失 | 无图片模型 ID | 入口显示不可用原因 | 主学习流程照常使用 |
| 上游异常 | 超时、审核、少图或坏 URL | 可展示已完成帧并提供重试 | 不记录已看答案、不改变 Gate |
| 旧请求 | Gate 更新、切题或取消 | 拒绝或丢弃旧结果 | 绑定 `requestId` 与题目指纹 |

</frozen-after-approval>

## Code Map

- `lib/learning/{types,flow}.ts`、`lib/learning/http/{turn,turn-request}.ts` -- 选择项、插画协议、Gate 校验和 SSE 状态迁移。
- `lib/learning/providers/{illustration,adapter,config,mock-adapter}.ts` -- 分镜校验、方舟组图调用与测试 fixture。
- `components/{education-chat-app,learning-chat,learning-illustration}.tsx` -- 按钮、独立生成状态和移动端逐帧视图。
- `.env.example`、`README.md`、`scripts/dev-local.sh` -- 图片模型配置与可用性说明。
- `tests/{learning-turn,provider-contract,rich-learning-text}.test.ts` -- 协议、失败和交互回归。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/{types,flow}.ts`、`lib/learning/http/turn-request.ts` -- 增加 `view_illustration` 和 lesson/frame 契约，仅向当前原题 Gate 提供入口。
- [x] `lib/learning/providers/{illustration,adapter,config,mock-adapter}.ts` -- 让模型按有效步骤决定并校验 2–6 帧分镜，调用 `/api/v3/images/generations` 组图；Mock 不访问真实服务。
- [x] `lib/learning/http/turn.ts`、云函数编译产物 -- 流式发送进度与帧；仅完整成功后进入既有 solution-review。
- [x] `components/education-chat-app.tsx`、`components/learning-chat.tsx`、新增 `learning-illustration.tsx` -- 增加入口、逐帧导航、取消/重试与本页结果复用。
- [x] 配置、文档和 `tests/` -- 新增 `DOUBAO_IMAGE_MODEL_ID`、可选 Base URL，并覆盖矩阵场景。

**Acceptance Criteria:**
- Given 学生处于当前原题的“轮到你了”，when 点击“插画演示”，then 模型按题目实际演算结构决定 2–6 张连续插画，逐帧显示承接关系和可信演算文字，且没有凑数帧。
- Given 生成未完整成功，when 超时、取消或切题，then Gate、答案记录和新题界面不受影响。
- Given 演示完整成功，when 学生关闭，then 按已看完整讲解处理并进入关键步骤回忆，不直接判定掌握。
- Given 本页已有该题插画，when 再次点击且未要求重新生成，then 不再调用模型。

## Spec Change Log

## Design Notes

方舟图片模型独立使用 `DOUBAO_IMAGE_MODEL_ID`，复用服务端 API Key。文本模型先按题目需要输出 2–6 帧受限分镜；图片 API 使用组图模式和临时 URL，并以分镜数量设置本次生成上限。统一对象、颜色和场景描述保证连续性，演算文字放在图片外。首版不持久化，刷新后可重新生成。

## Verification

**Commands:**
- `npm run typecheck`、`npm run lint` -- 类型和静态检查通过。
- `npm test` -- 插画 provider、学习流和 UI 测试通过且不访问真实模型。
- `npm run build:function`、`npm run build` -- 云函数与 Next.js 构建通过。

**Manual checks (if no CLI):**
- 手机宽度验证文字题/图片题的生成、前后导航、关闭、重开、失败、切题和网络请求不含密钥。

## Suggested Review Order

**服务端状态边界**

- 从点击入口理解生成、签名凭证与关闭确认的完整状态迁移。
  [`turn.ts:181`](../../lib/learning/http/turn.ts#L181)

- 用题目指纹和签名凭证防止旧结果或伪造结果推进 Gate。
  [`server-state.ts:68`](../../lib/learning/server-state.ts#L68)

**模型生成与审核**

- 先生成受限分镜，再生成组图并逐幅视觉审核。
  [`adapter.ts:543`](../../lib/learning/providers/adapter.ts#L543)

- 严格校验帧数、证据唯一性、画面提示和图片位置。
  [`illustration.ts:48`](../../lib/learning/providers/illustration.ts#L48)

**客户端交互**

- 复用同题结果，并在关闭完整演示时发送确认。
  [`education-chat-app.tsx:429`](../../components/education-chat-app.tsx#L429)

- 全屏逐帧导航、坏图恢复、焦点圈定和键盘关闭。
  [`learning-illustration.tsx:24`](../../components/learning-illustration.tsx#L24)

- 在“轮到你了”中呈现可用状态明确的插画入口。
  [`learning-chat.tsx:281`](../../components/learning-chat.tsx#L281)

**协议、配置与回归**

- 统一定义插画选择、帧结构、完成凭证和确认请求。
  [`types.ts:45`](../../lib/learning/types.ts#L45)

- 校验图片模型配置并拒绝不安全的服务地址。
  [`config.ts:67`](../../lib/learning/providers/config.ts#L67)

- 覆盖动态帧数、失败不推进、凭证、映射和真实适配器契约。
  [`illustration-demo.test.ts:12`](../../tests/illustration-demo.test.ts#L12)

- 为云函数部署显式透传图片模型环境变量。
  [`cloudbaserc.json:18`](../../cloudbaserc.json#L18)
