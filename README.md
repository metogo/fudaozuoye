# AI 学习教练 H5

面向学生自主学习的引导式学习 Chat。支持文字、拍照、相册和白板发题，AI 在同一对话中讲核心思路、处理卡点、补充前置知识，并以学生独立完成原题作为学习完成标准。

## 启动

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` 会同时启动 H5（`http://localhost:3000`）和本地学习 API（`http://localhost:9000`），并自动读取项目根目录的 `.env.local`。Next.js 负责页面热更新；本地 API 会在 TypeScript 编译后自动重启，也会在 `.env.local` 内容保存后重新校验并自动读取新配置。代码和环境配置同时变化时只会合并重启一次。

如果 `.env.local` 缺失，启动会在监听端口前直接失败，不会默认进入演示模式。`AI_MOCK_MODE` 也必须在 `.env.local` 中显式设为 `true` 或 `false`。服务运行期间遇到无效配置或编辑器保存造成的短暂文件缺失时，当前健康 API 会继续使用上一份有效配置；终端只给出不含变量值的提示，并在文件修正后自动重试。

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

“轮到你了”的“插画演示”使用通用 JSON 协议（v2）：模型从原题证据编排条件、变量、步骤、核验项和图形，不再按题型白名单分派。正常一次生成加一次独立短校对（同供应商/模型，350输出token上限），最多修复一次，修复后必须重新校对。整体预算35秒、所有校对共享8秒（不包含首次准备原题完整解答）。校对比对原题、数学坐标与最终屏幕标签，检查量值身份、图意及小问覆盖；不确定、格式异常、超时、取消或修复失败不放行，不使用模板兜底、不签发完成凭证。模型校对不是数学证明，仍保留未验证提示；审查版本加入题目指纹，旧无审查缓存失效。generationMetrics记录auditCount/auditMs。

math.js 15.2.0 在可终止 worker 中执行 AST 白名单算术、单位和域安全的多项式恒等检查。表达式长度、深度、指数、运算量、点数和输出均有上限，worker超过3秒终止。浏览器仅接收数值点列，JSXGraph绘制坐标系、曲线、点线圆、多边形、箭头和标签，不执行模型生成的程序。条件引用校验仅检查出处，不证明语义正确；文字推理、一般证明、物理规律和化学机理明确标为未验证。常量四则用分数检查，含根式等的数值相等是浮点近似检查，不冒充符号证明；变量分母、函数和定义域限制不标为无条件恒等。低置信关键图条件要求补充确认。

多项式使用精确分数系数比较，避免近似化简把非零项消掉；单位换算不使用浮点相等容差，跨温标等偏移单位保持未验证。曲线在采样前进行保守区间检查，可能含零分母、负根号、对数或正切间断点时拒绝绘制；因此部分数学上连续的复杂区间也可能要求重新编排。

当前通用底座尚未通过稳定图意质量验收：自动化回归与工作流通过不等于图示符合原题。2026-09-05 增加限额校对后的五题回归为4/5流程成功，成功样本校对耗时约1.1–3.7秒，但仍有漏检与超时。随后补充通用带单位边标签绑定；原图复测仍有协议失败，暂不作为完成的质量保证方案，详见实施规格与审查记录。

生成协议省略机械编号和重复原题，服务端绑定来源；遗漏的自由符号只能保留为未知参数，不能自动赋值用于绘图。程序核对原题中可明确提取的字母等于数值的已知量（不覆盖自然语言中的全部关系）。多边形退化、虚假直角会被拦截，合法直角由程序绘制标记；可计算的标量边标签核对长度，唯一匹配时定位到对应边，其他标签仍未验证。所有图仍标注为教学示意，局部几何检查不证明图意与原题完全一致。

以下旧图片模型配置可以保留，当前演示不会调用图片接口：

```bash
DOUBAO_IMAGE_MODEL_ID=
DOUBAO_IMAGE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3/images/generations
```

帧数由模型按有效步骤决定（资源上限10帧）。图形和计算共用变量表；示意布局或示例参数明确标注。纯公式步骤不展示空画布。任意题目可进入同一链路，但不承诺全部能求解或证明。生成完整后关闭演示才进入关键步骤回忆；同题在本页重开复用结果，协议版本绑定缓存，点击“重新生成”才重新调用。JSXGraph加载失败使用同一数值场景生成的静态SVG。旧模板仅保留在mock演示与回归测试中，不是live兜底。

验证：`npm test -- tests/general-teaching.test.ts tests/illustration-demo.test.ts` 覆盖安全边界、定义域、修复预算、取消和状态。运行本地服务后 `ILLUSTRATION_CASES=rectangle,quadratic,geometry,physics,chemistry npm run test:e2e:illustration` 做跨题真实模型验收，输出到 `outputs/illustration-e2e/`。成功与失败均须人工检查逐帧质量，测试通过不代表一般证明能力。

首次运行浏览器验收先执行 `npx playwright install chromium`，也可设置 `ILLUSTRATION_BROWSER_CHANNEL=chrome`。设置 `ILLUSTRATION_FRESH_INPUT=true` 从新题输入开始；`ILLUSTRATION_IMAGE_PATH=/absolute/path/question.png ILLUSTRATION_CASES=quadratic` 从实际原图上传开始，包含真实识题和首次解答，输出到 `outputs/illustration-e2e-fresh/`。`ILLUSTRATION_OUTPUT_DIR`可指定输出目录；指标分别记录点击至首帧/完成、模型与核验总耗时、修复次数及缓存重开，不保存会话密钥或凭证。

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

不要将模型密钥放到静态应用的构建变量。请只在 `learning-api` 云函数环境变量中设置 `DOUBAO_API_KEY`、`DOUBAO_MODEL_ID`、`DOUBAO_MODEL_ID_MEDIUM`、`DOUBAO_MODEL_ID_HIGH`、`DOUBAO_BASE_URL`、可选的 `DOUBAO_IMAGE_MODEL_ID`、`DOUBAO_IMAGE_BASE_URL` 和至少 32 位的 `SESSION_STATE_SECRET`；本仓库不保存这些值。
