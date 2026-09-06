---
title: '通用原题分步演示：模型编排与工具核验'
type: 'feature'
created: '2026-09-05'
status: 'in-progress'
baseline_commit: '8c7778729db278d6d55375956dd786d9e8efd1fd'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** 六类题型匹配在模型调用前拒绝新题；继续补题型不能满足通用演示需求。

**Approach:** 任意原题进入同一生成链路。模型输出条件、步骤、检查项及通用图形关系；程序核验并绘制，不按题型分派。

## Boundaries & Constraints

**Always:** 原题为依据，已有解答只是参考；步骤引用条件或前置步骤。核验状态由程序产生，区分通过、未验证、错误。模型决定步骤数量，超过资源上限明确提示。保持点击触发、缓存隔离、取消与完成凭证。

**Ask First:** 新增收费外部服务、上传到新供应商或改线上部署架构。

**Never:** 承诺所有题都正确；把数值抽样或模型审阅标为数学证明；执行模型生成的 JS/Python/HTML/SVG；按新题添加专属模板；错误时展示无关图充数。

## I/O & Edge-Case Matrix

| 情况 | 处理 | 失败行为 |
|---|---|---|
| 新题、跨学科题 | 相同协议组合公式、几何、曲线或过程图 | 无法核验的推理明确标记 |
| 条件缺失、原图模糊 | 请求补充条件 | 不编造条件 |
| 明确算错、引用缺失 | 携带错误最多修复一次 | 不展示已知错误步骤 |
| 超时、取消、资源超限 | 停止任务并清除忙碌状态 | 无完成凭证、不推进学习 |
| 切题、缓存重开 | 题目与协议版本绑定 | 旧图不得复用到新题 |

</frozen-after-approval>

## Code Map

- `lib/learning/providers/adapter.ts`：live 路径调用通用生成器，保留当前供应商与强度。
- `lib/learning/providers/teaching-compiler.ts`：旧固定匹配仅保留在 mock 和原有回归测试。
- `lib/learning/teaching-scene.ts`、`components/teaching-scene.tsx`：通用数值图元与 JSXGraph/SVG 双渲染。
- `lib/learning/http/turn.ts`：事件、取消、学习状态和凭证。

## Tasks & Acceptance

**Execution:**
- [x] `lib/learning/teaching-program.ts`：新增版本化 JSON 协议；定义条件引用、依赖步骤、数学检查、图形对象及三态核验结果。
- [x] `lib/learning/providers/general-teaching.ts`：统一生成与一次修复；输入原题证据和参考解答，不使用题型白名单。
- [x] `lib/learning/teaching-verifier.ts`、`lib/learning/teaching-worker.ts`：math.js 算术、单位和符号恒等检查；表达式 AST 白名单与可终止 worker，限制长度、深度、运算量。无法证明返回未验证。
- [x] `lib/learning/teaching-scene.ts`、`components/teaching-scene.tsx`：支持坐标系、采样曲线、点线圆、多边形、箭头与公式关系；数学尺寸从表达式计算，示意布局明确标识。
- [x] `lib/learning/providers/adapter.ts`、`lib/learning/types.ts`、`lib/learning/illustration-fingerprint.ts`：接入新链路，版本隔离；旧模板不得成为通用链路失败兜底。
- [x] `components/learning-illustration.tsx`、`lib/learning/http/turn.ts`：展示真实进度和逐步核验范围；失败后去掉“正在生成”，保留解释和适当重试入口。
- [x] `tests/general-teaching.test.ts`、`tests/illustration-demo.test.ts`、`scripts/illustration-e2e.mjs`：安全、失败、缓存回归与真实跨题测试已执行并保留失败；更新 README、云函数构建产物及独立部署验证。
- [ ] 最终质量验收：关闭图题语义错配缺口后，重跑同构建跨科与原图质量验收；当前未满足。
- [x] 用户已同意有限增耗：增加独立图题校对（正常一次，校对累计最多8秒），整条生成链路最多35秒；最多修复一次，修复后必须重新校对且共享预算。未校对、超时或不确定不放行，不把模型意见标作数学证明；缓存版本隔离旧结果，记录校对次数与耗时。

**Acceptance Criteria:**
- Given 二次方程原图，when 真实浏览器提交，then 同一链路演示实根条件、根的关系和直角三角形，覆盖三问。
- Given 小学、代数、几何、物理及化学新题，when 运行同一构建，then 不新增题型代码，并如实呈现核验范围。
- Given 人工注入算错、非法表达式或缺条件，when 核验，then 不输出虚假的“已验证”。
- Given 移动端，when 逐帧查看和重开，then 图文可读、跨帧对象一致、不重复生成。

## Design Notes

初始协议是跨题组合工具，不是新的题型集合。公式展示与检查表达式分离；图形引用同一变量表，函数由服务端安全采样为点列，浏览器不执行模型表达式。物理规律、化学机理和一般证明不因算术检查通过就视为已证明。条件出处校验也不等于语义理解正确。

正常一次生成加一次独立校对、错误最多一次修复；现总生成预算35秒、校对累计8秒，含修复，不含已有解答准备。校对输出最多350 tokens；修复后的候选必须重审，共享原预算。前端立即反馈阶段，记录首帧和总耗时；不承诺未经测量的秒级结果。

模型只输出紧凑步骤与表达式；机械编号和原题来源由程序绑定。变量按依赖展开，拒绝循环；自由符号不自动赋值。常量先检查可表示精度，四则使用分数，根式等作明确标注的近似检查。普通推理、未知参数数值检查、不支持的单位说明均保持未验证。

多边形退化和虚假直角会被拦截。可计算的边标签与坐标长度交叉核对；只有量值与边一一唯一匹配时才自动定位标签，否则保留正确位置或报错。文字语义、不可解析的标签和整题证明仍未验证。函数图横纵独立缩放并提示；几何图保持等比例，标签避让，不展示空公式画布。

## Verification

本轮最终生产构建 `npm run build` 通过；仅恢复 Next 自动生成的 next-env.d.ts 路径差异。未提交、未部署，最终质量任务未勾选。

有限校对增量已实现：642项测试、lint、typecheck、函数构建通过。`outputs/general-teaching-audit-final/` 五题全执行、4/5工作流通过，成功样本校对增加1.114–3.732秒，但人工发现物理时间标签仍错放，不能把工作流成功当质量通过；化学修复耗尽35秒。随后通用边标签增加已知单位后缀量值绑定，4s不作为4*s，错边量值与位移冒充边长有回归测试。`outputs/general-teaching-audit-unit-guard/` 物理流程通过；原图两次记录 `outputs/general-teaching-audit-photo/`、`outputs/general-teaching-audit-photo-final/` 分别因校对8秒超时、图中文字过长被拦截。原图当前未稳定通过，**最终质量任务仍未完成**；不通过延长预算掩盖失败，不提交或部署。

历史错误只读校对：代数错误示例2/4被reject（5.499秒）；物理位移边标签在旧提示下漏检，补充显式边标签角色后被reject（2.978秒）。这是诊断样本，不是准确率保证。缓存指纹再隔离单位绑定修订，避免复用此轮先前放行的错误图。

当前 `npm test`（625项）、`npm run lint`、`npm run typecheck`、`npm run build:function`、`npm run build` 通过。独立函数目录只安装声明依赖，从仓库工作目录启动 worker，精确小数检查通过。

真实原图验收证据位于 `outputs/general-teaching-original-edge-bound/`：原始图片上传、三问识别、三步生成、移动端查看和缓存重开通过，逐帧检查标签正确、无重叠。总点击耗时33.825秒，其中生成与核验24.268秒、修复1次；缓存重开422毫秒。测试不代表稳定成功率：此前协议、未赋值变量、退化图形和标签错位失败记录均保留在 `outputs/general-teaching-*`，不能把修复过程中的重试掩盖为一次成功。

最终跨题探索记录：`outputs/general-teaching-final-cross-subject/` 中小学题和代数题工作流通过；几何题虽工作流通过，但人工发现AC/BC已知量互换，已加入通用显式已知量核对；物理单位标签误判已修复。`outputs/general-teaching-source-checked/` 中几何题10.689秒、物理题12.837秒首轮成功，截图检查通过。化学题先因把质量标签当边长而失败，修正解释范围后，`outputs/general-teaching-chemistry-final/` 最新真实调用仍格式失败，因此跨学科质量验收**并非全通过**。当前是可审查的通用基础实现，不是所有题稳定高质量的产品承诺。

技术依据：[math.js 核验边界](https://mathjs.org/docs/reference/functions/symbolicEqual.html)、[表达式安全](https://mathjs.org/docs/expressions/security.html)、[JSXGraph 曲线](https://jsxgraph.org/docs/symbols/Curve.html)。沿用已安装版本，不新增 Python 服务作为部署前提。

## Spec Change Log

用户最新确认“接受，但也别太夸张”：允许额外独立图题校对，采用同一已配置供应商/模型，不新增服务；正常只增加一次短输出请求，累计校对8秒与总35秒硬上限控制延迟。只检查原题、数量身份、图形坐标和标签的语义一致性及所有小问，不重新生成完整解答；失败仍至多一次修复，不能未复核就展示。所有现有安全/数学核验保留。

审查中的实现缺陷均按 patch 处理，冻结意图未修改：精确系数替代近似符号化简、完整数字来源边界、单位偏移与精度、连续区间检查、保留点集和图名、检查非空、递归来源、按题收集失败及构建指纹。没有需要转移到其他故事的缺陷。

最终构建 `220ce088e48edc37cc66299665ae420d5acdd4beb95a1092ab55f34b3c5ffde5`：`outputs/general-teaching-release-check/` 五题全部执行，4/5流程成功；几何错误已知量被拦截，代数人工检查仍发现示例2/4与平方和24错配，物理将位移放到三角形斜边旁，图意仍不可靠。`outputs/general-teaching-release-photo/` 同一构建原图流程成功，三问识别/三步/缓存通过；生成12.254秒、首次总21.757秒、无修复、重开434毫秒。原图单次成功不能覆盖其他输入的失败。状态保持 in-review，**不标 done、不提交、不部署**。

有限独立校对已获用户批准并实现；当前仍需解决模型输出协议稳定性和未结构化语义绑定，不扩大35秒/8秒预算，也不把模型复核冒充数学证明。本轮停留在实现验收阶段，尚不满足最终质量门槛。


## Suggested Review Order

**通用链路与边界**

- 从统一生成入口理解预算、修复与失败行为。
  [general-teaching.ts:125](../../lib/learning/providers/general-teaching.ts#L125)

- 查看原题来源及不可信 JSON 的准入约束。
  [teaching-verifier.ts:19](../../lib/learning/teaching-verifier.ts#L19)

- 精确系数比较避免把近似结果称为证明。
  [teaching-worker.ts:107](../../lib/learning/teaching-worker.ts#L107)

- 曲线先确认可安全绘制的连续区间。
  [teaching-worker.ts:121](../../lib/learning/teaching-worker.ts#L121)

**展示与证据**

- 查看逐步核验范围及失败后状态。
  [learning-illustration.tsx:148](../../components/learning-illustration.tsx#L148)

- 回归覆盖审查发现的错误证明与边界。
  [general-teaching.test.ts:1](../../tests/general-teaching.test.ts#L1)

- 构建标识绑定真实调用、缓存与失败记录。
  [illustration-e2e.mjs:1](../../scripts/illustration-e2e.mjs#L1)
