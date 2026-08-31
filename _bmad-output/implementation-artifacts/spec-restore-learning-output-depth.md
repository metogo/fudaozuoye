---
title: 恢复学习输出深度与结构
status: done
route: one-shot
context: []
---

# 恢复学习输出深度与结构

## Intent

修复“查看完整讲解”退化为短解释的问题，并审计教育 Chat 的全部模型输出。完整讲解必须包含解题思路、完整分步推导、结论和易错提醒；普通引导、自由追问和补救保持只讲当前一步，但必须解释因果、给出具体例子并使用清晰 Markdown 层次。全部公式继续使用 KaTeX 兼容语法，流式中断、截断或空响应不能推进学习状态。

## Suggested Review Order

1. [完整讲解生成与学习状态](/Users/fanhua/Documents/Codex/2026-08-25/wo-f/lib/learning/http/turn.ts)
2. [完整讲解质量判定](/Users/fanhua/Documents/Codex/2026-08-25/wo-f/lib/learning/solution-quality.ts)
3. [模型提示与流式完整性](/Users/fanhua/Documents/Codex/2026-08-25/wo-f/lib/learning/providers/model-support.ts)
4. [普通讲解结构](/Users/fanhua/Documents/Codex/2026-08-25/wo-f/lib/learning/providers/tutor.ts)
5. [旧解答接口一致性](/Users/fanhua/Documents/Codex/2026-08-25/wo-f/lib/learning/http/solution.ts)
6. [真实用户回归](/Users/fanhua/Documents/Codex/2026-08-25/wo-f/scripts/real-user-e2e.mjs)
7. [学习回合测试](/Users/fanhua/Documents/Codex/2026-08-25/wo-f/tests/learning-turn.test.ts)
8. [供应商流式契约](/Users/fanhua/Documents/Codex/2026-08-25/wo-f/tests/provider-contract.test.ts)
