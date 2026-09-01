---
title: '把语义板书升级为可操作的解题工作台第一阶段'
type: 'feature'
created: '2026-09-01'
status: 'done'
baseline_commit: '73eff1b4b873b2b5042861dd6a06f39b33425791'
context:
  - '_bmad-output/implementation-artifacts/spec-semantic-visual-learning-board.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前板书已有语义场景和学科图，但仍是纵向阅读卡片；学生不能从全局脉络进入步骤、主动回忆或留下与步骤绑定的笔记和草稿，因此还不是独立于 Chat 的学习工具。

**Approach:** 建立可持久化的 `BoardDocument` 和学生状态，把现有 `BoardLesson` 编译为稳定节点与依赖关系；提供“全局、推导、回忆”三种模式，以及按节点保存的笔记、掌握标记和手写草稿，复用现有渲染库。

## Boundaries & Constraints

**Always:** 保留板书问答、来源、缓存重开、返回主线、答案防泄露和图形降级；学生状态与服务端板书分开保存；旧缓存无损升级；手机触控、键盘和 reduced-motion 可用；节点、依赖和来源均可校验。

**Ask First:** 改模型协议或学习 Gate；新增依赖、外部存储、跨设备同步；把草稿发送给 AI；加入完整解答/订正模式或学科引擎。

**Never:** 用更多长卡片冒充工作台；让模型输出坐标或代码；把学生内容混入答案审校；因学生状态损坏丢弃板书；自动轮播阻塞阅读。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 首次进入 | 合法板书、无状态 | 展示可聚焦的全局脉络 | 编译失败退回现有板书 |
| 推导/回忆 | 选择节点和模式 | 展示依赖；可遮挡、揭示并标记掌握 | 无依赖仍可阅读 |
| 学生记录 | 输入笔记或画草稿 | 与节点绑定并持久化，支持撤销重做 | 非法数据不覆盖旧状态 |
| 刷新重开 | 同题已有状态 | 恢复模式、节点、记录和草稿 | 损坏状态只重置学生层 |

</frozen-after-approval>

## Code Map

- `lib/learning/types.ts`、`board-workspace.ts` -- 工作台文档、学生状态、编译与校验。
- `components/board-workspace.tsx` -- 全局脉络、推导聚焦和回忆交互。
- `components/board-learner-layer.tsx` -- 节点笔记、掌握标记与手写草稿。
- `components/learning-board.tsx`、`education-chat-app.tsx`、`lib/learning/board-cache.ts` -- 接入并分层持久化。
- `app/globals.css`、`tests/*board*.test.ts` -- 自适应样式和状态边界验证。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/types.ts`、`board-workspace.ts` -- 建立稳定、可校验且不复制答案状态的工作台模型。
- [x] `components/board-workspace.tsx`、`board-learner-layer.tsx` -- 实现三模式、节点导航、笔记、标记和草稿。
- [x] `components/learning-board.tsx`、`education-chat-app.tsx` -- 接入工作台并保持问答和主线行为。
- [x] `lib/learning/board-cache.ts`、`tests/*board*.test.ts` -- 覆盖持久化、旧数据、损坏隔离和安全边界。
- [x] `app/globals.css` -- 完成移动端交互、滚动和可访问性。

**Acceptance Criteria:**
- Given 已验证板书，when 首次打开，then 先看到可点击的推理脉络而非长正文。
- Given 选择节点，when 切换三种模式，then 节点、来源和配图一致且不改变 Chat 进度。
- Given 写笔记、标记或画草稿，when 关闭重开或刷新，then 同题恢复、新题隔离；损坏时只重置学生层。

## Design Notes

全局模式呈现脉络，推导模式突出前置条件与方向，回忆模式按节点遮挡和揭示。学生层只保存在本地，首期不进入 AI 请求，也不改变服务端板书缓存版本。

## Verification

**Commands:**
- `npm run typecheck` -- 工作台与缓存类型通过。
- `npm run lint` -- 无新增静态检查问题。
- `npm test` -- 新旧板书、工作台状态与学习流程测试全部通过。
- `npm run build:function` -- 前后端共享协议编译一致。

**Manual checks (if no CLI):**
- 在手机宽度完成全局节点选择、推导切换、回忆揭示、文字笔记、手写撤销重做、关闭重开和刷新恢复；确认板书问答及返回主线保持可用。

## Suggested Review Order

**工作台入口与学习模式**

- 从三模式、节点脉络和学习层入口理解完整产品形态。
  [`board-workspace.tsx:24`](../../components/board-workspace.tsx#L24)

- 保留板书对话、焦点锁定和底部问答，不改变主线。
  [`learning-board.tsx:29`](../../components/learning-board.tsx#L29)

**学生状态与安全边界**

- 稳定编译节点和依赖，拒绝串题、损坏与超限草稿。
  [`board-workspace.ts:15`](../../lib/learning/board-workspace.ts#L15)

- 恢复手写后释放画布，笔记和草稿始终绑定当前节点。
  [`board-learner-layer.tsx:14`](../../components/board-learner-layer.tsx#L14)

- 缓存恢复先经服务端复检，再恢复独立学生状态。
  [`education-chat-app.tsx:63`](../../components/education-chat-app.tsx#L63)

- 所有状态更新再次本地校验，非法数据不覆盖旧记录。
  [`education-chat-app.tsx:480`](../../components/education-chat-app.tsx#L480)

**接入与持久化**

- 新板书到达时编译文档并建立全新、隔离的工作区。
  [`education-chat-app.tsx:382`](../../components/education-chat-app.tsx#L382)

- 同题关闭重开与刷新恢复模式、节点、笔记和手写。
  [`education-chat-app.tsx:118`](../../components/education-chat-app.tsx#L118)

**契约、样式与验证**

- 文档、掌握状态与受限手写路径形成明确数据契约。
  [`types.ts:214`](../../lib/learning/types.ts#L214)

- 移动端脉络横向浏览，桌面端学习层双栏常驻。
  [`globals.css:771`](../../app/globals.css#L771)

- 持久化、串题、损坏和手写边界均有自动化覆盖。
  [`board-workspace.test.ts:5`](../../tests/board-workspace.test.ts#L5)
