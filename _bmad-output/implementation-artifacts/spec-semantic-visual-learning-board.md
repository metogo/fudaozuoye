---
title: '把 Chat 学习脉络转成语义化可视板书'
type: 'feature'
created: '2026-09-01'
status: 'done'
baseline_commit: '2b081e82161b94db03b7c063b325f97816205dc6'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前板书只把模型返回的文字分块，并用 Rough.js 绘制点、线、圆等基础图元；它既没有利用学生刚才的 Chat 学习脉络，也不能依据学科内容生成自动布局的关系图、可交互几何图或有教学顺序的动画，因此看起来像长卡片而不是帮助理解的板书。

**Approach:** 引入可校验的 `BoardPlan` 教学语义层，把原题、当前环节和最近相关 Chat 消息转换成带来源的学习目标与分步场景；由渲染路由按场景选择 KaTeX、Mermaid 或 JSXGraph，使用 Motion 做可跳过、可重放的分步揭示，Rough.js 仅保留为圈选、下划线和连线的强调层。

## Boundaries & Constraints

**Always:** 保留板书入口、缓存重开、问答、返回主线、答案防泄露和事实审校；模型只输出受限语义数据，不输出代码、HTML、Mermaid DSL 或像素坐标；Chat 引用限制数量、长度和角色并按不可信内容处理；引擎按需加载；动画可跳过并尊重 `prefers-reduced-motion`；旧缓存可打开。

**Ask First:** 增加已确认组合之外的依赖或外部服务；扩大到化学、统计、生物/地理图库；改变模型策略、学习 Gate 或掌握判定。

**Never:** 让模型生成可执行代码、图形 DSL 或任意布局坐标；用自由插图表达严格事实；静默展示错误图；破坏无图题和现有流程。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 关系/证明题 | 有条件和推理关系 | Mermaid 自动布局并分步揭示 | 失败降级为结构化文本 |
| 几何/函数题 | 有可验证对象或多项式 | JSXGraph 自适应绘图，KaTeX 显示公式 | 非法引用或系数降级 |
| 普通文字题 | 专项图不能降低成本 | 至少显示完整学习脉络关系图与清晰正文 | 不加载数学图形引擎 |
| 旧缓存/断流 | 旧协议或计划不完整 | 可重开；保留任务并重试 | 不写坏缓存、不推进状态 |
| 恶意/超长 Chat | 指令、脚本或超限文本 | 截断、转义、仅作引用 | 服务端拒绝非法结构 |

</frozen-after-approval>

## Code Map

- `lib/learning/types.ts`、`lib/learning/board-context.ts` -- 语义计划与受限 Chat 来源契约。
- `lib/learning/providers/board*.ts` -- 拆分生成、解析、审校与安全回退。
- `lib/learning/http/{turn,board-cache}.ts`、`lib/learning/board-cache.ts`、`components/education-chat-app.tsx` -- 请求板书时携带相关 Chat 引用；刷新恢复时回服务端用受保护答案复检缓存。
- `components/board-*.tsx`、`components/learning-board.tsx` -- 动态渲染路由、场景控制与降级。
- `tests/board*.test.ts` -- 覆盖来源、非法输入、降级和旧缓存。

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- 安装确认的三项依赖并动态加载。
- [x] `lib/learning/{types,board-context}.ts`、`providers/board*.ts` -- 建立并校验 `BoardPlan`。
- [x] `components/board-*.tsx`、`learning-board.tsx` -- 实现渲染路由、场景控制和降级。
- [x] `tests/board*.test.ts` -- 覆盖输入矩阵和旧缓存。
- [x] 默认展开完整学习脉络；“按环节聚焦”降为可选学习方式，不再用“下一步”遮住主要内容。
- [x] 模型计划失败或旧缓存重开时，按已校验内容补充关系图；真实直角条件同时补充可交互几何与公式脉络。

**Acceptance Criteria:**
- Given 已完成题目讲解和追问，when 打开板书，then 显示学习目标、对话来源及匹配的可视场景，而不是复制聊天。
- Given 板书包含多个环节，when 首次打开或重开旧缓存，then 默认看到整条脉络和辅助理解数量，不需要点击“下一步”才能发现配图。
- Given 内容适合关系图或数学图，when 展示，then 只加载对应引擎且手机端可阅读、交互和回看。
- Given 不适合配图或引擎失败，when 展示，then 完整文本板书、问答、缓存和学习流程仍可用。
- Given 输入越过结构、来源或答案边界，when 校验，then 拒绝或安全降级。

## Spec Change Log

- 2026-09-01：根据真实体验复核，将“逐步解锁”调整为“完整脉络默认展开、按环节聚焦可选”；安全降级从纯文字升级为本地可验证的语义辅助图，避免已接入的可视化能力在失败路径中空转。
- 2026-09-01：缓存恢复改为服务端复检；明确直角题按安全性组合学习脉络、条件汇聚、交互几何和公式脉络，答案型关系题自动移除会泄露结论的公式图。

## Design Notes

首期视觉类型限定为 `formula_chain`、`concept_graph`、`geometry_model`、`function_plot` 和 `none`。概念图由模型返回节点/边后在客户端生成 Mermaid DSL；数学图只允许命名点、对象引用和多项式系数，不执行模型字符串。每个场景保留 `sourceMessageIds`，点击来源提示可看清它来自刚才哪段学习，但不把整段 Chat 复制进板书。模型计划缺失时，本地只从已校验板书、明确直角和题干公式补充辅助图，不猜测未知事实。

## Verification

**Commands:**
- `npm run typecheck` -- 新旧板书类型及动态组件类型通过。
- `npm run lint` -- 无新增 lint 问题。
- `npm test` -- 20 个测试文件、267 项板书、学习流、缓存与安全测试全部通过。
- `npm run build:function` -- 云函数板书协议同步编译。
- `npm run build:cloudbase` -- 当前宿主环境被禁止执行 Turbopack 内部端口绑定；代码侧类型、lint、测试与云函数构建均已通过，生产构建仍需修复基线 PostCSS/构建环境后复验。

**Manual checks (if no CLI):**
- 手机宽度分别用关系题、几何题、函数题和纯文字题打开板书；检查分步播放、暂停、重放、滚动、板书问答、关闭重开、刷新恢复以及 reduced-motion。

## Suggested Review Order

**语义与安全边界**

- 从受限计划解析理解整个板书架构与信任边界。
  [`board-plan.ts:45`](../../lib/learning/providers/board-plan.ts#L45)

- 只保留相关对话来源，限制角色、长度与总量。
  [`board-context.ts:8`](../../lib/learning/board-context.ts#L8)

- 拦截答案泄露、虚构几何与无依据函数图。
  [`board-plan.ts:324`](../../lib/learning/providers/board-plan.ts#L324)

- 修复模型 JSON 中常见 LaTeX 反斜杠歧义。
  [`model-support.ts:195`](../../lib/learning/providers/model-support.ts#L195)

**生成与降级**

- 单次生成语义正文，独立审校，失败回到安全板书。
  [`adapter.ts:510`](../../lib/learning/providers/adapter.ts#L510)

- 超时真正终止底层调用，避免后台请求堆积。
  [`adapter.ts:81`](../../lib/learning/providers/adapter.ts#L81)

**呈现与交互**

- 分步展示、来源脉络、回放与板书问答在同一主线。
  [`learning-board.tsx:29`](../../components/learning-board.tsx#L29)

- 按语义类型惰性路由 Mermaid、KaTeX 与 JSXGraph。
  [`board-scene-visual.tsx:10`](../../components/board-scene-visual.tsx#L10)

- 几何和函数由受限数据计算绘制，保留移动端滚动。
  [`board-math-visual.tsx:9`](../../components/board-math-visual.tsx#L9)

- 主动关闭、缓存重开与旧数据校验不会破坏学习状态。
  [`education-chat-app.tsx:418`](../../components/education-chat-app.tsx#L418)

**验证**

- 攻击模型结构、答案、图形与降级路径。
  [`board-lesson.test.ts:9`](../../tests/board-lesson.test.ts#L9)

- 验证缓存中的场景与正文严格对齐。
  [`stored-board.test.ts:19`](../../tests/stored-board.test.ts#L19)
