---
title: '让板书内容成为独立可学的一页课'
type: 'feature'
created: '2026-09-01'
status: 'done'
baseline_commit: '73eff1b4b873b2b5042861dd6a06f39b33425791'
context:
  - '_bmad-output/implementation-artifacts/spec-semantic-visual-learning-board.md'
  - '_bmad-output/implementation-artifacts/spec-board-workbench-phase-1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前板书仍复用 Chat 的段落正文，再通过节点、模式、笔记和手写重新包装；学生得到的知识增量很低，却要先理解新的操作结构，板书没有形成独立学习价值。

**Approach:** 把生成协议改成板书专属的一页课：重新完成题意压缩、关系建模、关键推导、成立原因、易错辨析、迁移和总结；辅助内容必须声明学习目的与事实依据，界面默认完整呈现内容。

## Boundaries & Constraints

**Always:** 保留答案防泄露、事实审校、学习 Gate、问答、缓存重开、返回主线、KaTeX 和安全图形；板书必须脱离 Chat 独立理解，原题和 Chat 只作证据；辅助内容说明用途；数理、语言和人文学科采用不同组织策略；旧缓存可读。

**Ask First:** 新依赖或外部服务；改变答案保护、学习 Gate 或掌握判定；跨设备学生状态；需要权威数据源的专用图库。

**Never:** 用更多按钮冒充内容升级；强制配图；让模型输出代码、坐标或图形 DSL；重复 Chat 长段落；用装饰或无依据内容填充；吞掉生成问题。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 数学或理化题 | 有公式、空间或过程关系 | 展示题意模型、关系、推导及匹配图形 | 无可靠依据时只显示结构化内容 |
| 语言或人文题 | 有论证、篇章、时序或因果 | 展示结构、证据链、因果或对照 | 无法判定时使用通用结构 |
| 不适合配图 | 单一概念或短文本 | 用例子、反例、边界和迁移辅助 | 不加载图形引擎 |
| 异常或旧缓存 | 结构错误、泄露或旧协议 | 拒绝异常候选；旧内容继续可读 | 只保留当前题目的回忆位置 |

</frozen-after-approval>

## Code Map

- `lib/learning/types.ts`、`providers/board*.ts` -- 板书教学单元、生成、校验和兼容协议。
- `lib/learning/board-aids.ts` -- 按学科和学习目的选择安全辅助。
- `components/board-*.tsx`、`components/learning-board.tsx` -- 一页课内容、主动回忆与板书问答。
- `tests/*board*.test.ts`、`tests/provider-contract.test.ts` -- 内容增益、学科差异、安全与兼容回归。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/types.ts`、`providers/board*.ts` -- 建立职责、目的、依据齐全的板书原生教学单元，并阻止 Chat 搬运、职责重复和空泛辅助。
- [x] `lib/learning/board-aids.ts` -- 按内容目的生成可验证辅助，不适用时保持无图。
- [x] `components/board-*.tsx`、`components/learning-board.tsx` -- 改成完整连续板书，移除一级模式和无长期存储价值的学习记录工具。
- [x] `tests/*board*.test.ts`、`tests/provider-contract.test.ts` -- 验证内容增益、学科差异、旧缓存、安全和失败路径。

**Acceptance Criteria:**
- Given 同一道题已有 Chat 讲解，when 打开新版板书，then 不阅读 Chat 也能看清任务、关系、推导理由、易错点与迁移方法，且不存在整段复用。
- Given 板书含辅助内容，when 学生查看图、例子或反例，then 能直接看出它解决的理解问题和所依据的原题事实。
- Given 内容适合不同学科表达，when 分别输入数理题和语言人文题，then 板书结构与辅助形式明显不同，不使用统一长卡片模板。
- Given 学生首次进入板书，when 页面打开，then 首屏直接进入内容，不需要先理解“全局、推导、回忆”等模式。

## Design Notes

最小教学闭环是“读懂任务 → 建立关系 → 关键推导 → 解释为什么 → 识别误区 → 迁移与记忆”。单元数量由内容决定；现有可视化库只负责渲染，不能决定生成内容。

进入板书时先同步生成并立即展示基于已验证题目分析的一页板书，不再等待模型；模型只在 1400 tokens 内生成标题和五到六段学科化正文，教学计划、重点标记与配图由独立安全层补充。增强内容通过 320 tokens 的受约束事实审校后才替换即时板书，超时或失败只会停止增强，不会把已经可学习的板书降级成错误框架。

## Verification

**Commands:**
- `npm run typecheck` -- 新旧协议和组件类型通过。
- `npm run lint` -- 无新增静态检查问题。
- `npm test` -- 内容职责、去重复、学科差异、安全、缓存和交互回归通过。
- `npm run build:function` -- 前后端共享板书协议一致。
- `npm run build` -- 生产构建通过，或记录宿主限制证据。

**Manual checks (if no CLI):**
- 手机宽度用数学、物理、语文或历史、无图短题各验证一次；检查独立可学、内容差异、辅助价值、问答、缓存重开和返回主线。

## Suggested Review Order

**内容协议与安全边界**

- 从五类教学职责与失败降级入口理解整套设计。
  [`board.ts:187`](../../lib/learning/providers/board.ts#L187)

- 学科化安全内容避免把 Chat 段落重新包装。
  [`board-native-fallback.ts:13`](../../lib/learning/board-native-fallback.ts#L13)

- 原生计划校验职责、依据、去重与答案保护。
  [`board-plan.ts:62`](../../lib/learning/providers/board-plan.ts#L62)

- 缓存恢复重新执行事实复检，不信任浏览器持久化内容。
  [`board-cache.ts:19`](../../lib/learning/board-cache.ts#L19)

**辅助内容与呈现**

- 只为有真实结构收益的内容附加可验证辅助。
  [`board-aids.ts:4`](../../lib/learning/board-aids.ts#L4)

- 一页课连续展开，只保留服务当次理解的主动回忆与板书问答。
  [`board-workspace.tsx:17`](../../components/board-workspace.tsx#L17)

- 降级状态明确告知并提供完整板书重试入口。
  [`learning-board.tsx:135`](../../components/learning-board.tsx#L135)

**状态与验证**

- 文档键绑定内容版本，只恢复当前题目中的主动回忆位置。
  [`board-workspace.ts:12`](../../lib/learning/board-workspace.ts#L12)

- 类型协议集中定义教学职责、场景和学生状态。
  [`types.ts:187`](../../lib/learning/types.ts#L187)

- 专项测试覆盖学科差异、缓存篡改、答案泄露和无图场景。
  [`board-lesson.test.ts:9`](../../tests/board-lesson.test.ts#L9)
