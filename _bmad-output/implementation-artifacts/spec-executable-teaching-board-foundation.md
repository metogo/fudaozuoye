---
title: '建立可执行教学板书的内容基础'
type: 'refactor'
created: '2026-09-03'
status: 'complete'
baseline_commit: 'f30047e48d04fcb1ee0d50c405b6f0f05697e5b1'
context:
  - '_bmad-output/planning-artifacts/research/technical-openmaic-board-research-2026-09-03.md'
  - '_bmad-output/implementation-artifacts/spec-subject-native-board-engine-phase-2.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前板书仍是固定五段文字卡；图形附着在重复正文后，场景和介质不能随题目与学生卡点变化，因此相对 Chat 没有稳定内容增益。

**Approach:** 建立版本化 `BoardExperience`，由 Board Director 选择 2–6 个必要场景；公式推导、条件关系和原文证据成为一等教学介质，旧 `BoardLesson` 只作迁移输入。

## Boundaries & Constraints

**Always:** 场景必须有独立学习价值和可信依据；模型只输出受限语义，不输出坐标、代码或图形 DSL；布局、稳定 ID、引用、答案保护和降级由代码校验；保持入口、问答、滚动、缓存与主流程；九学科均可安全退回文本场景。

**Ask First:** 新依赖；改变模型供应商、学习 Gate、答案策略或部署；扩大到仿真和完整动作播放。

**Never:** 用皮肤冒充内容升级；强制五场景；重复正文、目标、依据和图形说明；使用无关统一模板降级；长期维护两套权威协议。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 数学关系或推导题 | 有可靠公式与条件 | 关系图或推导成为主内容，场景数按任务决定 | 解析失败则保留有依据的文本步骤 |
| 语言与材料题 | 有可定位原文 | 原句与解释并列，证据指向判断 | 无可靠证据则不生成证据场景 |
| 普通或残缺题 | 无适合的三类专用介质 | 生成 2–6 个简洁文本场景，不强行配图 | 结构失败只降级当前场景 |
| 旧缓存 | 旧板书协议 | 单向编译并正常重开 | 损坏时重新生成，不污染学习状态 |

</frozen-after-approval>

## Code Map

- `lib/learning/{types,board-experience,board-director}.ts` -- 新协议、迁移与动态场景选择。
- `lib/learning/providers/board*.ts`、`board-aids.ts` -- 解除五段约束，把三类介质变成主内容。
- `components/board-*.tsx`、`app/board-course.css` -- 按介质呈现并消除重复。
- `tests/*board*.test.ts` -- 动态场景、旧缓存、安全与跨学科回归。

## Tasks & Acceptance

**Execution:**
- [x] 建立版本化体验协议、严格校验和旧板书单向 Adapter。
- [x] 实现 Board Director 的 2–6 场景选择，并删除新链路的固定五段约束。
- [x] 将公式推导、关系图、原文证据接入为主介质，无增益场景不生成。
- [x] 工作区按介质呈现，保留导航、问答、缓存和学习状态。
- [x] 补齐协议、内容效用、异常降级和跨学科回归测试。

**Acceptance Criteria:**
- Given 同题存在不同卡点，when 打开板书，then 场景和首个主介质随卡点变化，不是固定五步换文案。
- Given 选择专用介质，when 阅读场景，then 专用表达承担主要信息，正文不重复其说明。
- Given 专用介质校验失败，when 生成板书，then 只降级该场景，其余内容和学习进度可用。
- Given 旧缓存和九学科代表题，when 打开并重开，then 内容可读、公式正确且无答案泄漏。

## Design Notes

`BoardExperience` 是唯一运行时模型；`BoardLesson` 只作过渡输入。Scene 声明 `medium`，Element 使用稳定 ID；本阶段只定义 Action 和静态揭示序列。关系图用原生 SVG，公式用 KaTeX，证据用语义 DOM，动态数学沿用 JSXGraph；Rough.js 不参与内容生成。

## Verification

**Commands:**
- `npm run typecheck`、`npm run lint` -- 类型与规范通过。
- `npm test` -- 全量及新增动态场景、降级、旧缓存和答案保护测试通过。
- `npm run build:function`、`npm run build` -- 云函数与生产构建通过。

**Manual checks:**
- 在 390 × 844 视口分别用数学推导题、数学关系题、语文/英语材料题和普通题验证主介质、滚动、重开、问答及失败降级。

## Completion Notes

- Director 在生成前按题目、知识节点和对话卡点选择动作；两种模型协议都会逐项核对动作集合和顺序。
- `BoardExperience` 已成为页面唯一运行时输入，旧 `BoardLesson` 只保留为缓存与接口迁移格式。
- 公式脉络、关系图和证据链作为主介质时不再重复渲染整段正文；介质损坏只回退当前场景。
- 旧缓存会按当前题目重建，并在节点仍存在时迁移原回忆位置；损坏缓存不会进入新版运行态。
- 自动测试 428 项、跨域接口 3 项、TypeScript、ESLint、云函数构建与 Next.js webpack 生产构建通过；本地浏览器验证四步动态板书、重开、滚动固定导航及末步激活正常。
