---
title: '移动端多方式作答与提问'
type: 'feature'
created: '2026-08-29'
status: 'done'
baseline_commit: 'cc0ca25cf34af996e2e09290bbb7639218e91651'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 手机端学生只能依赖键盘输入，公式、步骤、草图与纸面作答难以自然提交；一旦模型流格式异常，底层英文错误还会直接打断学习。

**Approach:** 在同一 Chat Flow 的底部输入区提供键盘、白板、拍照三种方式。白板使用 `react-sketch-canvas`，拍照复用灵活裁切；图片只在当前请求中识别或回答，现有 Gate、SSE 与学习进度保持不变。

## Boundaries & Constraints

**Always:** 选择题继续直接点选；简答 Gate 才展示多方式作答。图片提问回答后回到原 Gate，图片作答识别后沿用统一验收。低置信度必须要求学生核对。白板和照片不写入持久化存储。所有失败都保留当前任务并给出可恢复中文提示。

**Ask First:** 更换白板库、增加云端图片存储或第三方 OCR 服务。

**Never:** 不用图片输入绕过 Gate；不因 OCR 结果自动补全或纠正学生答案；不把模型、JSON、协议等内部错误暴露给学生。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 白板作答 | 简答 Gate + 手写步骤 | 导出清晰 PNG，识别后进入原验收 | 低置信度保留 Gate，要求键盘核对 |
| 白板提问 | 非作答 Gate + 圈画疑问 | 结合原题与图片流式回答，随后回到当前任务 | 流异常保留图片与进度，可一键重试 |
| 拍照作答 | 相机图片 | 四角裁切后进入统一图片作答 | 非图片、超限或识别失败给出中文提示 |
| 选择题 | 带选项 Gate | 只显示选项，不展示多方式工具 | 服务端拒绝未展示答案 |

</frozen-after-approval>

## Code Map

- `components/learning-chat.tsx` -- 底部键盘、白板、拍照入口与 Gate 可见性。
- `components/whiteboard-input.tsx` -- 全屏移动白板、编辑与 PNG 导出。
- `components/image-cropper.tsx` -- 相机图片四角裁切。
- `components/education-chat-app.tsx` -- 图片消息、重试与 SSE 状态编排。
- `lib/learning/http/turn.ts` -- 图片回合解析、Gate 校验和领域能力调度。
- `lib/learning/providers/adapter.ts` -- 图片追问及学生原文识别。
- `lib/learning/providers/model-support.ts` -- 上游 JSON/纯文本 SSE 兼容。

## Tasks & Acceptance

**Execution:**
- [x] `components/whiteboard-input.tsx` -- 增加移动白板、画笔/橡皮、撤销/重做/清空与导出。
- [x] `components/learning-chat.tsx`、`components/education-chat-app.tsx` -- 将三种输入接入同一学习 Flow，并保留图片重试。
- [x] `components/image-cropper.tsx` -- 支持四角独立拖动及键盘微调。
- [x] `lib/learning/http/turn.ts`、`lib/learning/providers/*` -- 实现临时图片提问/作答、识别置信度和双格式 SSE。
- [x] `tests/*` -- 覆盖入口、裁切、Gate 保留、低置信度、流格式与重试。
- [x] 构建、全量测试、云函数与静态站点部署，并完成线上冒烟。

**Acceptance Criteria:**
- Given 学生处于简答任务，when 选择键盘、白板或拍照，then 三种输入均留在当前 Chat 且进入同一 Gate 验收。
- Given 学生用图片发问，when AI 回答完成，then 当前学习任务不推进也不丢失。
- Given 图片识别把握不足或上游流异常，when 请求结束，then 页面不出现技术错误并可保留原输入重试。
- Given 学生处于选择题，when 查看输入区，then 只需点击已展示选项。

## Spec Change Log

## Design Notes

白板是移动输入能力，不是新的学习页面。图片仅用于当前模型请求；会话持久化只保留文本和结构化学习状态。

## Verification

**Commands:**
- `npm run typecheck` -- 类型检查通过。
- `npm run lint` -- 无 ESLint 错误。
- `npm test` -- 全量单元与契约测试通过。
- `npm run build && npm run build:function` -- 前端与云函数构建通过。

**Result:** 15 个测试文件、172 项测试通过；前端与云函数构建成功；CloudBase `fudaozuoye-026` 已上线。真实线上流程已验证图片提问逐字 SSE、Gate 保留与图片作答识别/验收。
