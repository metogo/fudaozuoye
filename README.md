# AI 学习教练 H5

面向学生自主学习的引导式学习 Chat。支持文字、拍照、相册和白板发题，AI 在同一对话中讲核心思路、处理卡点、补充前置知识，并以学生独立完成原题作为学习完成标准。

## 启动

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` 会同时启动 H5（`http://localhost:3000`）和本地学习 API（`http://localhost:9000`），并自动读取项目根目录的 `.env.local`。Next.js 负责页面热更新，本地 API 会在 TypeScript 编译后自动重启。

如果 `.env.local` 缺失，启动会在监听端口前直接失败，不会默认进入演示模式。`AI_MOCK_MODE` 也必须在 `.env.local` 中显式设为 `true` 或 `false`。

## 演示模式

将 `AI_MOCK_MODE=true` 可使用内置代表题验证确定性学习流程。启动后可在文字输入框粘贴下面这道内置小学数学题：

```text
一辆车 3 小时行驶 180 千米，照这样的速度，5 小时行驶多少千米？
```

演示模式不支持自定义文字题，也不支持上传或拍摄自定义题目图片；请求会明确返回限制说明，不会把内置固定题当成识别结果。需要识别真实题目时，请切换到真实模型模式。

自动化测试通过 `vitest.config.ts` 显式启用 Mock，测试代码可直接构造内置代表题，无需真实模型密钥。

## 真实模型

将 `AI_MOCK_MODE=false`，填写 `DOUBAO_API_KEY` 和至少一个轻度模型 ID 后再运行 `npm run dev`。三档推理强度对应以下火山方舟推理接入点/模型 ID：

```bash
# 轻度（当前默认）
DOUBAO_MODEL_ID=
# 中
DOUBAO_MODEL_ID_MEDIUM=
# 高
DOUBAO_MODEL_ID_HIGH=
```

前端只显示“轻度 / 中 / 高”，不显示模型或供应商名称。没有配置模型 ID 的强度会保持不可选，不会静默借用其他档位；开始分析后，本题的推理强度和模型 ID 都会锁定。

项目已提供本地文件 `.env.local`，可直接填值；该文件已被 `.gitignore` 排除。生产环境还必须设置至少 32 位随机 `SESSION_STATE_SECRET`，用于加密浏览器保存的无数据库会话。客户端只能看到题目，不会收到标准答案或可篡改的掌握状态。

图片仅在当前请求内转发，不写入对象存储、数据库或日志；浏览器只在当前标签页的 `sessionStorage` 保存结构化单题进度，服务端不持久化题目正文或学生作答。

知识图、判题和迁移题必须先通过结构校验再整体渲染；原题完整解答属于自由文本，使用 SSE 从供应商流式透传到浏览器。结构化响应不合法时，只调用同一模型修复一次，不会静默换模。

## 验证

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## CloudBase 部署

静态 H5 发布到 `/fudaozuoye`，实时接口由同环境的 HTTP 云函数 `learning-api` 承接，并通过 `/api` 网关访问；这样拍照、状态校验和 SSE 均保持同源。

```bash
npm run build:function
tcb fn deploy learning-api --dir functions/learning-api --httpFn
tcb app deploy fudaozuoye --env-id mini-0324-100046523669-03b06729f --framework next --build-command "npm run build:cloudbase" --output-dir out --deploy-path /fudaozuoye --enable-git-ignore
```

不要将模型密钥放到静态应用的构建变量。请只在 `learning-api` 云函数环境变量中设置 `DOUBAO_API_KEY`、`DOUBAO_MODEL_ID`、`DOUBAO_MODEL_ID_MEDIUM`、`DOUBAO_MODEL_ID_HIGH`、`DOUBAO_BASE_URL` 和至少 32 位的 `SESSION_STATE_SECRET`；本仓库不保存这些值。
