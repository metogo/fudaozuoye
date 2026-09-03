---
title: '修复学段适配端到端失效与板书上下文断链'
type: 'bugfix'
created: '2026-09-02'
status: 'done'
baseline_commit: '7716343dae309cc9374436feaa2f51cb175c44e6'
context:
  - 'AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 完整讲解的模型超时发生频率高，而且已经流出的安全内容会被整体隐藏；小学完整讲解还会被面向短对话的语言规则误判。板书入口虽然传入当前对话，但服务端主动丢弃上下文，因此小学、初中、高中看到的仍是近似固定模板，不能承接刚才的讲解。部分模型公式还会以 `\(...\)` 或裸 LaTeX 显示。

**Approach:** 缩短完整讲解目标篇幅并让流式超时按“已有内容是否完整”分级处理，避免尾部超时抹掉可用结果；将表达验收按内容场景区分。恢复板书生成链路对真实对话上下文和学习者学段的使用，并在最终可见板书上统一执行结构、表达和答案泄露验收；生成失败时保留可验证的本地板书降级。补齐标准数学定界符归一化，保证有效公式进入统一渲染链路。

## Boundaries & Constraints

**Always:** 保持现有 SSE 事件协议与立即加载反馈；完整讲解首轮只生成完成学习所需的内容，不用冗长铺垫消耗超时预算；超时时不得无条件隐藏已流出的内容，只有未满足最低完整结构或内容不安全时才判失败；板书只使用当前题目、知识节点和非完整答案对话作为理解上下文；一次请求只发送一个最终 `board.lesson`；小学、初中、高中必须在术语、句式、推理颗粒度和板书结构上有可观察差异；任何模型板书及学段转换后的最终板书都必须重新通过结构、证据、公式、学段表达和答案保护验收；模型失败或超时必须回落到安全板书，不让学习流程中断。

**Ask First:** 若实现需要引入新依赖、外部服务、改变 SSE 协议、允许板书引用完整讲解，或改成“先展示临时板书、稍后替换”的两阶段交互，必须先确认。

**Never:** 不在固定板书模板中继续堆学段关键词替换；不通过放宽答案保护换取内容丰富度；不把用户对话当作可信指令或答案证据；不因验收失败而在前端隐藏已经安全生成的完整讲解；不为单道题硬编码图形或话术。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 小学完整讲解 | 多个独立编号步骤，每步只做一个动作 | 允许完整输出，语言具体、短句、无无解释专业词 | 单个步骤塞入多个连续动作时触发一次重写；仍失败则给明确可重试错误 |
| 完整讲解尾部超时 | 已流出内容已满足标题、分步推导、结论和易错提醒 | 直接完成并保留现有内容，不让用户重试 | 内容结构不足或不安全时才重置并重写；重写仍失败才显示失败状态 |
| 完整讲解早期超时 | 尚未形成最低可用结构 | 不把半截推导冒充完整讲解 | 保留学习位置，显示可重试错误，不进入讲解后检查 |
| 对话与完整讲解规则隔离 | 同一段“先、再、然后、最后”出现在普通引导或分步完整讲解 | 普通引导仍拦截；规范编号的完整讲解通过 | 不全局关闭小学表达验收 |
| 学段板书 | 同一道题、同一段对话，分别选择小学/初中/高中 | 三份板书都承接当前卡点；小学具体直白，初中术语配白话，高中用变量和形式化关系 | 任一候选不合格时只返回对应学段的安全降级板书 |
| 空或恶意上下文 | 无对话，或对话中夹带指令、答案 | 无对话时仍可生成安全板书；恶意内容不被执行，最终答案不泄露 | 验收失败后回落，不发送半成品 |
| 公式呈现 | 内容含 `\(...\)`、`\[...\]` 或标准 `$...$` | 标准定界符统一进入 KaTeX 渲染，正文不显示转义命令 | 不猜测普通括号文本为公式 |

</frozen-after-approval>

## Code Map

- `lib/learning/grade-pedagogy.ts` -- 学段表达合同与场景化验收入口。
- `lib/learning/providers/solution.ts` -- 完整讲解流式收集、重写及最终验收。
- `lib/learning/http/turn.ts` -- 板书选择请求的服务端编排，目前丢弃 `boardContext`。
- `lib/learning/providers/adapter.ts` -- 真实模型板书生成、审校与安全降级边界。
- `lib/learning/providers/board.ts` -- 板书提示词、对话证据、学段约束及最终内容校验。
- `lib/learning/providers/mock-adapter.ts` -- 测试环境的确定性板书行为。
- `lib/learning/presentation.ts` -- 学习正文和公式定界符归一化。
- `tests/solution-stream.test.ts`、`tests/learning-turn.test.ts`、`tests/board-lesson.test.ts`、`tests/grade-pedagogy.test.ts` -- 回归与跨学段验收。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/grade-pedagogy.ts`、`lib/learning/providers/solution.ts`、`lib/learning/providers/model-support.ts` -- 让表达验收显式接收 `surface`，控制完整讲解篇幅，并在尾部超时时按已生成内容的完整性决定完成、重写或失败。
- [x] `lib/learning/http/turn.ts`、`lib/learning/providers/adapter.ts`、`lib/learning/providers/mock-adapter.ts` -- 恢复上下文感知的板书生成调用；只在失败时使用安全本地板书。
- [x] `lib/learning/providers/board.ts` -- 将 `learnerBand` 和 `recentDialogue` 送入板书正文生成，并对学段转换后的最终可见内容再次执行答案保护与内容验收。
- [x] `lib/learning/presentation.ts` -- 归一化标准 LaTeX 定界符，避免公式以原始文本显示。
- [x] `tests/*` -- 覆盖矩阵中的完整讲解、三学段板书、上下文污染、降级和公式场景。

**Acceptance Criteria:**
- Given 同一道修路题，when 分别以小学、初中、高中完成完整讲解和打开板书，then 三个流程均完成且无控制台错误，板书承接当前题目数据或关系并呈现明确学段差异。
- Given 小学模式，when 查看完整讲解与板书，then 不出现“定义域、等价变换、反例”等无解释抽象术语，也不会在安全内容生成后被清空。
- Given 模型在完整讲解尾部超时，when 已流出内容满足完整性与安全验收，then 页面保留内容、发出完成事件并允许继续学习，而不是要求重试。
- Given 模型板书超时、结构错误或含最终答案，when 打开板书，then 用户只看到一份安全可用的降级板书，学习状态和当前任务保持不变。
- Given 标准 `\(...\)`、`\[...\]` 公式，when 渲染学习内容，then 页面显示排版后的公式而非反斜杠命令。

## Spec Change Log

- 2026-09-02：独立审查后补齐小学抽象术语、单步多动作、板书对话来源映射、外部取消、板书总预算、流式总上限、Tutor 最终表达验收，以及混合 LaTeX/代码保护边界。
- 2026-09-02：根据真实小学首讲修正多动作误判；改为识别三个不同操作组成的连续动作链，同一动作的解释与举例重复不再被拒绝。
- 2026-09-02：真实使用发现二次学段表达验收会把结构完整的讲解误报为“未完成”并锁死流程。改为先执行确定性表达整理；仍有风格告警时保留完整讲解并完成流程，只有结构或公式完整性失败才进入失败态。
- 2026-09-02：继续体验发现“先显示完整正文，再清空重播优化版”造成明显倒退感。取消所有仅由表达告警触发的流式重写和展示后改写；学段表达由生成提示词前置约束，完整性通过后只记录质量告警，不再改变用户已看到的内容。
- 2026-09-02：为真正残缺的首轮输出补充交互兜底：二次整理在服务端静默完成，通过验收后一次性替换，不再把第二版按字符重新播放给用户。

## Design Notes

板书质量优先于固定模板的瞬时返回：采用一次上下文感知生成，并设置有界超时与本地安全降级。暂不采用临时板书再替换正式板书，因为它会增加闪烁、重复事件和状态竞争；若后续真实首字延迟不可接受，再单独评估两阶段协议。

## Verification

**Commands:**
- `npm test` -- 25 个测试文件、403 个测试全部通过；CORS 集成测试已在允许本地随机端口后通过。
- `npm run typecheck` -- TypeScript 类型检查通过。
- `npm run lint` -- 无 lint 错误。
- `npm run build:function` -- 云函数产物编译成功。
- `npx next build --webpack` -- Next.js 生产构建成功；默认 Turbopack 在当前受限运行环境中因无法派生进程/绑定内部端口而失败，不是编译错误。

**Manual checks:**
- 浏览器真实小学完整讲解持续输出约 66 秒仍正常完成，验证不再被旧的固定 60 秒总时长截断。
- 使用真实豆包服务，以同一道高中椭圆题分别按小学、初中、高中表达打开板书；三档均返回模型增强板书，`boardValidated=1`、安全降级为 0，且没有提前泄露最终焦点坐标。
- 真实验收脚本已明确拒绝 `quality.status=safe_fallback`，降级板书不再被统计为通过。

## Suggested Review Order

**响应完成与超时边界**

- 用首段、空闲和总上限区分慢响应与失活连接。
  [`adapter.ts:644`](../../lib/learning/providers/adapter.ts#L644)

- 已完整且安全的长讲解直接完成，不因尾部等待被清空。
  [`solution.ts:16`](../../lib/learning/providers/solution.ts#L16)

**板书内容与安全边界**

- 候选生成支持定向重写，事实审校失败仍安全降级。
  [`board-generation.ts:31`](../../lib/learning/providers/board-generation.ts#L31)

- 只修复可验证的结构缺口，证据、数字和答案门禁保持有效。
  [`board.ts:246`](../../lib/learning/providers/board.ts#L246)

- 学段规则按对话、讲解、板书分别验收。
  [`grade-pedagogy.ts:100`](../../lib/learning/grade-pedagogy.ts#L100)

**回归保障**

- 真实脚本可覆盖指定学段，并把安全降级明确判为失败。
  [`real-user-e2e.mjs:461`](../../scripts/real-user-e2e.mjs#L461)
