---
title: '修复讲解复制：可读文本与原样图片'
type: 'bugfix'
created: '2026-09-04'
status: 'in-review'
baseline_commit: 'f30047e48d04fcb1ee0d50c405b6f0f05697e5b1'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 真实 Chrome 复制后粘贴到 macOS 文本编辑，MathML 公式被拆成逐字换行，分数与上下标损坏；此前导出结构测试不能证明用户可用。

**Approach:** 完成后的右侧复制入口提供“复制文本”和“复制图片”。文本保留可编辑内容、段落及列表，以无歧义的线性表达呈现公式；图片保留页面正文与公式的视觉排版。两种结果分别反馈，不互相冒充成功。

## Boundaries & Constraints

**Always:** 只复制当前已完成正文，不含操作按钮、建议问题和流式标记。保留已有未提交改动，不提交。转换在用户浏览器内完成，不上传讲解，不调用模型。图片生成按需执行，不占用输出收尾阶段。

**Ask First:** 新增正文转图片依赖 html-to-image 须用户批准；其他依赖、服务、自动拆成多张图或改变复制范围也须确认。

**Never:** 不再直接导出 MathML 给通用文档应用；不声称可编辑文本与所有应用中的页面展示完全一致；不截断正文、不生成低清图片后假报成功，不改题目或讲解内容。

## I/O & Edge-Case Matrix

| 场景 | 输入 | 预期 | 异常处理 |
|---|---|---|---|
| 文本 | 标题、列表、公式 | 可编辑文本；如 x³、(S₁₁ − S₈) / S₅ | 不支持的公式结构保留明确的源表达，不拼接成错误含义 |
| 图片 | 完成后的正文 | 白底清晰 PNG，包含完整内容 | 字体或渲染失败明确提示 |
| 超长/超宽 | 长讲解、宽公式 | 先检查完整边界与像素预算 | 超限明确说明，不裁剪和静默缩成不可读图片 |
| 权限 | 剪贴板拒绝/不支持图片 | 显示失败，可重试 | 不自动改成另一种复制、不假报成功 |
| 生成中 | streaming/finishing/error | 不提供完成态复制 | 保持原有流式反馈 |

</frozen-after-approval>

## Code Map

- `components/copyable-learning-text.tsx`：完成态、菜单、反馈及正文引用。
- `lib/learning/copy-rich-text.ts`：当前正文导出及剪贴板写入，需移除通用 MathML 输出。
- `components/rich-learning-text.tsx`：现有公式渲染来源，保持页面展示不变。
- `tests/copy-rich-text.test.ts`、`tests/rich-learning-text.test.ts`：现有测试入口。

## Tasks & Acceptance

**Execution:**
- [ ] `lib/learning/copy-math-text.ts`：独立转换公式树，覆盖分数、根式、上下标、矩阵及分段结构，保留优先级。
- [ ] `lib/learning/copy-rich-text.ts`：文本和富文本使用相同可读公式；保留标题、列表、代码缩进与原编号。
- [ ] `lib/learning/copy-learning-image.ts`：按需生成图片，嵌入公式字体、排除控件、检查尺寸、释放临时资源。
- [ ] `package.json`、`package-lock.json`：获批后加入 html-to-image，按需加载。
- [ ] `components/copyable-learning-text.tsx`：一个入口两个选项；键盘可用、外点/Escape关闭；生成中禁止重复点击。
- [ ] `tests/copy-rich-text.test.ts` 及新增公式/图片测试：覆盖正常、权限、异常、超限和状态切换。

**Acceptance Criteria:**
- Given 含公式讲解，when 复制文本并粘贴到系统文本编辑，then 没有逐字换行、重复公式或丢失数学关系。
- Given 同一讲解，when 复制图片并粘贴到支持图片的本机应用，then 标题、列表、公式与首尾内容完整清晰。
- Given 长讲解和窄屏，when 复制，then 不遮挡正文、不产生裁剪，不能输出时明确失败。
- Given 剪贴板失败，when 点击选项，then 只有失败提示而无成功提示。

## Spec Change Log

- 2026-09-04：实际粘贴发现隐藏MathML误触宽度检测与转换库字号取整造成下标拆行；排除辅助树、精确保留字号并阻止公式内部换行。审查发现复合底数、组合数、特殊字形变义；改为结构化分组或完整源公式回退。图片增加快照、字体解码校验及30秒生成期限。

## Design Notes

html-to-image 提供 DOM 到 PNG 能力并支持字体嵌入；它不是跨应用兼容性保证。必须验证 KaTeX 字体、长文和宽公式。公式线性转换以现有 MathML 树为输入，但不把 MathML 本身交给粘贴应用。复杂表达宁可明确保留源表达，也不做改变数学含义的美化。

## Verification

- `npm run typecheck`、`npm run lint`、`npm test`、`git diff --check` 均通过。
- 真实浏览器点击功能后，用系统快捷键粘贴到本机文本编辑及图片接收应用，检查结果截图和首尾内容；不得以模拟剪贴板单测代替。
- 移动宽度和桌面宽度分别检查入口；验证分式、矩阵、根号、嵌套列表和长文。未验证的目标应用明确列为限制。

## Actual Verification

- 已实际在独立Chrome页面点击“复制文本”，用系统快捷键粘贴到macOS文本编辑。标题、段落、列表、分式线性表达和结尾均保留，无逐字换行。
- 已实际复制图片并粘贴到macOS文本编辑，检查图首与图尾；修正后根号、分数、多位下标、矩阵和结尾正常，无操作按钮。正文生成是本地行为。
- 286px宽、2917px高、80处公式的长图验收尚未通过：浏览器自动化点击超时后停在生成提示，随后系统窗口工具长时间阻塞；不能把此结果视为长图成功。状态保留in-review。
- 三路代码审查的已确认问题已修复；全量540项测试、typecheck、lint通过（随后补充写入挂起时仍反馈渲染失败回归测试）。
- 临时开发验收页面已删除；未提交。系统文本编辑中的验收文稿未删除，避免擅自删除本机文档。未验证Word、微信及手机浏览器的实际粘贴。
- 全局finalizer仍受此前写入权限限制，本次未绕过。

## Suggested Review Order

- 完成态复制入口及反馈
  [copyable-learning-text.tsx:14](../../components/copyable-learning-text.tsx#L14)
- 公式转换保持数学含义
  [copy-math-text.ts:1](../../lib/learning/copy-math-text.ts#L1)
- 图片快照、字体与生成边界
  [copy-learning-image.ts:1](../../lib/learning/copy-learning-image.ts#L1)
- 失败状态回归测试
  [copy-learning-image.test.ts:1](../../tests/copy-learning-image.test.ts#L1)
