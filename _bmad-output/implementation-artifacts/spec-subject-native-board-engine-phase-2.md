---
title: '第二阶段：建立学科原生板书内容引擎'
type: 'feature'
created: '2026-09-01'
status: 'done'
baseline_commit: '1850bfc45c9fa4e6b7ea627771ce1ce73b78a4cc'
context:
  - '_bmad-output/implementation-artifacts/spec-board-native-teaching-content.md'
  - '_bmad-output/implementation-artifacts/spec-board-workbench-phase-1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前板书仍以统一模板组织内容；不同学科主要是换文字，真正使用的证据、对象和推理动作没有进入协议，内容没有质变。

**Approach:** 先识别学科与题型，再选择对应蓝图、教学动作、证据结构和可视表达；学科原生引擎是板书正文的唯一权威来源，模型负责识题、讲解和问答，不再自由改写板书事实。同时放开九类 K12 学科输入，使原生板书进入真实学习链路。

## Boundaries & Constraints

**Always:** 支持数学、物理、化学、生物、语文、英语、历史、地理、政治；各科有不同动作、区块职责和辅助；证据可追溯；保留防泄露、KaTeX、本地事实边界、即时板书、缓存、问答和 Gate；模型失败不影响当前学科板书。

**Ask First:** 新依赖、外部知识服务或权威题库；改变答案、掌握判定或学习路径；建设完整知识图谱而非最小目录。

**Never:** 用名称或颜色冒充差异；九科共用正文模板；模型输出代码、坐标或自由 DSL；虚构证据与事实；强制配图。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 数理化生 | 关系、系统、实验或过程题 | 分别突出建模变换、对象变量规律、粒子反应守恒、结构功能过程 | 条件不足时标出边界 |
| 语文英语 | 阅读或语法题 | 原文证据—语言现象—解释—作用；英语呈现句法角色 | 无证据不下结论 |
| 历史地理政治 | 材料、时序、空间或观点题 | 时序因果、区域要素过程、材料概念判断分别组织 | 只使用已给事实 |
| 识别不稳 | 跨科术语或残缺题干 | 使用保守配置并降低辅助强度 | 不套用别科结论 |

</frozen-after-approval>

## Code Map

- `types.ts`、`curriculum*.ts`、识别入口 -- 九学科输入与最小课程目录。
- `board-subject-engine.ts`、`providers/board*.ts` -- 学科蓝图、教学动作、模型约束和原生降级。
- `board-aids.ts`、`components/board-*.tsx`、`globals.css` -- 学科辅助协议与差异化呈现。
- `tests/subject-native-board.test.ts` 及回归 -- 九学科、安全与兼容验收。

## Tasks & Acceptance

**Execution:**
- [x] 扩展九学科输入与最小课程目录，使新增学科能完成首讲和板书。
- [x] 实现学科蓝图、教学动作、模型约束及原生即时板书。
- [x] 增加证据链、时间线、过程链和对比矩阵，并按学科动作呈现。
- [x] 用九学科代表题交叉验收模板串用、事实边界、泄露、缓存与交互。

**Acceptance Criteria:**
- Given 九道不同学科的代表题，when 生成学科原生板书，then 标题、教学动作、证据组织和至少一种合适的辅助形式体现学科差异，任意两类不得只替换学科名。
- Given 模型超时或返回非法内容，when 打开板书，then 仍立即出现与当前学科匹配的可学习内容，不出现统一安全框架。
- Given 材料中缺少支撑某项结论的证据，when 内容引擎生成计划或辅助，then 该结论或辅助被拒绝，原学习位置和其余可靠内容保留。
- Given 手机宽度连续打开不同学科板书，when 阅读完整页面并使用板书问答，then 内容可滚动、公式可读、证据与图形不遮挡，返回后学习环节不变。

## Design Notes

保留通用 `role`，新增 `discipline` 与 `move`。数学是建模—变换—验证，物理是定对象—列变量—选规律—解释量纲，语文是定位原文—识别表达—解释作用—回扣主旨，历史是定位时空—提取材料—建立因果—评价影响。UI 与审校以 `move` 为准。

新增 `evidence_chain`、`timeline`、`process_flow`、`comparison_matrix`；复用现有渲染库，不增依赖。辅助必须携带逐字证据，无法验证则为空。

## Verification

- `npm run typecheck`、`npm run lint` -- 类型与规范检查通过。
- `npm test` -- 22 个测试文件、351 项回归全部通过，覆盖九学科路由、学科原生题型、证据边界、答案隔离、缓存恢复与交互协议。
- `npm run build:function`、`npx next build --webpack` -- 分析服务与前端生产构建通过，源码和运行产物一致。
- 390 × 844 手机视口完成首页、首讲、打开板书、退出与再次查看板书的真实浏览器检查；页面可滚动、KaTeX 正常、控制台无错误。
- 三路独立交叉审计复核学科差异、提示注入、真实情态事实与文件体量边界，最终无 P1/P2。
- 本地服务常驻 `http://localhost:3000/`，前端与分析服务热更新均处于监听状态。

## Suggested Review Order

**主链路**

- 板书请求直接进入确定性学科引擎，不等待模型自由改写。
  [`turn.ts:183`](../../lib/learning/http/turn.ts#L183)

- 即时板书统一完成原生正文、答案保护与安全辅助装配。
  [`board.ts:288`](../../lib/learning/providers/board.ts#L288)

**学科内容**

- 题目特征决定学科题型与专属教学动作。
  [`board-subject-engine.ts:178`](../../lib/learning/board-subject-engine.ts#L178)

- 五段正文围绕证据、推理与复核生成，而非换皮模板。
  [`board-subject-engine.ts:208`](../../lib/learning/board-subject-engine.ts#L208)

- 可视辅助仅在证据足够时补充关系、时序与过程。
  [`board-aids.ts:6`](../../lib/learning/board-aids.ts#L6)

**可信边界**

- 中英文材料事实与作答指令在进入板书前分离。
  [`board-evidence.ts:12`](../../lib/learning/board-evidence.ts#L12)

- 计划解析校验五段结构、证据归属、图形与答案隔离。
  [`board-plan.ts:76`](../../lib/learning/providers/board-plan.ts#L76)

**移动端呈现**

- 板书工作区承载独立阅读、展开与返回恢复。
  [`board-workspace.tsx:17`](../../components/board-workspace.tsx#L17)

- 语义图形按内容类型渲染，不用装饰图冒充教学辅助。
  [`board-scene-visual.tsx:10`](../../components/board-scene-visual.tsx#L10)

**验收**

- 九学科、题型、安全边界与跨路径回归集中验证。
  [`subject-native-board.test.ts:23`](../../tests/subject-native-board.test.ts#L23)
