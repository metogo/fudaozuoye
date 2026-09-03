---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'OpenMAIC 对学习板书内容引擎的启发'
research_goals: '识别可提升板书实用性、多样性和理解价值的架构与实现机制，并形成适合当前产品的升级方案'
user_name: 'fanhua'
date: '2026-09-03'
web_research_enabled: true
source_verification: true
---

# Research Report: OpenMAIC 对学习板书内容引擎的启发

**Date:** 2026-09-03
**Author:** fanhua
**Research Type:** technical

---

## Research Overview

本报告研究 OpenMAIC 的课程生成、场景 DSL、元素渲染、教学动作、播放状态机和交互组件，并与当前项目的板书生成、学科模板、视觉补充、移动端工作区和验收体系逐项对照。事实来源以 OpenMAIC 官方仓库、官方技术讨论及相关开源库官方文档为主；产品判断则以“板书是否比 Chat 更能帮助学生完成当前认知任务”为唯一中心。

研究结论是：当前板书的主要问题不在 Rough.js 或样式，而在内容协议仍把板书限定为固定五段文字卡。OpenMAIC 真正值得借鉴的是 `Scene → Element → Action → Playback` 的分层，以及先选择教学表达、再生成内容的机制。完整执行摘要、目标架构、技术选型、迁移路线和风险见文末“Research Synthesis”。

## Technical Research Scope Confirmation

**Research Topic:** OpenMAIC 对学习板书内容引擎的启发
**Research Goals:** 识别可提升板书实用性、多样性和理解价值的架构与实现机制，并形成适合当前产品的升级方案

**Technical Research Scope:**

- Architecture Analysis - 内容规划、场景组织与运行时架构
- Implementation Approaches - 多智能体编排、视觉资产生成与演示机制
- Technology Stack - OpenMAIC 使用的模型、渲染与交互技术
- Integration Patterns - 可与现有 Chat、板书文档和学科内容引擎结合的边界
- Performance Considerations - 移动端时延、生成成本、失败降级与复用策略

**Research Methodology:**

- 以 OpenMAIC 官方仓库和论文为主要事实来源
- 关键判断与当前项目实现交叉验证
- 区分可直接复用、需改造借鉴和不适合照搬的能力

**Scope Confirmed:** 2026-09-03

## Technology Stack Analysis

### Programming Languages

OpenMAIC 的主实现是 TypeScript，运行时要求 Node.js 22.19 以上。这个选择使课程 DSL、生成管线、播放状态、动作协议和 React 渲染器能够共享同一套类型，而不是让模型直接输出不可控的 HTML 字符串。对我们的启发不是“换语言”，而是继续用 TypeScript，但把板书从页面组件提升为有版本、有校验器的内容协议。

_Source: https://github.com/THU-MAIC/OpenMAIC/blob/main/package.json_

### Development Frameworks and Libraries

核心界面采用 Next.js 16、React 19、Tailwind CSS 4；多智能体编排采用 LangGraph。视觉与互动能力不是依赖单一绘图库，而是组合使用 ECharts、XYFlow、KaTeX、Motion、SVG 路径处理、Canvas、ProseMirror，以及独立的 `@openmaic/dsl`、`renderer`、`editor`、`generation` 包。这里最值得借鉴的是“内容协议—渲染器—编辑器—生成器”四层分离，而非照搬某个图形库。

_Source: https://github.com/THU-MAIC/OpenMAIC/blob/main/package.json_

### Database and Storage Technologies

OpenMAIC 同时支持浏览器端 Dexie/IndexedDB 和服务端 PostgreSQL，并把文档、运行态、资产、材料等存储抽象到 `@openmaic/storage`。其持久化主要服务于完整课程、可恢复生成、编辑历史和媒体资产。我们的产品是即抛即用型单题学习，不应照搬这套重存储；但应借鉴“资产注册表”和“生成产物可引用”的思想，在一次会话内统一管理图、公式、步骤和互动组件。

_Source: https://github.com/THU-MAIC/OpenMAIC#server-backed-persistence-postgresql_

### Development Tools and Platforms

项目采用 pnpm workspace 管理多个 SDK 包，用 Vitest 做单元测试、Playwright 做端到端测试，并单独提供白板布局、编排、回答内容等评测命令。说明其“丰富课堂”不是只靠人工体验，而是把白板布局与内容生成作为可评测对象。我们当前已经有结构验收，但下一步应增加按学科、题型和视觉策略划分的板书效用评测，而不只是验证字段是否存在。

_Source: https://github.com/THU-MAIC/OpenMAIC/blob/main/package.json_

### Cloud Infrastructure and Deployment

OpenMAIC 可部署到 Vercel 或 Docker，并把 MP4 导出拆成 Chromium + FFmpeg 的独立渲染服务；模型、图片、视频、TTS、ASR 和搜索均为可替换 provider。对我们而言，完整视频导出和重型媒体服务现阶段投入产出比低；更合适的是保留现有轻量 H5，把“交互图、动态图解、学科图示”做成按需加载的本地渲染能力，仅在确有理解价值时调用外部图像生成。

_Source: https://github.com/THU-MAIC/OpenMAIC#docker-deployment_

### Technology Adoption Trends

OpenMAIC 从单次课堂生成逐步演进到两阶段生成管线、版本化 DSL、动作引擎、播放状态机、编辑器和持久运行时。其路线说明：内容多样性不是通过不断加入图库获得，而是通过“先规划教学场景，再生成结构化内容，最后由专用渲染器执行”获得。白板实时绘制只是 28 类以上动作中的一类；同一知识点可以被分配给幻灯片、测验、交互模拟、PBL 或白板。

_Source: https://github.com/THU-MAIC/OpenMAIC#key-architecture_

### Stack-level Conclusion for Our Board

OpenMAIC 对我们最重要的技术启发有三点：

1. 不再让一个 `BoardLesson` 同时承担教学规划、内容表达和 UI 布局。
2. 不再依靠 Rough.js 之类的绘制风格库制造“板书感”；图形库只负责渲染，教学模型必须先决定为什么需要这张图。
3. 建立受限、可校验的板书 DSL，并为关系图、数轴、几何构造、函数变化、时序、证据链、对照表和可操作模拟提供专用渲染器。

当前判断置信度：高。技术栈与架构事实来自 OpenMAIC 官方仓库；对我们产品的适配判断基于当前项目代码结构，后续步骤将继续验证具体集成边界。

## Integration Patterns Analysis

### API Design Patterns

OpenMAIC 的生成包通过 `AICallFn` 把模型调用隔离在内容生成之外：生成器接收 system/user prompt 并返回模型输出，但不选择模型、不读取环境变量，也不负责持久化。内容、动作和组装可以独立调用，重试时还能保留稳定的 `sceneId`。这是一条非常适合我们复用的边界：现有豆包 Adapter 继续负责模型通信，新建 Board Planner 只负责输出受限场景计划，渲染器完全不接触模型。

_Source: https://github.com/THU-MAIC/OpenMAIC/blob/main/packages/%40openmaic/generation/README.md_

### Communication Protocols

OpenMAIC 的实时讨论采用一次 Agent 调用产生 `[text, action, text, action...]`，解析后按顺序执行；课堂播放则直接消费 `Scene.actions[]`。它没有把“逐字流式文本”等同于“教学进度”，而是用动作游标表示真实进度。我们的 SSE 可以继续保留，但需要新增 `board.scene`、`board.action`、`board.patch` 和 `board.checkpoint` 事件，使用户看到的是板书动作逐步完成，而不是等待整页生成完后突然出现。

_Source: https://github.com/THU-MAIC/OpenMAIC/discussions/489_

### Data Formats and Standards

OpenMAIC 用版本化 DSL 统一 Scene、视觉元素和 Action，并让生成、播放、编辑、导出共享同一契约。白板动作是 DSL 的受限包装，隐藏模型不应控制的字段并承担权限与动画职责。我们不应让模型输出任意 HTML、SVG 或像素坐标，而应定义语义级对象，例如 `equation_derivation`、`geometry_construction`、`evidence_chain`，再由确定性布局器转成具体坐标。

_Source: https://github.com/THU-MAIC/OpenMAIC#key-architecture_

### System Interoperability Approaches

建议把现有板书链路改成四个点对点、可单独测试的模块：

1. Chat/学习状态 → `BoardDirector`：输入当前题目、学生卡点、已经解释过的内容和下一学习目标。
2. `BoardDirector` → `BoardScenePlan[]`：决定 2–6 个场景及其表达介质，不生成最终坐标。
3. Scene Generator → `BoardElement[] + BoardAction[]`：按场景类型调用专用生成器。
4. Renderer/Playback → UI：确定性布局、逐动作执行、暂停、重放和检查点反馈。

这比引入微服务或消息队列更符合当前单题 H5：边界清楚，但仍可部署为同一个应用和云函数。

### Event-Driven Integration

OpenMAIC 播放引擎维护 `sceneIndex`、`actionIndex`、模式和可序列化快照；用户中断后保存游标，讨论结束再恢复。我们可以采用更轻量的相同思想：每个场景记录 `pending/running/paused/completed/failed`，动作记录稳定 ID；用户提问时暂停当前动作，把回答绑定到目标元素，随后从游标继续。这样板书与 Chat 不再是两个互不相干的页面。

_Source: https://github.com/THU-MAIC/OpenMAIC/blob/main/lib/playback/engine.ts_

### Interactive Component Contract

OpenMAIC 已经明确发现单一“生成 HTML”提示无法覆盖不同交互：物理模拟、流程、代码、游戏和 3D 需要专用生成路径，并需要教师拥有 `highlight`、`set state`、`reveal`、`annotate` 等动作。我们应进一步收窄到单题教育高频组件：

- 数学：代数式逐步变形、数轴、函数参数、动态几何。
- 物理：受力图、过程状态、变量变化。
- 化学：反应条件、粒子/装置、守恒关系。
- 语文与文科：原文证据标注、因果链、时间线、对比矩阵。

每种组件统一实现 `setState`、`highlight`、`reveal`、`reset`、`getAnswer`，让 Board Director 能真正通过组件教学。

_Source: https://github.com/THU-MAIC/OpenMAIC/discussions/423_

### Resilience and Validation

OpenMAIC 的白板实践表明，直接让模型给出坐标会产生重叠、越界和字号失控；由代码计算几何冲突并把结果反馈给模型，比将渲染截图再次喂给模型更有效。其评测中，图像反馈对强模型反而降低质量，而启用深度思考虽然提质，却把实时延迟推到不可接受范围。对我们的直接结论是：布局冲突、引用完整性和可读性必须由代码校验；只有语义内容交给模型，且局部失败只重生当前场景。

_Source: https://github.com/THU-MAIC/OpenMAIC/discussions/489_

### Integration Security Patterns

模型只能生成白名单中的场景、元素和动作；动作执行前校验目标元素存在、当前阶段允许、不会泄露受保护答案。交互 HTML 若未来引入，必须使用沙箱和受限消息协议，不能直接执行模型返回脚本。我们的答案保护与状态令牌机制应继续保留，并前移到每个 Scene/Action 的校验层。

### Integration Conclusion

最合理的集成不是把 OpenMAIC 嵌进当前项目，也不是复制 LangGraph、多 Agent 或完整课堂运行时，而是在现有 `BoardLesson` 与 UI 之间插入两个真实缺失的对象：`BoardScenePlan` 和 `BoardActionTimeline`。这是从静态学习卡升级为可执行板书的最短主线。

## Architectural Patterns and Design

### Architecture Decision

采用**模块化单体 + 版本化板书 DSL + 插件式学科场景**，不拆微服务，也不复制 OpenMAIC 的完整课堂系统。当前产品处理的是一次性单题学习，真正缺少的是内容编排和可执行表达，不是分布式基础设施。

目标架构只有四层：

1. **Scene（教学场景）**：这一屏要解决什么认知问题。
2. **Element（语义元素）**：公式、关系、证据、图形、时间点等稳定对象。
3. **Action（教学动作）**：出现、变形、连接、强调、提问、验证。
4. **Playback（教学进度）**：当前讲到哪个场景、哪个动作，如何暂停和继续。

OpenMAIC 的生成链路也是先生成场景提纲，再生成场景内容与动作；其播放引擎直接消费动作序列。这证明“实用板书”的基本单位不是一张长页面，而是一个可执行教学场景。

_Sources: https://github.com/THU-MAIC/OpenMAIC/blob/main/packages/%40openmaic/generation/src/outline-generator.ts ; https://github.com/THU-MAIC/OpenMAIC/blob/main/packages/%40openmaic/generation/src/scene-generator.ts ; https://github.com/THU-MAIC/OpenMAIC/blob/main/lib/playback/engine.ts_

### Board Director Pattern

增加一个隐藏的 `BoardDirector`，但不采用多 Agent 课堂。它只做一次高价值决策：根据题目、学段、当前卡点、Chat 已解释内容和本轮学习目标，选择 2–6 个必要场景以及最合适的表达介质。

示例路由：

- 条件之间的依赖：关系图。
- 公式如何变化：逐步推导。
- 参数影响结果：可操作模拟。
- 几何空间关系：构造图或动态图形。
- 文言文、阅读理解：原文证据标注。
- 历史与事件因果：时间线或因果链。
- 容易混淆的概念：对照矩阵。
- 算法执行过程：代码轨迹。

场景数量必须由学习目标决定，不能继续固定五步。OpenMAIC 同样按内容特征路由 slide、quiz、diagram、simulation、code、3D、game 等类型；值得复制的是“先选表达方式”，而不是复制所有类型。

_Sources: https://github.com/THU-MAIC/OpenMAIC/tree/main/packages/%40openmaic/generation/templates ; https://github.com/THU-MAIC/OpenMAIC/discussions/423_

### Versioned Board DSL

建议建立以下最小契约：

```ts
type BoardExperience = {
  version: 1;
  problemRef: string;
  learningGoal: string;
  scenes: BoardScene[];
  initialSceneId: string;
};

type BoardScene = {
  id: string;
  intent: "understand" | "connect" | "derive" | "verify" | "transfer";
  goal: string;
  medium: BoardMedium;
  evidenceRefs: string[];
  elements: BoardElement[];
  actions: BoardAction[];
  checkpoint?: BoardCheckpoint;
};

type BoardAction = {
  id: string;
  type: "reveal" | "highlight" | "connect" | "transform" | "set_state" | "ask";
  targetId: string;
  payload?: unknown;
  dependsOn?: string[];
};
```

模型负责语义，不负责像素坐标。每个元素必须有稳定 ID，讲解、强调、用户提问和状态变化都指向同一个元素。布局器再把语义元素确定性地排成移动端可读的页面。这能直接避免当前“模型内容正确，但字号、重叠、位置和节奏失控”的问题。

OpenMAIC 的 Renderer 支持 text、image、shape、line、chart、latex、table、video、audio、code 等元素，Action Engine 再对元素执行 spotlight、reveal、annotation、state change 等动作。我们只需实现对单题理解真正有价值的子集。

_Sources: https://github.com/THU-MAIC/OpenMAIC/blob/main/packages/%40openmaic/renderer/src/SlideElement.tsx ; https://github.com/THU-MAIC/OpenMAIC/blob/main/lib/action/engine.ts_

### Generation and Runtime Flow

```text
题目 + Chat 上下文 + 当前卡点
        ↓
BoardDirector：规划 2–6 个场景及表达介质
        ↓
专用 Scene Generator：生成语义元素与教学动作
        ↓
Validator + Layout Engine：校验引用、答案边界、字号、密度和几何冲突
        ↓
Renderer + Playback：首个场景先出现，其余场景按需生成和执行
        ↓
Checkpoint：学生操作或回答，结果回写当前场景状态
```

这条链路必须把“内容生成完成”和“教学播放完成”分开。模型返回完整结果后，不再由前端逐字拖延；前端只控制有认知意义的动作，例如先出现条件、再连线、再揭示关系，而不是模拟打字。

### Subject Plugin Architecture

第一批插件应覆盖高频、确定性强、能显著提升理解的表达：

- `derivation`：公式逐步变形，标出每一步依据与不变量。
- `relation-map`：对象、条件和目标之间的关系。
- `geometry`：点线角、辅助线、可拖参数和同步结论。
- `process-state`：物理过程、化学变化、生命过程的状态迁移。
- `source-annotation`：语文原文、英语句子和材料题的证据定位。
- `timeline-causality`：历史时间线、地理过程和因果关系。
- `compare-matrix`：概念辨析、分类和条件对照。

每个插件统一实现 `render`、`setState`、`highlight`、`reveal`、`reset`、`getAnswer`，但内部布局和交互保持学科原生。这样新增学科能力是增加插件，不是继续扩张一个已经腐烂的大组件。

### Resilience and Progressive Delivery

- **首个有效场景优先**：规划完成后先生成最能解决当前卡点的一屏，不等待整套板书。
- **场景级修复**：某一场景失败只重生该场景，不把整页降级成固定五卡。
- **代码校验布局**：字号、密度、重叠、引用和公式解析由代码验收；不把截图再次交给模型碰运气。
- **稳定动作游标**：用户提问时暂停，回答绑定当前元素，结束后继续，不重复播放整页。
- **渐进增强**：动态图和媒体失败时保留等价的静态语义图，而不是隐藏整个内容。
- **会话内状态**：保留现有即抛即用定位，只存当前题的板书文档、动作游标和临时资产，不建设账户级知识库。

OpenMAIC 的实际评测也显示，模型直接负责坐标不可靠，代码几何检测更有效；渲染截图反馈收益很低，深度思考虽提质但实时延迟不可接受。因此实时路径应靠强约束 DSL 和本地验证，而不是更慢的模型循环。

_Source: https://github.com/THU-MAIC/OpenMAIC/discussions/489_

### Migration from the Current Board

当前实现的主要问题不是 UI，而是数据结构把板书锁死为“五段式学习卡”：固定五个单元、重复展示目的/证据、`layout` 字段没有真正驱动布局，视觉补充主要靠关键词规则，互动图多数只能缩放。

建议按以下顺序迁移：

1. 新建 `BoardExperience`、`BoardScene`、`BoardElement`、`BoardAction`，旧 `BoardLesson` 暂时通过 Adapter 转换。
2. 引入动态场景规划，删除“恰好五步”的生成约束。
3. 先落地 `derivation`、`relation-map`、`source-annotation` 三个插件，覆盖数学与文科。
4. 加入动作时间轴和场景级 SSE，解决突然出现、重复播放和无反馈等待。
5. 再做 geometry、process-state 等可操作插件。
6. 新链路稳定后删除旧五卡模板、无效 `layout`/`derive` 分支和以正则为主的视觉补丁。

这是一个**中等重构**：核心协议与前三个插件可以在现有 Next.js 单体内完成；动态图形与跨学科完整覆盖属于后续大工程。最大风险不是开发难度，而是继续同时维护新旧两套板书语义，导致内容策略再次分叉。因此兼容层必须是临时迁移层，有明确删除点。

### Explicit Non-goals

当前阶段不做：完整多 Agent 教室、PPT/视频导出、TTS 编排、3D、游戏、任意 LLM HTML、长期存储和知识库。这些能力会增加成本、时延和失败面，却不能先解决“孩子看完板书是否更懂”这个核心问题。

### Architectural Conclusion

OpenMAIC 最有价值的启发可以压缩成一句话：**板书不是把 Chat 文本换一种排版，而是把知识组织成可执行、可指向、可验证的教学场景。**

因此下一阶段不应继续装饰现有卡片，而应重建板书内容契约。只有 Scene 决定讲什么、Element 决定画什么、Action 决定怎么讲、Playback 决定讲到哪里，学科图形、动效和交互才会真正服务理解。

## Implementation Approaches and Technology Adoption

### Technology Adoption Strategies

采用渐进替换，而不是在旧五卡结构上继续叠功能，也不是一次性重写整个学习流程：

1. 先建立新 DSL、校验器和旧数据 Adapter，现有入口不变。
2. 选三种高收益表达做垂直切片：公式推导、关系图、原文证据标注。
3. 新旧板书并行只发生在内部，用户始终看到同一个“用板书讲清楚”入口。
4. 新链路达到内容、稳定性和延迟门槛后，删除旧固定五卡生成逻辑。

技术栈不以 Rough.js 为前提。Rough.js 只能提供手绘外观，不能生成教学结构，也不能决定一段知识应该变成图、推导还是交互；它可以被删除，或仅作为可选视觉纹理。每类表达应选最适合的引擎。

_Sources: https://github.com/THU-MAIC/OpenMAIC#key-architecture ; https://github.com/THU-MAIC/OpenMAIC/discussions/489_

### Development Workflows and Tooling

建议在现有目录中形成真实模块边界：

- `lib/learning/board-runtime/schema/`：版本化 DSL、解析和迁移。
- `lib/learning/board-runtime/director/`：场景规划和表达路由。
- `lib/learning/board-runtime/generators/`：按介质生成元素与动作。
- `lib/learning/board-runtime/validators/`：事实、答案边界、引用、密度、几何冲突。
- `lib/learning/board-runtime/playback/`：动作游标、暂停、恢复和场景状态。
- `components/board-renderers/`：一个介质一个渲染器，拒绝继续扩张单一组件。

模型调用仍由当前 Provider Adapter 管理；Board Director 和 Scene Generator 只接收抽象的模型调用函数，不读取供应商配置。SSE 在现有 Route Handler 中增加场景级事件即可，无需拆服务。Next.js 官方 Route Handler 使用 Web Request/Response API，适合继续承载当前 BFF 和流式响应。

_Source: https://nextjs.org/docs/app/getting-started/route-handlers_

### Testing and Quality Assurance

质量验证分四层：

1. **协议测试**：非法元素、悬空引用、重复 ID、动作依赖环、答案泄漏必须拒绝。
2. **插件契约测试**：每个 Renderer 都要通过 `render/setState/highlight/reveal/reset/getAnswer` 的统一行为测试。
3. **内容效用测试**：按数学、物理、化学、生物、语文、英语、历史、地理建立代表题；检查板书相对 Chat 是否增加了关系、过程或证据，而非换一种排版复述。
4. **浏览器验收**：移动端和桌面端验证滚动、固定导航、公式、交互、暂停恢复、失败重试和不重复播放；对稳定场景使用视觉快照。

Playwright 官方支持截图对比和 ARIA 快照，但视觉基线必须在固定 OS、浏览器版本和渲染条件下生成。OpenMAIC 的经验还表明，单次生成波动足以掩盖真实变化，所以关键模型场景至少重复三次，并同时测几何指标和教学指标。

_Sources: https://playwright.dev/docs/next/test-snapshots ; https://playwright.dev/docs/aria-snapshots ; https://github.com/THU-MAIC/OpenMAIC/discussions/489_

### Deployment and Operations Practices

继续使用现有 Next.js 单体部署。新运行时通过会话级开关灰度，记录以下结构化事件：

- Director 选择了什么介质以及原因。
- 每个 Scene 的生成耗时、校验结果和修复次数。
- 首个有效场景出现时间。
- 每个 Action 的开始、结束、中断和恢复。
- 用户在哪个元素提问、哪个检查点通过或退出。
- 静态降级、整页降级和答案保护触发原因。

禁止只记录“生成成功”。如果板书生成了但没有增加理解价值，业务上仍然是失败。

### Team Organization and Skills

第一阶段不需要多团队或专门基础设施岗位，但需要三类能力共同定义验收标准：

- 学习产品/学科设计：定义每种场景何时有用、学生应完成什么认知动作。
- 全栈工程：实现 DSL、运行时、流式事件、插件契约和移动端渲染。
- 质量工程：建立跨学科金标题集、内容效用评审和浏览器回归。

模型提示词不能由工程独立决定；否则很容易再次得到结构工整、教学价值很低的内容。

### Cost Optimization and Resource Management

- Director 使用一次受限结构化调用，不进行多 Agent 讨论。
- 首屏 Scene 优先生成，其余 Scene 可并行或延后。
- 模型只输出语义，布局和动画在本地完成，减少修复调用。
- 单 Scene 校验失败只修复该 Scene。
- 强推理模式只用于离线评测或困难场景，不作为实时默认路径。
- 图片、视频、3D 不进入核心成功路径，避免成本和超时扩大。

OpenMAIC 的生产白板预算约为每轮 2–4 秒；其深度思考实验虽然提升质量，却把 p50 推到 63 秒、p95 推到 258 秒，不适合实时课堂。这支持我们优先优化结构约束和本地验证，而不是默认增加模型思考时间。

_Source: https://github.com/THU-MAIC/OpenMAIC/discussions/489_

### Risk Assessment and Mitigation

- **内容仍是 Chat 改写**：验收必须要求每个 Scene 声明新增的视觉或推理价值；无增益则不生成。
- **插件泛化不足**：先覆盖高频语义结构，不按单题写模板；使用跨学科、同结构异表述题验证。
- **场景过多导致认知负担**：Director 上限 6 个场景，并允许只生成 2 个。
- **图形正确但误导**：几何、函数和关系引用必须可追溯到原题或推导步骤。
- **新旧语义分叉**：Adapter 只单向把旧数据转成新协议，禁止新能力回写旧结构。
- **新依赖扩大包体**：所有大型引擎按 Scene 动态加载；未被选中的题不下载相关代码。
- **视觉快照产生噪声**：固定测试环境，快照只负责布局；教学正确性使用结构断言与金标评审。

## Technical Research Recommendations

### Implementation Roadmap

**阶段 A：协议与垂直切片**

- 新 DSL、Validator、旧数据 Adapter。
- Board Director 生成动态 2–6 Scene 计划。
- 落地公式推导、关系图、原文证据标注。
- 同时建立内容增益与答案保护测试。

**阶段 B：动作与运行时**

- Scene/Action SSE。
- 首场景优先、动作游标、暂停恢复、局部重试。
- 将“逐字效果”替换成有教学意义的揭示、连接和变形。

**阶段 C：学科互动扩展**

- 动态几何、函数参数、物理过程状态。
- 化学反应与实验装置、生物过程图。
- 用户操作结果进入检查点判断。

**阶段 D：清理与规模化**

- 删除固定五卡、旧视觉补丁和无效字段。
- 扩大跨学科金标题库。
- 基于真实使用数据调整介质路由，不按审美增加插件。

### Technology Stack Recommendations

采用“一个协议，多种专用引擎”，具体建议如下：

- **公式与数学排版**：继续使用 KaTeX。
- **动态几何、函数图像、数轴和参数探索**：继续使用已经引入的 JSXGraph；其官方定位就是可交互几何、函数图和数据可视化，也已有 Moodle 等教育集成。
- **小型条件关系与因果链**：优先原生 SVG + 确定性布局，保证移动端字号和阅读顺序。
- **节点较多、需要拖动/缩放和多布局的关系网络**：引入 Cytoscape.js；它提供图模型、算法布局、移动端手势和 headless 分析，但不应用在简单三五节点关系图上。
- **通用静态流程图**：Mermaid 只作为低成本降级，不作为主要教学交互引擎；其文本语法和自动布局方便，但精细指向、逐元素状态与移动端控制不足。
- **证据标注、对照矩阵、时间线**：React 语义 DOM，获得最佳可读性和无障碍能力，不需要画布库。
- **教学动作动画**：继续使用 Motion，只做渐进揭示、变形映射和状态变化。
- **手绘风格**：Rough.js 从核心链路移除；只有经过验证确实帮助注意力时，才作为可选皮肤。
- **3D、视频、任意 HTML 模拟**：暂不采用。

JSXGraph 官方提供动态几何与函数图；Cytoscape.js 官方支持交互图、图算法和多种自动布局。最好的选择不是用一个更重的库替换 Rough.js，而是让 DSL 根据教学表达路由到正确引擎。

_Sources: https://jsxgraph.org/home/ ; https://jsxgraph.org/home/start/plugins/ ; https://js.cytoscape.org/ ; https://mermaid.js.org/syntax/flowchart.html_

### Skill Development Requirements

- 结构化模型输出与严格校验。
- 学科语义到视觉表达的映射设计。
- SVG/JSXGraph/Cytoscape 的确定性布局与交互。
- 流式状态机、可恢复动作游标和局部失败处理。
- 教学效用评测，而不只是 UI 和接口测试。

### Success Metrics and KPIs

上线前先建立基线，再为以下指标设阈值：

- **内容增益率**：板书提供了 Chat 中没有的关系、过程、证据或可操作验证。
- **重复率**：板书场景之间、板书与 Chat 之间的同义复述比例。
- **任务完成率**：学生看板书后能否完成当前检查点或下一步。
- **首个有效场景延迟**：不是接口返回时间，而是用户首次看到可学习内容的时间。
- **场景成功率**：无需降级或重试即可通过结构与事实验收的比例。
- **布局可读率**：无重叠、无越界、字号达标、阅读顺序明确。
- **交互有效率**：用户操作后能否观察到与知识点直接相关的变化。
- **安全率**：不泄露当前阶段受保护答案，不生成无依据事实。
- **退出与重试率**：用户在何种场景放弃板书或返回 Chat。

最终北极星指标不是“生成了多少图”，而是：**学生是否比只看 Chat 更快完成当前认知任务。**

# Research Synthesis：从文字卡片到可执行教学板书

## Executive Summary

当前板书已经具备跨学科模板、语义视觉、学段适配和移动端长页呈现，但它本质上仍是“五段式学习卡”：模型生成相近结构的文字，前端补少量静态图，再按固定顺序展示。继续调整卡片样式或更换手绘库，只会改善外观，不会提升板书的学习价值。

OpenMAIC 的核心启发并不是多 Agent、PPT 或视频，而是把教学内容拆成场景、元素、动作和播放状态。内容先被规划成合适的表达介质，再由专用生成器和渲染器完成；讲解动作拥有稳定目标和顺序。它同时暴露了重要边界：模型坐标不可靠、通用 HTML 协议容易漂移、截图反馈收益低、深度思考不适合实时路径。因此我们的方案应比 OpenMAIC 更收敛：保留单题学习、即抛即用和现有 Next.js 单体，只重建板书内容引擎。

最终建议是建设版本化 `BoardExperience` DSL，引入隐藏的 Board Director，让场景数从固定五个变成按学习目标生成的 2–6 个；首批落地公式推导、关系图、原文证据标注三个高收益插件，再增加动作时间轴、局部修复和动态几何。Rough.js 退出核心链路，技术栈采用 KaTeX、JSXGraph、原生 SVG/DOM、Motion，以及复杂关系网络需要时才引入的 Cytoscape.js。

### Key Findings

- 板书失败的根因是内容结构固定，不是绘制风格不足。
- “图”必须来自教学表达决策，不能由关键词正则事后补充。
- 场景、语义元素、教学动作和运行进度必须分离。
- 模型负责语义，代码负责布局、冲突、字号、引用和安全校验。
- 动效只服务认知顺序，不再模拟模型逐字输出。
- 即抛即用产品不需要复制课程存储、视频生产和完整课堂基础设施。

### Strategic Recommendations

1. 停止继续扩张旧五卡结构，先建立新板书协议。
2. 用三个垂直插件证明内容增益，再扩展动态图形。
3. 将首个有效场景延迟和检查点完成率设为核心指标。
4. 新旧并存只作为短期迁移，必须明确删除旧模板的时间点。
5. 所有库按表达场景选择，不设“统一万能画布”。

## Table of Contents

1. 技术研究意义与方法
2. 目标架构
3. 实施方法与工程边界
4. 技术栈选择
5. 集成与互操作
6. 性能与扩展
7. 安全与内容治理
8. 战略价值
9. 路线与风险
10. 后续创新机会
11. 来源与可信度
12. 最终结论

## 1. Technical Research Introduction and Methodology

### Technical Significance

板书模式如果只是把 Chat 内容重新排版，会增加一个入口、一套交互和一段等待，却没有增加理解收益。真正有价值的板书必须将抽象关系外显、把推导过程变成可追踪动作、把材料依据直接锚定到原文，并让学生通过操作或回答验证理解。

OpenMAIC 已将课程拆成 outline、scene content、actions、DSL renderer 和 playback engine，并继续把 DSL、renderer、editor 和 generation 做成独立边界。这为“AI 生成的教学内容如何从文本升级为运行时”提供了当前可验证的工程样本。

_Sources: https://github.com/THU-MAIC/OpenMAIC ; https://github.com/THU-MAIC/OpenMAIC/releases_

### Methodology

- 阅读 OpenMAIC 官方 README、生成包、DSL/Renderer、Action Engine、Playback Engine 和技术讨论。
- 检查当前项目的 `BoardLesson`、`BoardPlan`、生成管线、学科引擎、视觉补充、工作区和测试。
- 区分事实、工程推断和产品决策；仅把官方代码与文档作为外部技术事实依据。
- 以内容增益、移动端可读性、实时延迟、局部失败和答案安全为评价轴。

## 2. Technical Landscape and Target Architecture

目标系统保持模块化单体，内部采用四层模型：

- `Scene`：解决一个明确认知问题。
- `Element`：可被引用的公式、证据、节点、边、状态或图形对象。
- `Action`：对元素执行揭示、连接、变形、强调、设值或提问。
- `Playback`：记录场景和动作游标，支持暂停、恢复和局部重播。

Board Director 根据题目、学段、当前卡点、Chat 上下文和学习目标决定 2–6 个场景及介质。专用生成器生成语义元素和动作，Validator 负责结构、事实、答案边界与布局输入，Renderer 将其确定性呈现。这个结构避免把内容策略、模型通信和 UI 状态继续塞进同一函数或组件。

OpenMAIC 的官方生成代码明确采用场景提纲与场景内容/动作分阶段生成；播放引擎直接消费动作序列。我们借用该模式，但不复制完整课程和多 Agent 调度。

_Sources: https://github.com/THU-MAIC/OpenMAIC/blob/main/packages/%40openmaic/generation/src/outline-generator.ts ; https://github.com/THU-MAIC/OpenMAIC/blob/main/packages/%40openmaic/generation/src/scene-generator.ts ; https://github.com/THU-MAIC/OpenMAIC/blob/main/lib/playback/engine.ts_

## 3. Implementation Approaches and Best Practices

实施采用垂直切片：每次交付都必须完成 Director 路由、Scene 生成、元素校验、渲染、动作和测试，而不是先造一个庞大 DSL 再等待内容接入。

第一批三个切片：

- 公式推导：每一步有表达式、变换依据、不变量和可选检查点。
- 关系图：把对象、条件、目标及方向关系显式化。
- 原文证据：保留原句，标记证据范围，并说明它支持哪个判断。

现有 Provider Adapter 继续管理豆包等模型；生成器只依赖抽象模型调用。旧 `BoardLesson` 通过单向 Adapter 转换到新协议，禁止新能力反向写入旧结构。新链路稳定后删除固定五单元提示词、无效布局字段和正则视觉补丁。

## 4. Technology Stack Evolution and Selection

最终技术栈采用按场景最优，而不是单库统一：

- KaTeX：公式排版。
- JSXGraph：动态几何、函数图、数轴和参数探索。其官方定位即为浏览器交互数学、几何和函数可视化，并已有教育平台集成。
- 原生 SVG：小规模关系图、受力图、光路和因果链，确保布局与字号可控。
- Cytoscape.js：只有节点较多、需要图算法、多布局或复杂交互时引入；支持移动端手势和 headless 图分析。
- React 语义 DOM：材料证据、对照矩阵和时间线。
- Motion：渐进揭示、状态变化和映射动画。
- Mermaid：普通静态流程图的低成本降级。
- Rough.js：移出核心，仅可作为经过验证的视觉纹理。

_Sources: https://jsxgraph.org/home/ ; https://jsxgraph.org/home/start/plugins/ ; https://js.cytoscape.org/ ; https://mermaid.js.org/syntax/flowchart.html_

## 5. Integration and Interoperability Patterns

现有 SSE 增加 `board.scene`、`board.action`、`board.patch`、`board.checkpoint` 四类事件。前端收到完整语义内容后立即展示，不再人为逐字拖慢；只有教学动作由 Playback 控制顺序。

所有渲染插件遵循统一契约：`render`、`setState`、`highlight`、`reveal`、`reset`、`getAnswer`。动作只通过稳定元素 ID 寻址。OpenMAIC 的交互组件曾因部分模板缺少消息监听契约而导致动作静默失效，这说明协议必须由共享代码校验，不能复制到多个提示词后依赖模型自觉遵守。

_Sources: https://github.com/THU-MAIC/OpenMAIC/discussions/423 ; https://github.com/THU-MAIC/OpenMAIC/issues/871 ; https://nextjs.org/docs/app/getting-started/route-handlers_

## 6. Performance and Scalability Analysis

性能目标是“首个有效场景尽快可学”，不是“整份板书接口尽快结束”。Director 完成后优先生成最能解决卡点的一屏，其余场景并行或延后；局部失败只修复当前 Scene。大型渲染库按 Scene 动态加载。

OpenMAIC 的实践显示，代码几何冲突检测能显著改善布局，而渲染截图反馈收益接近零；深度思考可提质，但其测试中 p50 达 63 秒、p95 达 258 秒，不适合实时教学。我们的实时路径应依赖受限 DSL、专用生成器和本地校验。

_Source: https://github.com/THU-MAIC/OpenMAIC/discussions/489_

## 7. Security and Content Governance

- 模型只能输出白名单 Scene、Element 和 Action。
- 每个动作执行前验证目标存在、依赖完成、当前阶段允许。
- 题目事实、推导依据和原文证据必须保留来源引用。
- 答案保护在 Scene 和 Action 两层执行，防止通过图形或状态提前泄露。
- 任意模型 HTML 不进入核心链路；若未来引入，必须 iframe 沙箱、受限消息协议和本地验证。
- 不建设长期学生档案；只保留本题会话所需状态和临时资产。

## 8. Strategic Technical Recommendations

真正的产品差异化不是“AI 能画图”，而是系统能判断什么时候不该画图、该画什么、学生需要操作什么，以及操作后是否更懂。场景路由、学科插件和效用验收共同构成核心壁垒；单一绘图库、提示词或模型供应商都不是壁垒。

优先投资内容协议、三个垂直插件和评测体系。动态几何与过程模拟在基础稳定后扩展。视频、3D、游戏和多 Agent 课堂只有在真实题型证明必要时再立项。

## 9. Implementation Roadmap and Risk Assessment

### Roadmap

1. 协议：新 DSL、Validator、Adapter 和金标题基线。
2. 内容：Director + 公式推导、关系图、原文证据。
3. 运行时：场景 SSE、动作游标、暂停恢复和局部修复。
4. 互动：动态几何、函数参数、物理/化学过程状态。
5. 清理：删除固定五卡、旧视觉补丁和无效状态分支。

### Primary Risks

- 最大产品风险：生成了更多组件，但内容仍是 Chat 复述。
- 最大工程风险：新旧两套板书语义长期并存。
- 最大模型风险：介质选择正确，但内容或元素引用不可靠。
- 最大体验风险：为了丰富而增加场景、动画和等待。

对应措施是内容增益验收、单向迁移、严格协议校验和场景上限。整体属于中等重构；完整跨学科互动引擎属于后续大工程。

## 10. Future Technical Outlook and Innovation Opportunities

近期重点应是稳定的场景路由和可执行板书。中期可以增加参数探索、学生操作轨迹和根据错误动作生成的局部纠偏。更长期的机会是形成可复用的“学科认知组件库”：同一个守恒关系、因果链或证据定位组件可以跨题复用，但内容始终来自当前题，而不是套用固定讲稿。

媒体生成、3D 和视频可以成为少数高价值主题的增强层，不能成为基础可用性的依赖。

## 11. Technical Research Methodology and Source Verification

主要来源均为 OpenMAIC 官方仓库、官方代码、官方讨论，以及 Next.js、Playwright、JSXGraph、Cytoscape.js、Mermaid 的官方文档。对 OpenMAIC 的能力描述置信度高；对当前项目的实施判断基于本地代码审计，置信度高；对具体插件提升学生成绩的效果尚无真实对照实验，因此只能通过下一阶段的金标题和用户测试验证。

关键来源：

- https://github.com/THU-MAIC/OpenMAIC
- https://github.com/THU-MAIC/OpenMAIC/tree/main/packages/%40openmaic/generation
- https://github.com/THU-MAIC/OpenMAIC/blob/main/lib/action/engine.ts
- https://github.com/THU-MAIC/OpenMAIC/blob/main/lib/playback/engine.ts
- https://github.com/THU-MAIC/OpenMAIC/discussions/423
- https://github.com/THU-MAIC/OpenMAIC/discussions/489
- https://github.com/THU-MAIC/OpenMAIC/issues/871
- https://jsxgraph.org/home/
- https://js.cytoscape.org/
- https://playwright.dev/docs/next/test-snapshots

## 12. Technical Research Conclusion

OpenMAIC 证明了内容生成、场景类型、动作协议和播放运行时可以共同构成丰富教学体验；也证明了让模型承担坐标、任意 HTML 和过长推理会产生现实问题。对当前产品最正确的方向不是复制 OpenMAIC，而是提取其中最有价值的架构骨架，并围绕单题学习做更严格、更轻量的实现。

最终决策：**停止把板书理解为长页面；开始把它建设成能组织知识、操纵表达、等待学生行动并验证理解的场景运行时。**

研究完成日期：2026-09-03  
技术置信度：高  
主要限制：尚需通过真实小初高用户和跨学科题库验证学习效果

---

<!-- Content will be appended sequentially through research workflow steps -->
