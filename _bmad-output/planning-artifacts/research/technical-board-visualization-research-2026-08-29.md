# 板书教学示意图技术选型

## 结论

采用 Rough.js 绘制受约束的 SVG 教学示意图。模型不输出 SVG、图片网址或任意绘图代码，只输出经过服务端校验的图元、标签、图注和题干证据；程序再将这些结构化数据绘制成有板书质感的静态图。

这不是“给板书加装饰”。只有几何关系、光路、数量关系或过程关系能明显降低理解成本时才配图；没有可靠依据时保持纯文字板书。

## 候选方案

- Rough.js：MIT；体积小；同时支持 Canvas 与 SVG；覆盖线、箭头、圆、矩形、圆弧等跨学科基础图元。适合当前受约束、不可编辑的板书示意图。
- Mafs：MIT；React 数学可视化能力成熟，适合函数、坐标和交互数学图，但对物理、化学过程图覆盖不足，首版不引入。
- JSXGraph：LGPL/MIT 双许可；几何、函数和数据可视化能力完整，但运行时和交互模型明显重于当前需求。
- Mermaid：MIT；适合流程图和文档图，不适合精细几何、光路和题目条件示意。

## 可靠性边界

1. `evidence` 必须逐字来自原题或已验证知识卡点，学生错误作答不能成为绘图依据。
2. 坐标使用固定 `0..100 × 0..68` 画布，图元限定为 point、line、arrow、circle、rect、arc，最多 16 个。
3. 图形、标签和图注一起执行答案防泄露校验。
4. 独立审校同时判断正文、标记、配图是否正确和有依据；未通过时不展示候选配图。
5. 配图为静态示意图，不自动播放，明确标注“不按比例”。

## 来源

- Rough.js：https://github.com/rough-stuff/rough
- Mafs：https://github.com/stevenpetryk/mafs
- JSXGraph：https://github.com/jsxgraph/jsxgraph
- Mermaid：https://github.com/mermaid-js/mermaid
