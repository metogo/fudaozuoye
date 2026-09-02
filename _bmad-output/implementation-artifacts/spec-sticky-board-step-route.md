---
title: 板书步骤栏滚动吸顶与当前步骤激活
type: refactor
created: 2026-09-02
status: done
route: one-shot
context: []
---

# 板书步骤栏滚动吸顶与当前步骤激活

## Intent

删除重复板书正文的顶部总览卡，只保留承担阅读定位作用的步骤栏。步骤栏在默认状态处于正常文档流，滚动到顶部后吸顶，并依据当前阅读位置激活对应步骤。

## Experience Contract

- 不展示学科、步骤数量、板书摘要和“学完”目标等重复总览信息。
- 五步标题统一为 3—4 个字，不出现 5 个字及以上的短标题。
- 默认态使用轻量连接轨道、清晰编号和单行步骤名，不再形成一张额外信息卡。
- 吸顶态仅突出当前步骤；320px 宽度下五步全部可见且无横向滚动。
- 旧板书缺失角色信息时，各步骤仍有可区分的短标题。

## Verification

- 浏览器实测 320×720：默认态五步单行，轨道宽度与滚动宽度均为 284px；无顶部总览卡。
- 浏览器实测滚动 900px：步骤栏顶部与滚动区域顶部均为 69px，当前步骤正确激活。
- `npm test`：363/363 通过。
- `npm run typecheck`、`npm run lint`、`npm run build:function`、`npx next build --webpack`、`git diff --check` 均通过。
- 独立代码复审未发现阻断问题。

## Suggested Review Order

1. `components/board-workspace.tsx`：步骤栏结构、吸顶和当前步骤计算。
2. `lib/learning/board-step-copy.ts`：3—4 字步骤文案与旧板书兼容。
3. `app/board-course.css`：默认轨道与吸顶态视觉。
4. `tests/board-step-copy.test.ts`、`tests/rich-learning-text.test.ts`：文案和结构约束。
