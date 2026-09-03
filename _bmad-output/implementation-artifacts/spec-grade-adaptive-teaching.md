---
title: 学段自适应教学表达
type: feature
created: 2026-09-02
status: done
baseline_commit: 7716343dae309cc9374436feaa2f51cb175c44e6
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 系统虽识别小学、初中、高中，但学生可见内容仍共用近似表达，低学段学生难以理解专业词、长句和高密度推导。

**Approach:** 建立统一学段表达契约；首次使用由用户选择小学、初中或高中，设备记住选择，首页可随时修改。题目识别只判断学科与知识内容，不再决定讲解难度。契约覆盖 Chat、完整讲解、板书、练习、推荐问题和反馈，并复用现有重写链路验收可重写内容。

## Boundaries & Constraints

**Always:** `primary / junior / senior` 是唯一事实源；开始第一道题前必须完成一次选择并保存到本机；小学短句、单点推进、先白话后术语，初中采用“术语 + 白话 + 分步依据”，高中使用规范术语与完整推导；尊重学生、不幼稚化；同一会话口径一致；保留 SSE、答案保护、证据和课程边界校验。

**Ask First:** 细分年级、引入年龄、外部可读性服务或改变学科学段支持矩阵。

**Never:** 用题目难度猜学生学段；仅追加“说简单点”；粗暴禁用必要术语；为简单而牺牲准确性或关键步骤；每道题重复确认学段。

## I/O & Edge Cases

- 首次使用：未保存学段时先选择一次，随后才能提交题目；选择后立即保存。
- 再次使用：首页读取已保存学段，不增加确认步骤；用户可在开始新题前修改。
- 会话：新会话锁定用户选择；合法旧会话继续使用其 `gradeBand`，不被设备偏好改写。
- 不支持组合：沿用现有学科学段归一规则，并明确显示实际采用的学段。
- 小学必要术语：先解释再使用；结构化内容和完整讲解不合格时触发一次重写，Tutor 保持流式。
- 高中内容：不得因易读化删除公式、条件或推导。

</frozen-after-approval>

## Code Map

- `lib/learning/grade-pedagogy.ts`：统一契约、提示片段、学段覆盖与质量检查。
- `components/learning-chat.tsx`、`components/education-chat-app.tsx`：首次选择、本机记忆、修改入口与会话锁定。
- `lib/learning/providers/*`：全部生成链路注入契约。
- `lib/learning/providers/board.ts`、`lib/learning/board-native-fallback.ts`、`lib/learning/board-subject-engine.ts`：板书按学段表达。
- `lib/learning/solution-quality.ts`：完整讲解学段验收。

## Tasks & Acceptance

- [x] 建立三档中央契约，清除分散表达规则。
- [x] 增加首次学段选择、本机记忆和首页修改入口；选择锁定整场会话。
- [x] 覆盖诊断、讲解、追问、推荐问题、相似/迁移题、反馈、完整讲解及板书。
- [x] 小学板书移除未解释的抽象教学元术语，保留学科必要术语与关键步骤。
- [x] 增加三学段、恢复/覆盖、重写及九学科代表测试。

**验收标准：**
1. 同一题三学段在术语解释、句长、步骤粒度和例子上有可验证差异，结论与依据一致。
2. 小学 Chat、板书、完整讲解和练习反馈无未解释的抽象元术语，不缺关键步骤。
3. 首次只选择一次；再次使用自动带出，修改后从下一道新题生效；题目识别不能覆盖用户选择。
4. 全量测试、类型、lint、函数构建和生产构建通过；SSE、答案保护、板书证据无回归。

## Verification

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build:function` · `npx next build --webpack` · `git diff --check`

## Suggested Review Order

**中央学段契约**

- 分离课程学段与学生学段，旧会话保持兼容。
  [`grade-pedagogy.ts:23`](../../lib/learning/grade-pedagogy.ts#L23)

- 三档提示、质量门禁与板书改写集中在单一事实源。
  [`grade-pedagogy.ts:31`](../../lib/learning/grade-pedagogy.ts#L31)

- 板书只改教学说明，保留题干证据与课程结构。
  [`grade-pedagogy.ts:101`](../../lib/learning/grade-pedagogy.ts#L101)

**用户选择与会话锁定**

- 本机记忆失败不再中断选择或删除旧进度。
  [`education-chat-app.tsx:74`](../../components/education-chat-app.tsx#L74)

- 新题选择立即生效，请求与重试读取同一学段。
  [`education-chat-app.tsx:168`](../../components/education-chat-app.tsx#L168)

- 必填单选语义明确，识题期间禁止改变学段。
  [`grade-band-picker.tsx:4`](../../components/grade-band-picker.tsx#L4)

**生成与验收链路**

- 诊断及教学节点同时注入契约并检查全部可见字段。
  [`adapter.ts:116`](../../lib/learning/providers/adapter.ts#L116)

- 完整讲解不合格时整篇重写一次，而非局部补丁。
  [`solution.ts:14`](../../lib/learning/providers/solution.ts#L14)

- 三档作答反馈保持不同粒度与术语密度。
  [`assessment.ts:119`](../../lib/learning/providers/assessment.ts#L119)

**课程边界与界面反馈**

- 不支持组合归一到实际可用课程学段。
  [`provider-validation.ts:81`](../../lib/learning/providers/provider-validation.ts#L81)

- 学习页明确显示当前采用的课程内容学段。
  [`learning-chat.tsx:173`](../../components/learning-chat.tsx#L173)

**回归证据**

- 覆盖三档差异、九学科板书、证据保真与重写。
  [`grade-pedagogy.test.ts:16`](../../tests/grade-pedagogy.test.ts#L16)
