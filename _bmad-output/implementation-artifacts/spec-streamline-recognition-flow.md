---
title: '取消普通拍题的识别确认拦截'
type: 'bugfix'
created: '2026-09-04'
status: 'done'
baseline_commit: 'f30047e48d04fcb1ee0d50c405b6f0f05697e5b1'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 拍题后，普通文字置信度偏低或不相关视觉内容的低分也会触发整页确认，要求学生重复阅读题干、选择图片用途，再点击确认。原本连续的识别与讲解因此被阻断。

**Approach:** 取消仅由文字识别分数或非必要图片分数触发的确认。有效识别结果自动进入讲解；仅当已判定解题依赖题图而关键视觉条件仍不可靠时，保留异常澄清入口。不以取消质量检查来掩盖无法识别的输入。

## Boundaries & Constraints

**Always:** 基于当前未提交代码修改，保留其他工作。普通题识别后直接进入现有分析与讲解流程；题图事实和原图传递逻辑保持不变。识别请求失败或没有完整结果仍显示重试，不编造题干。保留必要题图条件不确定时的澄清能力。

**Ask First:** 若需要新增模型调用、服务或依赖，改变图文识别协议，或完全取消关键题图条件澄清，先确认。

**Never:** 不自动提交或推送，不修改其他学习环节，不因为减少点击而删除题图证据、改变置信度数据或伪造用户已确认。

## I/O & Edge-Case Matrix

| 场景 | 输入 | 预期行为 | 错误处理 |
|---|---|---|---|
| 普通文字截图 | 有效题干，文字分数低于旧阈值，无必要配图 | 自动进入讲解 | 请求失败仍可重试 |
| 非相关视觉内容 | related=false，判断置信度偏低 | 不显示识别确认 | 保留原识别结果 |
| 辅助插图 | related=true，affectsSolving=false | 自动讲解，不要求选择图片用途 | 不添加图中条件 |
| 清晰必要题图 | 必要题图及事实可靠 | 自动讲解并保留证据 | 不额外调用模型 |
| 必要题图模糊 | affectsSolving=true，相关性或事实置信度不足 | 保留澄清入口 | 不直接用可疑条件继续 |
| 识别失败 | 接口失败或没有 recognized 结果 | 显示原有错误及重试 | 不继续分析 |

</frozen-after-approval>

## Code Map

- `components/education-chat-app.tsx` -- 图片识别完成后决定是否进入分析。
- `lib/learning/problem-evidence.ts` -- 必要题图澄清条件及证据处理。
- `tests/problem-evidence.test.ts` -- 图文证据与澄清条件回归。
- `components/learning-chat.tsx` -- 现有异常确认入口；普通流程不再触达。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/problem-evidence.ts` -- 将澄清触发限制为解题必需且不可靠的题图信息。
- [x] `components/education-chat-app.tsx` -- 删除独立的文字置信度确认拦截，复用必要题图判定。
- [x] `tests/problem-evidence.test.ts` -- 覆盖矩阵中的正常与异常分支，保持图文证据不变。
- [x] `functions/learning-api/dist/` -- 构建同步并确认本地服务可用。
- [x] `lib/learning/providers/problem-image-analysis.ts` -- 同步收窄后端复核低分拦截，避免辅助插图在后续阶段被再次阻断。

**Acceptance Criteria:**
- Given 普通文字题识别成功，when 识别流程结束，then 不出现整页确认，直接开始讲解。
- Given 必要题图标注不清，when 判断下一步，then 不用不可靠条件直接解题。
- Given 用户确认必要澄清，when 继续学习，then 保持既有图文传递及讲解流程。

## Spec Change Log

- 复核发现后端对非必要图片仍以低置信度拒绝求解；作为同一规则的遗漏同步修正，不改变已批准范围。保留必要题图低分拦截和用户确认事实保护。

## Design Notes

置信度本身不是让学生停下来的充分理由。此次只收窄会打断流程的条件，不删除异常处理，也不宣称自动识别绝对准确。

## Verification

- `npm test -- --run tests/problem-evidence.test.ts` -- 正常与异常题图分支通过。
- `npm run typecheck`、`npm run lint`、`npm test` -- 无类型、规范及学习流程回归。
- `npm run build:function` -- 本地后端产物同步。
- 浏览器验证普通文字截图直接讲解、必要题图不可靠时保留澄清；无法执行真实模型场景时如实标注。

**实际验证：** 全量 27 文件、497 测试通过，typecheck、lint、函数构建和 diff 检查通过。本地 3000/9000 开发服务已启动，后端健康检查成功。未执行真实模型浏览器端到端测试，不将单元/契约测试等同于浏览器验收。

## Suggested Review Order

- 普通识别结果直接进入讲解。
  [education-chat-app.tsx:271](../../../components/education-chat-app.tsx#L271)
- 仅必要题图的不确定条件触发澄清。
  [problem-evidence.ts:35](../../../lib/learning/problem-evidence.ts#L35)
- 后端复核采用相同边界。
  [problem-image-analysis.ts:37](../../../lib/learning/providers/problem-image-analysis.ts#L37)
- 回归覆盖正常放行、必要澄清与阈值边界。
  [problem-evidence.test.ts:1](../../../tests/problem-evidence.test.ts#L1)
