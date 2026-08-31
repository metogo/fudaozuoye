---
title: 'AI 主讲的题目引导闭环'
type: 'feature'
created: '2026-08-27'
status: 'done'
baseline_commit: 'cc0ca25cf34af996e2e09290bbb7639218e91651'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 产品先展示知识倒推图，却没有先讲清原题题意和解题入口；学生既要理解产品机制又要自己寻找下一步，容易失去学习方向。

**Approach:** 产品改为学生自主学习的“看懂题目 → 学会卡点 → 独立作答”。Guide 是默认主学习页，负责连续讲解、练习和验收；知识 DAG 是可独立打开的学习导航，负责解释卡点与基础关系。二者通过当前知识节点联动，但不再混排在一个长页面里。Chat 只回答当前原题或节点问题，并用 SSE 逐字呈现。

## Boundaries & Constraints

**Always:** 讲解和追问绑定服务端会话中的真实题干、学生作答、课标节点及证据；默认不泄露最终答案；模型文本使用 SSE；AI 负责讲，学生直接回答；保留 DAG 校验、原题复做和迁移验收；不持久化照片、问答或身份信息。

**Ask First:** 首页开放式 Chat、账号与长期记录、新外部服务、改变实际统一调用豆包的策略、删除知识倒推或迁移验收。

**Never:** 做无上下文问答；用模板冒充模型；要求家长先读懂拓扑；追问脱离当前题目；因一次对话自动标记掌握；失败时静默换模。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 首次进入 | 真实题目已分析 | 先显示题意、关键关系、解题入口；路径折叠 | 结构修复一次，仍失败则终止分析 |
| 原题追问 | 用户输入问题 | 回答仅基于原题和直接前置，SSE 逐字显示 | 拦截空/超长问题；超时保留输入供重试 |
| 节点追问 | 用户换讲法或提问 | 回答绑定节点证据，不改变掌握状态 | 非会话节点或损坏凭证返回错误 |
| 开始学习 | 点击“开始一步步做” | 平滑定位到当前待学节点 | 无待学节点则进入原题复做 |
| 查看知识关系 | 在 Guide 点击“打开知识路径” | 独立展示原题、卡点和更基础节点；当前节点保持高亮 | 关闭后回到原 Guide 进度 |

</frozen-after-approval>

## Code Map

- `lib/learning/types.ts`, `lib/learning/providers/{adapter,blueprint}.ts` -- 定义、生成并校验原题引导与流式追问。
- `lib/learning/http/tutor.ts`, `functions/learning-api/src/index.ts` -- 校验会话和节点范围，暴露追问 SSE。
- `components/learning-{app,workspace}.tsx`, `components/knowledge-tree.tsx` -- 管理追问状态并重排主讲、路径和节点交互。
- `tests/tutor-stream.test.ts` -- 覆盖题目级、节点级和非法输入。

## Tasks & Acceptance

**Execution:**
- [x] 模型与会话层 -- 生成可校验的真实题目引导，增加受上下文约束的流式导师接口。
- [x] 云函数 API -- 提供会话鉴权、限流和 SSE 追问端点并纳入构建。
- [x] 学习页 -- 实现原题先讲、路径折叠、平滑定位和就地追问。
- [x] 测试 -- 覆盖流式输出、上下文边界、错误处理及 DAG 回归。

**Acceptance Criteria:**
- Given 题目分析成功，when 进入学习页，then 首屏说明题意、关键关系和起点，无需理解知识图即可开始。
- Given 点击“一步步做”，when 存在待学节点，then 平滑定位并明确下一步是 AI 讲、孩子答。
- Given 在原题或节点提问，when 模型返回内容，then SSE 逐字显示，回答不越出上下文且不改变掌握状态。
- Given 展开知识路径，when 查看节点，then 能看懂它为何来自原题、为何更基础，并可返回主讲节点。
- Given 学生停留在 Guide，when 不打开知识路径，then 仍可独立完成讲解、检查、原题复做和迁移验收。
- Given 追问失败，when 回到输入区，then 原问题保留且可重试，不假成功或换模。

## Spec Change Log

- 2026-08-27：用户明确将目标用户从“家长主导辅导”调整为“学生自主学习”；Guide 升级为唯一默认学习主路径，知识倒推图改为可独立打开的学习导航。识别、确认和讲解准备合并为单页状态，减少中间跳转。
- 2026-08-27：首页改为立即拍题的单一入口；加入 100 条带明确出处、单轮不重复的学习引文和下拉换句；模型切换反馈收敛为选择区内的短状态提示。
- 2026-08-28：板书明确为 Chat 之外的“完整视觉讲解稿”，由模型重新组织任务、条件、核心关系、推理链、原因与易错自查；圈、线、框由模型返回精确目标和教学理由并经服务端校验。取消无朗读依据的自动播放和自动滚动，板书问答改为可收起的底部抽屉。

## Design Notes

Chat 是主流程内的澄清动作：原题与节点复用同一追问面板，但带入不同 scope。知识图默认只露出“打开知识路径”；主按钮使用“开始一步步做”，不出现“开始倒推”。参考公司现有 Guide 的连续文稿结构，将讲解组织为可顺序阅读的段落，并在关键段落旁提供“问这段”；移动端不依赖不稳定的文字选区悬浮工具条。

## Verification

**Commands:**
- `npm run typecheck` -- TypeScript 类型检查通过。
- `npm run lint` -- ESLint 无错误。
- `npm test` -- 8 个测试文件、66 项测试全部通过。
- `npm run build:function` -- 云函数路由与适配器可编译。
- `npm run build:cloudbase` -- 静态 H5 生产构建通过。
- 本地 `.env.local` 真实豆包状态为 live；真实图片识别收到 `phase → recognized → complete`，完整分析收到连续阶段与完成事件。

**Manual checks (if no CLI):**
- 手机宽度走通拍照/相册 → 确认 → 原题引导 → 节点追问 → 下钻 → 原题复做，并检查键盘、流式滚动和关闭重试。

## Suggested Review Order

**主体验**

- 从连续 Guide 正文理解“先讲题，再进入知识节点”的产品转向。
  [`learning-workspace.tsx:156`](../../components/learning-workspace.tsx#L156)

- 原题、节点共用同一就地追问面板，并保留流式与重试状态。
  [`learning-workspace.tsx:172`](../../components/learning-workspace.tsx#L172)

- 客户端为追问提供取消、超时和完整 SSE 终态校验。
  [`learning-app.tsx:208`](../../components/learning-app.tsx#L208)

**模型可信边界**

- Guide 必须落到题干证据，且不能提前泄露标准答案或完整步骤。
  [`blueprint.ts:27`](../../lib/learning/providers/blueprint.ts#L27)

- 真实模型追问只接收当前题目或当前知识节点的受限上下文。
  [`tutor.ts:1`](../../lib/learning/providers/tutor.ts#L1)

- 上游流必须同时包含正文和完成事件，残缺响应不再假成功。
  [`adapter.ts:372`](../../lib/learning/providers/adapter.ts#L372)

**服务边界与回归**

- 追问接口校验会话、节点、模型一致性、长度和同源边界。
  [`tutor.ts:7`](../../lib/learning/http/tutor.ts#L7)

- 云函数把浏览器断连传递给上游模型，及时停止生成。
  [`index.ts:29`](../../functions/learning-api/src/index.ts#L29)

- 契约测试覆盖真实供应商流、Guide 修复与不完整响应。
  [`provider-contract.test.ts:23`](../../tests/provider-contract.test.ts#L23)

- API 测试覆盖题目追问、节点追问、非法输入和旧模型会话。
  [`tutor-stream.test.ts:14`](../../tests/tutor-stream.test.ts#L14)
