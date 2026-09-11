## 全题型可靠性要求

- 可靠性验收面向每一道题、所有支持学科和学段，不能以单道样例跑通、单测数量或某个题型可用代替整体结论。
- 可选功能（小实验、知识图谱、导出、划词等）必须独立隔离加载、渲染和异步请求故障；失败不能移除主讲解、锁死输入、清空原题或改变学习关卡。
- 可选资源加载必须有有界等待、明确失败状态和局部重试；不能靠刷新整个页面恢复，不能无限自动重试，不能把失败伪装成完成。
- 所有题都要保持主流程可用，不等于所有题都强行生成实验或配图。不支持、条件不足、模型置信度不足时，明确边界，保留原有教学路径，不虚构图形或题目条件。
- 交付前覆盖跨学科/学段、正常/失败/中断/重试、重复操作、新题切换，并确认上下文不串题、作答不误判。未经生产压测和持续观测，不承诺全部题目零失败或具体可用率。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
