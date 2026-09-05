---
title: '防止演示模式把固定样题冒充新题'
type: 'bugfix'
created: '2026-09-05'
status: 'done'
baseline_commit: 'd7a8e95efc996d13ea916c668e12b4fe9496bfa2'
context:
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 本地服务缺少 `.env.local` 时静默启用 Mock；Mock 图片识别忽略用户图片，固定返回“小学数学车速题”。因此菜园题图片仍显示在页面，服务端会话却属于车速题，首讲异常迅速并出现“3 小时行驶 180 千米”。

**Approach:** 让 Mock 只能显式启用：缺少配置时启动失败并给出指引；demo 模式拒绝真实图片，不再伪装识别成功。内置样题仅供自动化测试和明确的演示入口使用。

## Boundaries & Constraints

**Always:** 图片与 `session.problem` 必须来自同一次真实识别；`AI_MOCK_MODE=true` 必须显式设置；demo 错误须说明限制和真实模式配置方法；live 模式继续支持常驻、编译监听和 API 自动重启。

**Ask First:** 修改生产模型、CloudBase 环境或模型路由；读取或提交真实密钥；取消 Mock；引入新服务。

**Never:** 将固定样题作为用户图片的识别结果；配置缺失时静默降级；把密钥写入仓库；用缓存清理或无证据的会话重写掩盖根因。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| 真实本地开发 | 显式 live 且轻度模型配置完整 | 常驻启动；图片进入真实识别 | 配置不完整则启动前失败 |
| 缺少本地配置 | 不存在 `.env.local` | 不监听端口、不进入 demo | 提示复制 `.env.example` |
| 显式演示 | `.env.local` 设置 `AI_MOCK_MODE=true` 后上传任意图片 | 不产生 `recognized`/`graph` 事件，不创建固定样题会话 | 返回清晰的“演示模式不支持自定义图片”错误 |
| 内置测试样题 | 测试代码直接构造 Mock 题 | 保留确定性学习流 | 不向上传接口暴露固定识别 |
| 连续真实题 | live 模式先后提交两题 | 题干和 `requestId` 分离 | 失败不回退固定题 |

</frozen-after-approval>

## Code Map

- `scripts/dev-local.sh` -- 移除缺文件即 Mock 的静默降级。
- `lib/learning/providers/config.ts` -- 将 Mock 改为显式 opt-in。
- `lib/learning/providers/mock-adapter.ts`、`lib/learning/http/analyze.ts` -- 在图片识别边界拒绝 demo 伪结果。
- `.env.example`、`README.md` -- 说明 live/demo 配置与图片限制。
- `.env.local`（Git 忽略）-- 用户可直接填写的本机变量模板。
- `tests/` -- 覆盖配置默认值、demo 图片拒绝和跨题隔离。

## Tasks & Acceptance

**Execution:**
- [x] `scripts/dev-local.sh`、`config.ts` -- 缺配置快速失败，Mock 仅显式启用，并保留热更新生命周期。
- [x] `mock-adapter.ts`、`analyze.ts` -- demo 图片 fail-closed，不发送伪识别事件。
- [x] `.env.local`、`.env.example`、`README.md` -- 创建本机空白模板并更新两种模式与限制。
- [x] `tests/` -- 锁定缺省配置、demo 图片拒绝及不同题目的会话隔离。

**Acceptance Criteria:**
- Given 菜园题图片和 demo 模式，when 请求识别，then 只显示演示限制，不出现“3 小时”“180 千米”或固定样题会话。
- Given 没有 `.env.local`，when 运行 `npm run dev`，then 进程以非零状态退出并给出配置操作，不留下 3000/9000 监听进程。
- Given 完整 live 配置，when 连续提交两题，then `problem.text`、`requestId` 和讲解证据彼此隔离。
- Given 显式 Mock 单元测试，when 使用内置代表题入口，then 原有确定性学习流程仍可验证，不需要真实模型密钥。

## Spec Change Log

- 2026-09-05：用户批准后要求重新创建 `.env.local`；已增加 Git 忽略的无密钥模板，真实值仍由用户填写。

## Design Notes

Mock 是开发工具，不是降级答案源。确定性样题由测试直接构造；上传接口采用 fail-closed。启动脚本与 provider 配置做双重防线，避免绕过脚本时因开发环境自动进入 demo。

## Verification

**Commands:**
- `npm run typecheck` -- 类型检查通过。
- `npm test` -- provider、HTTP、会话隔离及全量回归通过。
- `npm run lint` -- 静态检查通过。
- `npm run build:function` -- 云函数编译通过。
- `env -u AI_MOCK_MODE sh scripts/dev-local.sh` -- 缺少配置时快速失败且无残留进程。

**Manual checks:**
- demo 上传菜园题时明确拒绝且不显示车速题；用户配置 live 密钥后连续上传两题，首讲只引用当前题且热更新有效。

**Results:**
- `npm run typecheck`、`npm run lint`、`npm run build:function` 均通过。
- `npm test`：32 个测试文件、545 项测试全部通过。
- 空白 live `.env.local` 下 `npm run dev` 在监听前按预期失败，3000/9000 端口均无残留进程。

## Suggested Review Order

按启动防线、输入边界、回归证据与配置说明依次审查。

**启动安全**
- [`scripts/dev-local.sh:12`](../../scripts/dev-local.sh#L12) -- 监听端口前校验本地模式和真实模型必填项。
- [`lib/learning/providers/config.ts:19`](../../lib/learning/providers/config.ts#L19) -- Mock 仅在显式设置 `true` 时启用。

**输入边界**
- [`lib/learning/http/analyze.ts:32`](../../lib/learning/http/analyze.ts#L32) -- HTTP 层拒绝 demo 自定义题与图片。
- [`lib/learning/providers/mock-adapter.ts:12`](../../lib/learning/providers/mock-adapter.ts#L12) -- Mock 适配器复用统一限制消息并保护内置入口。

**回归证据**
- [`tests/analyze-mode-boundary.test.ts:9`](../../tests/analyze-mode-boundary.test.ts#L9) -- 证明 demo 图片不会产生固定车速题事件。
- [`tests/analyze-mode-boundary.test.ts:34`](../../tests/analyze-mode-boundary.test.ts#L34) -- 证明 live 连续两题的题干与请求标识相互隔离。
- [`tests/provider-contract.test.ts:13`](../../tests/provider-contract.test.ts#L13) -- 锁定 Mock 显式启用语义。

**运行配置**
- [`.env.example:1`](../../.env.example#L1) -- 可复制的本地变量模板。
- [`README.md:17`](../../README.md#L17) -- 演示入口、限制与真实模式启动说明。
