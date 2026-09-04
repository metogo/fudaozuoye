---
title: '完整讲解按需输出与截断续写'
type: 'bugfix'
created: '2026-09-04'
status: 'done'
baseline_commit: 'f30047e48d04fcb1ee0d50c405b6f0f05697e5b1'
---

<frozen-after-approval>
## Intent

完整讲解被本地固定的 3200 token 限制截断，原样重试仍可能失败。移除完整讲解的显式 token 和汉字配额，交由下游模型正常结束。对明确的额度截断最多续写一次，保持已显示正文，不重新播放。

## Boundaries

保留其他请求额度、超时和安全长度保护、学段引导与完整性验收。保留用户工作区全部无关改动，不提交、不部署。不更换模型、不增加依赖。下游仍有默认上限，不能宣称无限输出。用户已授权直接实现，无需再次审批。

## Acceptance

- Given 完整讲解请求，when 构造请求体，then 不发送 max_tokens/max_output_tokens；其他请求保持原额度。
- Given 明确长度截断且有已输出正文，when 续写，then 携带原题与完整前文仅生成后续内容，不清空正文，最多续写一次。
- Given 非长度错误、用户取消、无正文截断或第二次截断，when 处理，then 不无界重试或假报完成。
- Given 续写完成，when 交付，then 仍校验全文结构、各小问与公式闭合。
- Given Responses incomplete 非额度原因，when 处理，then 不误报长度截断。

</frozen-after-approval>

## Code Map / Tasks

- [x] lib/learning/providers/model-support.ts：允许显式省略额度；将长度截断识别为结构化错误；删除固定字数要求。
- [x] lib/learning/providers/adapter.ts：传递可省略额度，保持其他调用默认值。
- [x] lib/learning/providers/solution.ts：移除固定额度；有界续写与累计保护。
- [x] tests：请求体、续写、取消、二次截断、非长度错误与正常结束回归。

## Verification

运行测试、类型检查、lint、函数构建；独立审查。真实模型调用若不可用，明确说明不作为通过证据。

实际验证：515 项测试通过；typecheck、lint、build:function、diff 检查通过。真实豆包高中三小问样本成功，最终 4130 字符，97.97 秒，2 次调用、1 次既有内容验收重写，均未发送输出配额。该真实样本不证明额度续写分支；该分支由双协议模拟截断测试覆盖。

## Review Notes

- 边界审查发现跨调用累计超限时需关闭上游响应，已在流请求清理阶段 abort，增加回归测试。
- 验收审查无新增阻塞；盲审核对项已确认：末尾 delta 先保存再抛截断，错误码在抛出与捕获处一致。
- 首次请求原有尾部超时恢复策略不在本轮修改范围；本轮续写失败严格报错。
- 续写仍依赖模型遵守不重复前文指令，并非语义去重保证；下游服务仍保留其默认额度。

## Suggested Review Order

- 仅完整讲解省略配额及一次续写。
  [solution.ts:65](../../lib/learning/providers/solution.ts#L65)
- 按协议区分长度截断和其他不完整原因。
  [model-support.ts:188](../../lib/learning/providers/model-support.ts#L188)
- 额度请求与异常边界测试。
  [solution-output-limit.test.ts:20](../../tests/solution-output-limit.test.ts#L20)
- 可重复运行的真实模型样本。
  [verify-solution-output.mjs:1](../../scripts/verify-solution-output.mjs#L1)
