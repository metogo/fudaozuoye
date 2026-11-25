# 小逗号 · 家庭错题本

React H5。首页直接展示错题，支持按学科与订正状态组合筛选，待订正题可直接重做。点「＋录题」可拍照圈题或粘贴老师发的题目，核对题干、参考答案和孩子原作答，沿用默认豆包或切换模型，按需展开提示。主动收录才计入错题本，独立重做后由家庭自评决定订正状态。题本使用当前浏览器的 IndexedDB，每次打开从实际存储读取。

## 随辅导作业运行

日常开发和发布从辅导作业仓库根目录执行，使用同域的 `/cuotiben/` 和 `/api/notebook`。题本首页可返回辅导作业。构建、接口配置和旧域名数据说明见[仓库说明](../README.md#同域错题本)。

## 单独运行错题本

使用 Node 24。安装锁定依赖后启动网页。

```sh
npm ci
npm run dev -- --port 43872 --strictPort
```

在项目根目录的本地服务端环境设置 `REQUESTY_API_KEY`。默认网关为用户确认的 Requesty 全球入口。Requesty 请求由错题本的同源接口校验并转发。密钥不会被打进 Vite 客户端。[Requesty 接入说明](https://docs.requesty.ai/quickstart)

默认豆包使用错题本自己的服务端变量 `DOUBAO_API_KEY`、`DOUBAO_MODEL_ID`。本机直接使用 `/api/notebook`。原独立站的 H5 由 `VITE_NOTEBOOK_DOUBAO_URL` 指向腾讯上海的错题本专属 HTTP 函数 `cuotiben-ai`。豆包照片、文字和笔迹请求直接发送到此函数，一次请求完成解析。Requesty 通过 Vercel 同源接口处理。学科只用于本机归档，空缺时显示“未分类”。

错题本使用 `CLOUDBASE_ENV_ID`、`CLOUDBASE_APIKEY` 访问上海区的专属集合 `cuotiben_daily_usage`。每日按北京时间、匿名浏览器身份计数，跨模型共 30 次，相同请求重试复用记录。集合仅存匿名摘要、日期及请求摘要，不存题干、照片、作答。首次使用需创建同名集合并向服务端账户授予读写权限。密钥仅供服务端读取。浏览器只接收公开的函数地址。

照片和粘贴都在同一个家庭入口使用。首次发送选区前，页面向家长说明接收方、用途与留存条件。用户同意后，由错题本直接转发选区给豆包。默认选整张，点“识别整张图”会发送整图；手动圈题只发送框内图片。家长可修改识别文字、重圈或在识别失败时照图补录。收录成功后，本题选区和讲解保存在本机。老师的参考答案单独保留到完整解析和订正对照页。[方舟平台条款](https://docs.volcengine.com/docs/ark/volcengine-ark-platform-terms?lang=zh) · [调用日志说明](https://console.volcengine.com/ark/region%3Acn-beijing/docs/log-collection)

## 实时讲解

H5 用 POST 发题并读取 SSE。豆包直接返回模型增量，可选模型由服务端向 Requesty 打开流式请求，按收到的正文增量转发。网关完成校验后才发出可收录的结果。客户端按收到的数据刷新，完整解法可按需展开。对 `/api/notebook` 使用 `Accept: text/event-stream` 获取事件流，原有 JSON 调用仍可用。[Requesty 流式接口](https://docs.requesty.ai/frameworks/axios)

## 预览和发布

Vercel 使用 Vite 构建及原生 Node 函数。开发验收在本地完成，全部开发完成后再部署 Preview。线上真实推理需要受管理的预览环境设置服务端密钥、控制试用访问，并配置错题本专属计数集合。试用域名变化会产生新的浏览器存储空间。

## 验证

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

真实质量验收使用香港考评局三年级原卷。以下命令下载 PDF 到指定测试目录，题面与标准答案独立保存在验收端。网页不包含样题。准备需使用 curl 和 Poppler 的 pdftotext。运行 evaluate 会产生真实的 Requesty 推理费用。输出有各题答案、讲解、耗时和服务返回的费用；如只复测一个模型，在命令末尾追加其完整模型 ID。

```sh
python3 scripts/public-papers.py /tmp/shiti-papers
SHITI_PUBLIC_CASES=/tmp/shiti-papers/cases.json npm test
node --env-file=.env.local scripts/evaluate.mjs /tmp/shiti-papers/cases.json /tmp/shiti-results.json
```

需求、交互和独立任务详见[需求文档](家庭错题本-H5需求文档.md)、[交互设计](家庭错题本-H5交互设计.md)和[开发计划](docs/plans/2026-11-19-h5-development.md)。本轮实测数据见[模型验收](docs/qa/模型验收.md)。

手机流程可用本机的 Puppeteer 和 Chromium 运行。下列命令使用同一份公开 PDF，按原卷坐标实际圈第 4、6 题，用真实请求验两题收录、订正和刷新后回读。验收使用独立浏览器，本机用户的题本不参与测试。

```sh
pdftoppm -f 3 -l 3 -singlefile -r 140 -png /tmp/shiti-papers/math.pdf /tmp/shiti-papers/math-page-3
SHITI_PAPERS=/tmp/shiti-papers node scripts/browser-acceptance.cjs
```

可通过 `PUPPETEER_MODULE` 和 `CHROME_PATH` 指定已有测试工具的位置。

本地容量、同页三题、真实学生原作答、断网恢复与性能实测见[本地开发验收](docs/qa/本地开发验收.md)。

固定验收入口为 `https://cuotiben-qa-xiaoweis-projects-cf1fe430.vercel.app`。在已关联项目且已登录 Vercel CLI 的工作目录运行 `node scripts/deploy-qa.mjs`，它会等待预览构建成功，再将验收域名绑定到新版本。正式发布应在该版本的计数、发题和真实 SSE 验收通过后执行。

生产配置也要提前验证。在预览通过后，用 `vercel deploy --prod --skip-domain` 构建候选版本，记录部署 ID 和构建网址。用 `vercel alias set <构建网址> cuotiben-qa-xiaoweis-projects-cf1fe430.vercel.app` 将同一个验收入口指向候选版本。复测文字与照片录题后，用 `vercel promote <生产候选部署ID>` 发布已测构建，并通过普通浏览器在正式域名重测。发布前用 `vercel inspect https://cuotiben-orpin.vercel.app` 记录上一版部署 ID，便于回滚。

预览和生产使用固定域名。设置公开的 `VITE_NOTEBOOK_DOUBAO_URL` 后重新构建 H5。云端通过环境变量配置身份凭据，`node scripts/deploy-cloud-notebook.mjs` 只创建错题本函数及其 HTTP 路径，更新既有函数使用 `--update`。

故障经过、实测数据和后续直连修复见[生产网关验收](docs/qa/生产网关验收.md)。
