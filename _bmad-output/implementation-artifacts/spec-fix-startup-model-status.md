---
title: '修复首页模型状态误报'
type: 'bugfix'
created: '2026-08-27'
status: 'done'
route: 'one-shot'
---

# 修复首页模型状态误报

## Intent

**Problem:** 首页同时请求监护人同意和模型状态；模型状态请求一旦受跨域或瞬时网络影响，就会在用户尚未操作时弹出“暂不能开始识别”，并错误阻断拍照入口。本地旧启动命令还只启动 H5、没有启动学习 API，导致即使 `.env.local` 已正确配置也必然失败。

**Approach:** 将模型能力状态合并进必需的监护人同意响应，首页只进行一次启动请求；仍由服务端提供真实可用性和演示模式，不用客户端假状态兜底。本地 `npm run dev` 同时启动 H5 与学习 API，并由 API 读取项目根目录的 `.env.local`。

## Suggested Review Order

**启动链路**

- 首页用一次请求同时取得会话凭证和真实模型状态。
  [`learning-app.tsx:43`](../../components/learning-app.tsx#L43)

- 拍照入口只在豆包确实可用后开放。
  [`learning-app.tsx:268`](../../components/learning-app.tsx#L268)

**服务端契约**

- 同意响应携带服务端计算的模型能力，避免两次跨域请求。
  [`consent.ts:5`](../../lib/learning/http/consent.ts#L5)

- 回归测试锁定“同意与模型状态同次返回”的契约。
  [`session-security.test.ts:7`](../../tests/session-security.test.ts#L7)

**本地启动**

- 单一命令构建并启动本地学习 API 和 H5，等待 API 就绪后再开放网页服务。
  [`dev-local.sh:1`](../../scripts/dev-local.sh#L1)

- 开发脚本从根目录 `.env.local` 读取真实模型配置；文件缺失时才进入 Mock 模式。
  [`package.json:10`](../../package.json#L10)
