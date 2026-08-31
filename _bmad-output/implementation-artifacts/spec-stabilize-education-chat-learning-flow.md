---
title: '稳定教育 Chat 全学习闭环'
type: 'refactor'
created: '2026-08-28'
status: 'done'
baseline_commit: 'cc0ca25cf34af996e2e09290bbb7639218e91651'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 真实模型 60 条学习旅程只有 63.3% 完成：初始分析被并非当前必需的知识卡片校验阻断，板书等可选能力会把主学习流一起判失败，错误反馈可能泄露标准答案，连续补救还可能循环。学生看到的是“清晰题目也无法开始”或“做错后直接被告知答案”，既不稳定，也削弱学习价值。

**Approach:** 保留现有单页 Chat、强制互动、自由追问回归、知识倒推、板书、独立作答和迁移题；把生成改成按学习动作延迟发生，让主讲先可靠开始，并对知识节点、板书、验收和迁移分别校验、分别失败。错误只指出偏差和下一步，不代替学生作答。

## Boundaries & Constraints

**Always:** 题目识别后可先流式讲核心思路；只有学生确实卡住时才生成直接前置知识，尝试作答时才需要检查题，主动点击时才生成板书，完成后主动选择才生成迁移题；主 Chat 状态不得因可选分支失败而丢失；三档推理强度和会话模型锁定保持；所有可见模型正文继续使用 SSE；服务端仍校验课程目录、证据、图无环和答案语义；图片和会话隐私策略不变。

**Ask First:** 删除既有学习动作、降低原题独立作答标准、改变实际豆包模型路由、引入数据库/长期画像/新服务、放宽严重知识错误或伪造题目来源。

**Never:** 用 Mock 或固定模板冒充真实讲解；用默认知识点掩盖模型失败；因板书、迁移题或补基础失败把已成功的原题讲解作废；错误反馈展示标准答案、正确数值或完整步骤；无限重复同一种讲法；为提高通过率而跳过课标或事实校验。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| 首次讲解 | 已确认的数理化题 | 先建立原题安全会话并 SSE 讲核心思路，不等待完整知识 DAG | 原题基础结构修复一次；失败保留题目和重试 |
| 学生不懂 | 同一步连续反馈不懂 | 换讲法、具体例子，再生成一个真实直接前置并回到原题 | 节点局部修复；仍失败时保留主线并说明可继续追问/请真人 |
| 板书 | 模型建议且学生主动打开 | 返回完整板书和真实内容中的重点标记 | 标注或审校失败只关闭板书生成，不改变 Gate 和 Chat |
| 作答错误 | 节点、原题或迁移题答错 | 显示错误类型和一个可执行提示，允许重试 | 不显示标准答案；模型反馈泄露时服务端替换为安全提示 |
| 等价答案 | 单位、符号、格式不同但语义等价 | 按学科语义判为正确 | 无法确定时从严判定并给检查提示，不假通过 |
| 补救收敛 | 同节点多次不懂或多层下钻 | 每节点最多两种讲法和一次下钻，达到边界后明确真人介入 | 不重置已走路径，不无限循环 |
| 图片失败 | 模糊、裁断或识别失败 | 当前消息给出重拍/换图入口 | 新图替换失败图的待处理状态，不要求刷新页面 |

</frozen-after-approval>

## Code Map

- `lib/learning/providers/adapter.ts` 与新的初始会话/答案评估模块 -- 拆分首讲、知识诊断、验收和局部修复。
- `lib/learning/http/{analyze,turn}.ts` -- 编排延迟生成、可选能力错误隔离和补救收敛。
- `lib/learning/providers/{blueprint,board,tutor}.ts` -- 强化真实证据、板书标注和不泄露答案约束。
- `components/{education-chat-app,learning-chat}.tsx` -- 保留消息与 Gate，补替换图片、局部失败反馈和 44px 触控。
- `tests/` 与 `scripts/real-user-e2e.mjs` -- 锁定回归行为并重跑真实模型基线。

## Tasks & Acceptance

**Execution:**
- [x] 拆分“原题先讲”和“需要时生成知识节点”，确保可选生成不阻断主 Chat。
- [x] 增加字段级结构修复、板书内容与标注分段校验、学科答案等价判断及安全错因反馈。
- [x] 为补救路径增加可解释的收敛边界，并保留已完成节点与中断位置。
- [x] 修复图片失败替换、移动端触控尺寸与无障碍标签。
- [x] 扩充契约、状态机、UI 和真实模型旅程测试。

**Acceptance Criteria:**
- Given 清晰完整题目，when 首次分析，then 不因尚未使用的知识卡、板书或迁移题失败而无法开始讲解。
- Given 任一可选能力失败，when 返回 Chat，then 原消息、当前 Gate、模型档位和学习进度完整保留。
- Given 学生答错，when 查看反馈，then 能知道检查哪类错误，但看不到标准答案或完整步骤。
- Given 学生连续不懂，when 达到补救边界，then 页面明确下一种可行动作并停止重复循环。
- Given 手机用户操作首页与裁切页，when 点击所有核心控件，then 触控区至少 44px 且图标有可读名称。

## Design Notes

“可靠”不是减少校验，而是让校验发生在能力真正被使用时。主会话只承担开始讲解所需事实；知识节点、板书、迁移题各自追加到密封会话。任何追加失败都只回滚本次追加，不回滚学生已经获得的学习进度。

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- 类型、静态检查和全部单元/契约测试通过。
- `npm run build:function && npm run build:cloudbase` -- 云函数与 H5 构建通过。
- `npm run test:e2e:real-users` -- 真实模型多学科、学段、难度和三档推理回归；整体 ≥95%，单学科 ≥90%，无答案泄露和严重知识错误。

**Results:**
- 12 个测试文件、132 条测试全部通过；类型检查、Lint、云函数与 H5 构建通过。
- 10 组自动化学生画像完成 60/60 条真实模型旅程，数理化均为 100%。
- SSE 多段输出、推理强度锁定均为 100%；答案提前泄露为 0。
- 板书审校 9/9、错答恢复 10/10、迁移题完成 20/20。
- CloudBase 生产版本 `fudaozuoye-019` 部署成功，生产跨域与真实回合冒烟通过。

## Suggested Review Order

**学习流编排**

- 从统一回合入口理解主讲、补救、验收和迁移如何收敛。
  [`turn.ts:14`](../../lib/learning/http/turn.ts#L14)

- 首讲只建立原题安全会话，前置知识改为按需生成。
  [`adapter.ts:200`](../../lib/learning/providers/adapter.ts#L200)

- 补救优先复用可靠节点，并在边界处停止重复下钻。
  [`turn.ts:149`](../../lib/learning/http/turn.ts#L149)

**可靠性与安全**

- 等价答案按数值、单位、化学式等学科语义统一判断。
  [`assessment.ts:82`](../../lib/learning/providers/assessment.ts#L82)

- 板书内容、标注与答案泄露分别校验后才可展示。
  [`board.ts:193`](../../lib/learning/providers/board.ts#L193)

- 生产跨域仅允许配置的 H5 来源访问云函数。
  [`index.ts:56`](../../functions/learning-api/src/index.ts#L56)

**学生端体验**

- 图片替换、推理强度、请求取消和会话恢复集中管理。
  [`education-chat-app.tsx:42`](../../components/education-chat-app.tsx#L42)

- 局部分支失败可见，但不丢失当前 Gate 与学习进度。
  [`education-chat-app.tsx:241`](../../components/education-chat-app.tsx#L241)

- 强制作答仍允许先问当前步骤，回答后返回原任务。
  [`learning-chat.tsx:116`](../../components/learning-chat.tsx#L116)

**验证与发布**

- 真实模型脚本覆盖学科、学段、难度、档位和六类路线。
  [`real-user-e2e.mjs:1`](../../scripts/real-user-e2e.mjs#L1)

- 回合测试锁定错误隔离、补救收敛和迁移题刷新。
  [`learning-turn.test.ts:1`](../../tests/learning-turn.test.ts#L1)

- 跨域测试防止线上 H5 再次被浏览器拦截。
  [`function-cors.test.ts:1`](../../tests/function-cors.test.ts#L1)
