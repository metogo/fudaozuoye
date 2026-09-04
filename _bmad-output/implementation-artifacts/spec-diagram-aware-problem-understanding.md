---
title: '让题目配图成为可核验的解题依据'
type: 'feature'
created: '2026-09-03'
status: 'done'
baseline_commit: 'f30047e48d04fcb1ee0d50c405b6f0f05697e5b1'
context:
  - '_bmad-output/implementation-artifacts/spec-executable-teaching-board-foundation.md'
  - '_bmad-output/implementation-artifacts/spec-subject-native-board-engine-phase-2.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 拍照题的原图目前只用于 OCR，进入分析后仅剩题干文字；只要题目中的视觉内容承载条件、关系或设问对象，模型就会在证据不完整的情况下继续讲解，答案不可靠。

**Approach:** 先判断图片中的视觉内容是否属于当前题目、是否影响理解或求解；若相关，则把原题图片与题干一起交给多模态模型完成联合分析，再将有依据的视觉理解沉淀为会话证据，供引导、解题、验题与板书持续使用。这是题图相关性驱动的通用能力，不按具体图形类别触发。

## Boundaries & Constraints

**Always:** 相关性判断同时参考题干指代、版面归属和视觉内容，不能只靠“如图”等关键词；相关图片必须参与首次完整求解与学习路径分析，而非先转成一句图片描述再让纯文本模型猜；只记录图片中有依据的条件、对象与关系，不把模型推导结论冒充原始题设；原图仅在当前请求中传输，不写入会话凭证或本地持久化；后续环节使用已核验的视觉证据；旧的纯文字题和旧会话继续可用。

**Ask First:** 引入新的视觉模型、OCR/图形库或外部存储；保存原始照片；扩展到可编辑坐标图、自动描图或计算机视觉测量。

**Never:** 把手写草稿、涂改或二维码内容默认当作印刷题设；把模型推理出的结论伪装成图中原始条件；将视觉摘要拼进题干字符串形成第二份不可追溯真相源；仅针对正方形铺路题写规则。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 视觉内容属于题目且影响求解 | 当前照片中题干与配图共同构成一道题 | 原图与题干共同进入多模态分析；后续环节可引用有来源的视觉证据 | 图片模糊、裁断或关键信息不确定时要求重拍或确认，不允许只按文字解题 |
| 视觉内容属于题目但不影响求解 | 插图只帮助理解、不提供必要条件 | 多模态模型可参考，但不制造额外题设，后续流程保持简洁 | 不生成空洞或重复的视觉事实 |
| 视觉内容不属于当前题目 | 邻题配图、页眉、二维码、装饰或背景 | 排除，不进入当前题目的证据链 | 相关性不确定时提示用户框选或重拍 |
| 隐含图文关联 | 题干没有“如图”，但设问对象只在图片中出现 | 仍识别为相关并联合分析 | 不得仅靠关键词漏掉配图 |
| 含手写痕迹 | 印刷条件旁有学生圈画、计算或答案 | 与题设事实分离，手写内容只进入已有作答 | 来源不明时标记待确认 |
| 旧会话/文字输入 | 没有视觉事实字段 | 行为与当前版本一致 | 不因字段缺失报错 |

</frozen-after-approval>

## Code Map

- `lib/learning/types.ts` -- 增加版本化、可选且有界的视觉事实模型。
- `lib/learning/providers/adapter.ts` -- 判断题图相关性，并在相关时让完整分析继续携带原图执行多模态联合理解。
- `lib/learning/providers/provider-validation.ts` -- 校验视觉事实、来源与题图依赖完整性，并统一生成可信题目证据。
- `lib/learning/http/analyze.ts`、`lib/learning/server-state.ts` -- 完整保留已确认视觉事实并兼容旧会话，不保留原图。
- `components/education-chat-app.tsx`、`components/learning-chat.tsx` -- 在识别到相关但不确定的视觉内容时展示简洁确认入口，并把原图仅传到首次完整分析。
- `lib/learning/providers/{solution,tutor,board-prompts,board}.ts`、`lib/learning/board-*.ts` -- 解题、教学、验题和板书统一消费可信证据。
- `tests/provider-contract.test.ts`、`tests/learning-*.test.ts`、`tests/*board*.test.ts` -- 覆盖识别、会话往返、各学习环节与跨学科配图。

## Tasks & Acceptance

**Execution:**
- [x] 定义 `visualContext`：视觉内容与当前题目的相关性、是否影响求解、可见事实、来源与置信度；图形类别只作可选呈现信息，不作为启用条件。
- [x] 改造识别协议，区分当前题图、邻题/装饰内容、印刷题设与学生手写内容；不能仅靠题干关键词判断。
- [x] 改造首次完整分析接口：相关题图必须把原图和题干共同交给多模态模型，输出答案依据与可延续的视觉证据；不相关图片不得污染上下文。
- [x] 只对相关性或关键事实不确定的题图要求用户确认；高置信度题图直接进入联合分析，不强加一次操作。
- [x] 建立唯一的题目证据入口，替换下游只读 `problem.text` 的解题与教学上下文；答案保护仍以题干和已核验题图事实为边界。
- [x] 让板书按已确认视觉事实生成有依据的关系图或条件图；无法安全作图时展示事实，不伪造图形。
- [x] 增加当前铺路题、几何、统计图、电路、地图/装置、装饰图、模糊图和手写干扰回归测试。

**Acceptance Criteria:**
- Given 当前铺路题照片，when 系统判断右下配图属于第 6 题并开始分析，then 多模态模型联合使用题干和原图完成推理，后续讲解明确使用“总宽 15 米、正方形边长 12 米、两侧铺路”等有依据的视觉条件，而非只依据 OCR 文字。
- Given 照片包含邻题图片、二维码和手写草稿，when 判断视觉相关性，then 只有属于当前题目的视觉内容进入解题证据。
- Given 一道必须依赖配图但视觉条件未可靠识别的题，when 用户提交，then 系统阻止不完整讲解并说明需要确认或重拍。
- Given 任一纯文字题或旧会话，when 进入原有学习流程，then 交互、解题和板书不发生回归。
- Given 已确认视觉事实，when 依次使用核心讲解、完整解答、追问、验题和板书，then 各环节引用同一事实且不得产生互相矛盾的图中条件。

## Design Notes

核心触发条件是“视觉内容是否属于当前题目且是否影响理解或求解”，不是具体图形类别。原图只随识别和首次完整分析的短生命周期请求流转；分析后保留跨学科的受限视觉证据，而不是图片、坐标或图形 DSL。板书可据此选择现有受控图形介质，但不能反向改写证据。只有相关性或关键条件不确定时才增加确认，高置信度题保持直达。

## Verification

**Commands:**
- `npm run typecheck`、`npm run lint` -- 类型与规范通过。
- `npm test` -- 视觉事实协议、会话兼容、答案保护和板书回归通过。
- `npm run build:function`、`npm run build` -- 服务端与生产构建通过。

**Manual checks:**
- 用当前真实照片完成拍照、确认、讲解、完整解答与板书端到端验证；跨学科图表在可复用的脱敏图片样本集建立前，先通过多模态协议与证据链契约测试覆盖。检查错误视觉事实可纠正，低置信度不会被静默采用。

**Completed evidence:**
- 真实铺路题完成拍照识别、核心讲解、完整讲解和板书链路；系统正确保留 15 米、12 米两条标注线的实际起止关系，并识别出把它们直接当成长方形长宽虽碰巧得到 54 米、但推理关系错误；原图未进入会话状态。
- 几何、统计图、电路、地图/装置、装饰图、模糊图和手写干扰通过协议与证据链回归测试。
- `npm run typecheck`、`npm run lint`、`npm test`（27 files / 462 tests）、`npm run build:function`、`npx next build --webpack` 全部通过。

## Suggested Review Order

**多模态判断与复核**

- 从整题图片判断归属、必要性与可核验事实。
  [`problem-image-analysis.ts:13`](../../lib/learning/providers/problem-image-analysis.ts#L13)

- 原图参与二次核验，人工确认事实不可被改写。
  [`adapter.ts:158`](../../lib/learning/providers/adapter.ts#L158)

**证据模型与生命周期**

- 视觉摘要由事实生成，下游只有一个证据入口。
  [`problem-evidence.ts:5`](../../lib/learning/problem-evidence.ts#L5)

- 原图只在首次回合短暂传输，不写入会话。
  [`turn.ts:23`](../../lib/learning/http/turn.ts#L23)

- 复核后仅必要题图继续进入首次教学。
  [`turn.ts:109`](../../lib/learning/http/turn.ts#L109)

**低置信度确认体验**

- 用户可区分解题需要、辅助理解与无关内容。
  [`learning-chat.tsx:301`](../../components/learning-chat.tsx#L301)

- 模糊关键条件要求换图，避免同图循环重试。
  [`education-chat-app.tsx:295`](../../components/education-chat-app.tsx#L295)

**下游消费与安全**

- 板书答案保护统一读取题干与题图证据。
  [`board.ts:551`](../../lib/learning/providers/board.ts#L551)

- 视觉证据是可选字段，旧会话继续兼容。
  [`types.ts:431`](../../lib/learning/types.ts#L431)

**回归证明**

- 跨图表类型验证统一证据与低置信度门禁。
  [`problem-evidence.test.ts:14`](../../tests/problem-evidence.test.ts#L14)

- 覆盖二次纠错、人工确认和多模态请求契约。
  [`provider-contract.test.ts:460`](../../tests/provider-contract.test.ts#L460)

- 验证原图传输、降级阻断与首次回合顺序。
  [`learning-turn.test.ts:37`](../../tests/learning-turn.test.ts#L37)
