---
title: '本地环境变量热更新'
type: 'bugfix'
created: '2026-09-05'
status: 'done'
baseline_commit: '7023c6aabf813278a1c873e41342bb54b386f37c'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `npm run dev` 虽然会热更新页面和学习 API 代码，但 API 子进程只在启动时读取 `.env.local`。修改图片模型 ID 等环境变量后，运行中的 `/api/consent` 仍返回旧配置，必须手工重启整套服务。

**Approach:** 让本地开发监督脚本监听 `.env.local` 的内容变化；变化后先用现有规则校验文件，再只重启需要重新读取环境的 API 子进程。Next.js 继续使用自身的环境文件刷新机制，不额外启动重复前端进程。

## Boundaries & Constraints

**Always:** 监听文件内容而非输出变量值；支持编辑器原地保存和原子替换文件；成功变更后 API 自动重启并通过健康检查；配置校验失败时保留当前仍可用的 API，输出不含密钥的错误说明，后续修正仍可再次触发；退出开发命令时继续清理所有子进程和临时文件。

**Ask First:** 改变生产部署环境变量更新方式；引入额外文件监听依赖；监听 `.env.local` 以外的密钥文件。

**Never:** 把变量内容、API Key 或 Secret 打印到终端；因一次无效编辑直接终止整套开发服务；通过轮询外部模型接口判断环境变化；修改或提交 `.env.local`。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| 有效修改 | 修改并保存 `.env.local` | 一秒级检测、校验并重启 API，新请求读取新配置 | 重启失败时明确退出，避免假装已热更 |
| 原子保存 | 编辑器以新文件替换旧文件 | 仍能通过内容指纹识别变化 | 不依赖原 inode 或单一 mtime |
| 无效修改 | 缺少必需变量或模式值不合法 | 旧 API 继续服务，不泄露变量值 | 记录本次无效版本；再次修正后重新校验 |
| 暂时删除 | 保存过程中 `.env.local` 短暂不存在 | 当前服务保持运行并等待文件恢复 | 只报告安全的缺失提示 |
| 代码与环境同时变化 | 函数编译产物和环境文件均更新 | 合并为一次 API 重启并加载最新两者 | 健康检查仍是最终成功条件 |

</frozen-after-approval>

## Code Map

- `scripts/dev-local.sh` -- 启动、监控、健康检查和重启本地 API/Next.js 子进程。
- `README.md` -- 本地开发热更新能力和失败行为说明。
- `.env.local` -- 被监听但必须保持忽略、不得读取到日志或提交。

## Tasks & Acceptance

**Execution:**
- [x] `scripts/dev-local.sh` -- 抽取可复用的环境校验，增加安全内容指纹监听，并协调代码与环境变更只重启一次 API。
- [x] `README.md` -- 说明 `.env.local` 保存后 API 自动重新读取，以及无效配置不会替换当前进程。
- [x] 运行态回归 -- 在不展示真实变量的前提下，增删无值测试注释并确认 `/api/consent` 可用性自动变化，再恢复用户配置。

**Acceptance Criteria:**
- Given `npm run dev` 正在运行，when 用户保存有效的 `.env.local`，then 无需手工重启即可让随后 API 请求读取新变量。
- Given 保存的环境文件暂时无效，when 监督脚本检测到变化，then 当前健康 API 保持运行，并在文件修正后自动完成热更新。
- Given 环境和函数代码几乎同时变化，when 两种监听均触发，then API 只执行一次可验证的重启且加载两类最新内容。

## Spec Change Log

## Design Notes

使用文件内容校验和生成不透明指纹，避免只依赖 mtime 而漏掉原子保存；指纹仅用于比较，绝不写出到日志。API 进程必须重启才能读取新的 Node 环境变量，Next.js 开发服务器则保留框架自带的 `.env.local` 刷新行为。

## Verification

**Commands:**
- `sh -n scripts/dev-local.sh` -- Shell 语法通过。
- `npm run typecheck && npm run lint && npm test` -- 现有应用回归通过。
- `npm run dev` -- 环境文件有效变化后出现一次安全的热更新提示，API 健康检查返回成功。

**Observed runtime:**
- `.env.local` 增删无值注释分别触发一次 API 热重载；恢复后插画能力仍返回 `available: true`。
- 父进程显式导出空图片模型 ID 时，隔离端口启动仍以 `.env.local` 为准并返回 `available: true`。
- 环境注释与函数产物近同时变化时，日志只出现一次“合并热重载”。

**Manual checks (if no CLI):**
- 保存有效、无效、删除后恢复三类环境文件，确认服务行为与矩阵一致且终端不出现变量值。

## Suggested Review Order

**环境加载边界**

- 让环境文件覆盖父终端同名应用变量，同时保留监督进程变量。
  [`dev-local.sh:62`](../../scripts/dev-local.sh#L62)

- 校验不可变私有快照，避免保存中途读取半份配置。
  [`dev-local.sh:79`](../../scripts/dev-local.sh#L79)

**变更检测与重启**

- 用 SHA-256 内容指纹识别原地保存和原子替换。
  [`dev-local.sh:39`](../../scripts/dev-local.sh#L39)

- 用稳定窗口合并近同时发生的代码与环境变化。
  [`dev-local.sh:225`](../../scripts/dev-local.sh#L225)

- 只用已校验快照启动 API，并保留现有健康检查。
  [`dev-local.sh:119`](../../scripts/dev-local.sh#L119)

**使用说明**

- 说明环境热更新及无效配置下的保底行为。
  [`README.md:13`](../../README.md#L13)
