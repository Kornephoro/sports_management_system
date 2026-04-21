# Build Order v1

## 1. 文档目的

本文档定义本项目 v1 的开发切片顺序、每一轮的目标、边界和验收标准。  
它的作用不是描述最终产品，而是约束实现节奏，避免在 vibe coding 过程中失控。

本项目采用：

> **小步快跑、单轮单目标、逐轮验收**

每一轮都必须做到：

1. 只做一个清晰切片
2. 明确不做什么
3. 有可验证结果
4. 不擅自扩张范围
5. 如果发现领域文档冲突，先报告，不自行改模型

---

## 2. 开发总原则

### 2.1 永远先跑通主链路，再做增强体验

v1 主链路是：

`Program -> PlannedSession -> PlannedUnit -> SessionExecution -> UnitExecution`

增强能力如：

- dashboard 美化
- AI 智能解释
- 推荐系统
- 自动调度优化
- 康复策略自动处方

都必须在主链路可靠后再做。

### 2.2 每一轮只允许一个主目标

允许顺手补一些必要的小东西，但不允许一轮内同时做：

- schema
- 业务逻辑
- 页面系统
- 文件上传
- AI 解析
- 复杂图表

### 2.3 每一轮必须留下可验证产物

例如：

- migration 成功
- 页面能打开
- API 可调用
- 一条记录能写入数据库
- 一次上传能生成 EvidenceAsset

### 2.4 不允许在没有文档支持时新增领域对象

如果实现过程中觉得需要新对象：

1. 先列出来
2. 说明原因
3. 先不落库
4. 等人工决定后再修改文档

### 2.5 v1 中 json 字段优先保留，不提前完全正规化

尤其是以下内容：

- payload
- policy config
- parsed summary
- current state
- restriction rules
- training implications

---

## 3. 开发阶段总览

v1 推荐拆成 8 轮：

1. 项目骨架与基础设施
2. 数据库 schema 与 migration
3. seed 数据与最小数据访问层
4. Program / Session / Execution 主链路后端
5. 最小前端页面
6. Observation 与 Dashboard 初版
7. Evidence 上传与解析状态流转
8. Constraint / Injury 最小闭环

---

## 4. 第 1 轮：项目骨架与基础设施

### 4.1 本轮目标

建立最小可运行的全栈项目骨架。

### 4.2 本轮要做

- 初始化 Next.js + TypeScript 项目
- 接入 Tailwind CSS
- 安装 Prisma
- 接入 Supabase 所需基础依赖
- 建立基础目录结构
- 配置环境变量读取
- 初始化 `prisma/schema.prisma`
- 配置基础 lint / format（如果工具默认已有，可沿用）

### 4.3 本轮不做

- 不写业务页面
- 不写数据库实体
- 不写 migration
- 不做上传
- 不做 AI 解析
- 不做任何复杂 UI

### 4.4 验收标准

- 项目可以本地运行
- Next.js 首页可正常打开
- Prisma 可执行
- 环境变量可被读取
- 目录结构符合 `/docs/04-architecture-v1.md`

### 4.5 期望产物

- 初始工程代码
- `package.json`
- `tsconfig.json`
- Tailwind 配置
- Prisma 初始配置
- `.env.example`

---

## 5. 第 2 轮：数据库 schema 与 migration

### 5.1 本轮目标

把 `/docs/02-core-domain-v1.md` 中的核心实体落成 Prisma schema，并生成 migration。

### 5.2 本轮要做

实现以下 14 个实体的 schema：

1. Goal
2. Program
3. Block
4. SessionTemplate
5. TrainingUnitTemplate
6. ProgressTrack
7. PlannedSession
8. PlannedUnit
9. SessionExecution
10. UnitExecution
11. Observation
12. EvidenceAsset
13. ConstraintProfile
14. InjuryIncident

同时：

- 定义主要枚举
- 定义主外键关系
- 保留必要 JSON 字段
- 生成 migration

### 5.3 本轮不做

- 不写 seed 逻辑
- 不写 API
- 不写 UI
- 不写 AI 解析
- 不写复杂索引优化
- 不写 DerivedAssessment / Recommendation / RehabPlan

### 5.4 验收标准

- Prisma schema 可通过校验
- migration 可执行成功
- 数据库中成功生成表
- 表结构与文档一致
- 没有擅自新增领域对象

### 5.5 期望产物

- `prisma/schema.prisma`
- migration 文件
- schema 说明或注释（如果工具愿意补）

---

## 6. 第 3 轮：seed 数据与最小数据访问层

### 6.1 本轮目标

让数据库里有可供演示和调试的基础数据，并建立最基本的数据访问能力。

### 6.2 本轮要做

- 编写基础 seed
- 至少插入一套 demo 数据：
  - 1 个 Goal
  - 1 个 Program
  - 1 个 Block
  - 2~3 个 SessionTemplate
  - 若干 TrainingUnitTemplate
  - 若干 ProgressTrack
- 建立 Prisma client 封装
- 建立基础 repository 目录结构
- 实现少量只读查询用于开发验证

### 6.3 本轮不做

- 不做完整 service 层
- 不做页面
- 不做 session execution 写入逻辑
- 不做 Evidence 流程
- 不做 Constraints 写入 UI

### 6.4 验收标准

- seed 可执行
- 数据库中有完整的 demo 数据链
- 可以通过简单查询拿到 Program 及其下级结构
- repository 结构符合 architecture 文档

### 6.5 期望产物

- `prisma/seed.ts`
- `src/lib/prisma.ts`
- `src/server/repositories/*`

---

## 7. 第 4 轮：Program / Session / Execution 主链路后端

### 7.1 本轮目标

建立最小可用的训练主链路后端能力。

### 7.2 本轮要做

至少实现以下用例：

- create program
- get program detail
- generate planned sessions
- list planned sessions
- create session execution
- create unit executions
- mark session completed / partial / skipped

推荐组织方式：

- use cases
- services
- route handlers 或 server actions

### 7.3 本轮不做

- 不做复杂自动调度
- 不做复杂 progression 自动计算
- 不做 dashboard
- 不做图片上传
- 不做 constraints 介入逻辑
- 不做 AI 自动计划生成

### 7.4 验收标准

- 能创建 Program
- 能基于模板生成 PlannedSession / PlannedUnit
- 能记录一次 SessionExecution
- 能记录关联的 UnitExecution
- 一次完整训练闭环可用代码验证

### 7.5 期望产物

- `src/server/services/programs/*`
- `src/server/services/sessions/*`
- `src/server/services/executions/*`
- 对应 route handlers / server actions

---

## 8. 第 5 轮：最小前端页面

### 8.1 本轮目标

让用户能通过页面看到 Program、今日训练、历史执行。

### 8.2 本轮要做

实现最小页面集：

- Dashboard 占位页
- Program 列表页
- Program 详情页
- Today Session 页
- Execution 列表页
- Execution 详情页

要求：

- 先追求清楚可用
- 不追求复杂设计
- 允许使用简单组件拼装

### 8.3 本轮不做

- 不做图表系统
- 不做 fancy UI
- 不做复杂筛选
- 不做上传
- 不做 constraints 页面
- 不做 AI 结果确认页

### 8.4 验收标准

- 可通过页面查看 Program
- 可通过页面查看今天训练
- 可通过页面查看历史执行
- 页面能从真实数据库读取数据
- 页面结构与主链路一致

### 8.5 期望产物

- `/src/app/*` 页面
- `/src/features/programs/*`
- `/src/features/sessions/*`
- `/src/features/executions/*`

---

## 9. 第 6 轮：Observation 与 Dashboard 初版

### 9.1 本轮目标

支持身体与恢复观测值记录，并在 Dashboard 展示最小趋势。

### 9.2 本轮要做

实现：

- create observation
- list observations by metric
- 获取最近 observation summary

页面上支持：

- 手动记录体重
- 手动记录睡眠
- 手动记录疲劳或疼痛
- Dashboard 展示最近几条关键指标

### 9.3 本轮不做

- 不做复杂统计分析
- 不做自动 readiness score
- 不做饮食系统
- 不做高级图表交互
- 不做康复建议引擎

### 9.4 验收标准

- 可以新增 Observation
- 可以按 `metric_key` 查询
- Dashboard 可显示基础趋势
- Observation 可与 SessionExecution 或 EvidenceAsset 关联

### 9.5 期望产物

- observations API / actions
- observations 页面或表单组件
- dashboard 初版模块

---

## 10. 第 7 轮：Evidence 上传与解析状态流转

### 10.1 本轮目标

把证据上传链跑通，即使 AI 解析先 mock 也可以。

### 10.2 本轮要做

实现：

- 文件上传到 Supabase Storage
- 创建 EvidenceAsset
- `parse_status = pending`
- 提供 mock parse 流程
- 更新为 `parsed / needs_review / confirmed / rejected / failed`
- 支持把确认结果写入：
  - Observation
  - SessionExecution
  - UnitExecution
  - InjuryIncident（可以只保留入口）

### 10.3 本轮不做

- 不做真正复杂 vision 提取
- 不做多文件批量处理
- 不做异步队列系统
- 不做复杂证据合并

### 10.4 验收标准

- 文件可上传
- 数据库生成对应 EvidenceAsset
- 状态可从 pending 流转到 parsed / confirmed
- 至少一种确认入库路径能跑通

### 10.5 期望产物

- evidence upload 页面
- evidence 列表页
- evidence 详情 / review 页面
- storage 集成代码
- parse mock 逻辑

---

## 11. 第 8 轮：Constraint / Injury 最小闭环

### 11.1 本轮目标

把康复限制域以最小形式接入主链路。

### 11.2 本轮要做

实现：

- create constraint profile
- list active constraints
- resolve constraint profile
- create injury incident
- link injury incident to constraint profile
- 在生成 PlannedSession / PlannedUnit 时读取 active constraints
- 最小化支持：
  - 过滤某些 contraindication tags
  - 给 PlannedUnit 写入 `constraint_snapshot`

### 11.3 本轮不做

- 不做完整 RehabPlan
- 不做 RehabUnitTemplate
- 不做自动医学判断
- 不做复杂维护暴露预警引擎
- 不做复杂 return-to-training 评分

### 11.4 验收标准

- 可以创建和查看 active constraints
- 可以记录 injury incident
- 生成计划时能读取 constraint
- 某些单元可因限制而被替换、跳过或记录 snapshot
- 主链路不会因 constraint 逻辑崩坏

### 11.5 期望产物

- constraints 页面
- injuries 页面
- constraint-aware planning 最小实现
- 相关服务层逻辑

---

## 12. 第 9 轮以后再考虑的内容

以下内容不是 v1 核心构建顺序的一部分，必须在前 8 轮稳定后再考虑：

- DerivedAssessment
- Recommendation
- RehabPlan
- RehabUnitTemplate
- NutritionEntry
- Purchase / Inventory
- RewardLedger
- 自动 readiness score
- 自动调度器增强版
- 真正的 AI 解析生产链
- 分享 / 协作模型
- 面向大众的 onboarding 流程

---

## 13. 每一轮提交给 vibe coding 的标准模板

每轮任务都建议使用以下结构：

```text
你现在是这个项目的实现工程师，不是产品设计师。
请严格以 /docs/02-core-domain-v1.md、/docs/04-architecture-v1.md 和 /docs/06-build-order.md 为准。

本轮目标：
[只写一个切片目标]

本轮要做：
[列出本轮要做的事情]

本轮不做：
[列出明确边界]

硬约束：
- 不要改动文档中的实体命名
- 不要擅自新增领域对象
- 不要把 json 字段过度拆表
- 如果发现文档冲突，只指出冲突，不要自行重构

输出要求：
1. 先复述你理解到的目标和边界
2. 列出将修改/新增的文件
3. 给出实现方案
4. 给出关键代码
5. 给出验证方式
6. 给出风险和未完成项
```

---

## 14. 每一轮都要检查的清单

在接受 vibe coding 产物前，至少检查以下问题：

1. 是否超出了本轮范围
2. 是否偷偷改了领域命名
3. 是否把 json 字段拆得太细
4. 是否把 Template / Planned / Execution 混在一起
5. 是否为了方便实现而删除了 `ProgressTrack`
6. 是否把 `ConstraintProfile` 降级成备注
7. 是否给出了可验证结果
8. 是否说明了暂时假设和技术债

---

## 15. 当前推荐的第一轮实际执行顺序

虽然本文件整体定义了 8 轮，但你现在真正应该立刻开始的是：

### 当前第一步
执行第 1 轮：项目骨架与基础设施

### 当前第二步
执行第 2 轮：数据库 schema 与 migration

### 当前第三步
执行第 3 轮：seed 数据与最小数据访问层

不要跳着做 UI。  
不要一上来就接 AI。  
不要先做 dashboard。  
先把“骨架 + 数据库 + 主链路后端”打稳。

---

## 16. 文档维护规则

如果未来发生以下情况，必须回写本文件：

- 新增一个正式开发轮次
- 调整某一轮的范围
- 决定提前引入新基础设施
- 决定将某个 v2 模块提前到 v1
- 发现原开发顺序明显不合理

本文件不是一次性文档，而是开发节奏的约束文件。

---

## 17. 当前版本结论

当前 v1 的正确推进顺序是：

1. 项目骨架
2. 数据库 schema
3. seed 与数据访问
4. 主链路后端
5. 最小页面
6. Observation
7. Evidence
8. Constraint / Injury

只要按这个顺序推进，你就不容易再次陷入“千头万绪、做到一半迷失方向”。

## 18. 第 9 轮完成状态补充

### 18.1 第 9 轮定位
第 9 轮不是新增业务能力轮次，而是 v1 稳定化轮次。

它的目标是：

- 收口已有验证脚本
- 建立统一验证入口
- 为后续继续迭代提供最小回归能力
- 在不引入重型测试框架的前提下，提升 v1 稳定性

### 18.2 第 9 轮完成结果
当前第 9 轮已完成：

- 统一入口验证脚本
- 最小错误态验证
- `npm run verify:v1` 统一执行约定

这意味着当前 v1 已经具备最小的“继续迭代前回归检查”能力。

---

## 19. 第 10 轮建议方向

### 19.1 第 10 轮目标
建议第 10 轮继续保持“稳定化优先”的思路，而不是马上扩展新业务模块。

推荐目标：

- 将 `npm run verify:v1` 接入最小 CI 或 pre-release 检查
- 固定失败输出格式
- 保证后续每轮开发都能重复执行当前 v1 回归验证

### 19.2 第 10 轮原则
第 10 轮应继续遵循：

- 不扩业务
- 不改 schema
- 不重构当前验证体系
- 只做最小接入与最小收口

### 19.3 为什么现在先做这个
原因是当前项目已经具备：

- 主链路
- 页面壳
- Observation
- Evidence
- Constraint / Injury
- 统一回归入口

因此，继续直接扩新能力的收益，已经低于先把“持续回归”能力固定下来的收益。

---

## 20. 当前 build order 结论更新

当前阶段建议顺序更新为：

1. 已完成主链路与核心切片
2. 已完成 v1 稳定化统一验证入口
3. 下一步优先接入最小 CI / pre-release 验证
4. 之后再决定是否进入新的业务扩展切片

这意味着当前项目已经从“快速堆功能阶段”进入“边迭代边守边界阶段”。

## 21. 第 10 轮完成状态补充

### 21.1 第 10 轮定位
第 10 轮是“最小持续回归接入”轮次，而不是业务扩展轮次。

它的目标是：

- 将 `verify:v1` 从本地脚本提升为持续执行入口
- 增加提交前自检能力
- 让后续每轮开发都默认带回归门禁

### 21.2 第 10 轮完成结果
当前第 10 轮已完成：

- `verify:v1` 统一入口继续保留
- `preflight:v1` 本地提交前自检入口已建立
- GitHub Actions `v1-regression` workflow 已加入项目
- `verify:v1` 的失败输出格式已统一

### 21.3 第 10 轮验收标准
第 10 轮真正结束，应满足：

1. 本地 `npm run verify:v1` 通过
2. 本地 `npm run preflight:v1` 通过
3. GitHub Actions workflow 文件已提交到正确路径
4. 所需 secrets 已配置
5. 至少一次 CI 成功运行

如果前 4 项已完成但第 5 项尚未验证，则视为“代码完成，CI 门禁待验收”。

---

## 22. 第 11 轮建议方向

### 22.1 推荐方向
建议第 11 轮继续保持“轻量稳定化”思路，而不是立即扩业务。

推荐目标：

- 将 `verify:v1` 的 summary JSON 作为 CI artifact 上传
- 或在 PR 模板中加入“已执行 preflight:v1”勾选项
- 或两者二选一，但保持最小

### 22.2 原因
因为当前项目已经有：

- 核心业务主链路
- 页面壳
- Observation / Evidence / Constraint / Injury 最小闭环
- 统一回归入口
- 最小 CI 接入

此时继续强化“可追溯性”和“可执行的门禁习惯”，收益高于立即扩新业务。

---

## 23. 当前 build order 结论更新

当前阶段建议顺序更新为：

1. 已完成核心主链路与主要切片
2. 已完成统一回归入口
3. 已完成最小持续回归接入
4. 下一步优先做轻量门禁细化或可追溯性增强
5. 之后再决定是否进入新的业务扩展切片

这意味着当前项目已经从“功能堆叠阶段”进一步进入“持续验证阶段”。

## 24. 第 11 轮完成状态补充

### 24.1 第 11 轮定位
第 11 轮是“回归门禁细化”轮次。  
它不是新增业务能力，也不是测试体系重构，而是在第 10 轮“最小持续回归接入”的基础上，继续增强：

- 结果可追溯性
- 团队使用友好性
- CI / 本地门禁的协同感

### 24.2 第 11 轮完成结果
当前第 11 轮已完成：

- `verify:v1` summary JSON 落盘
- CI artifact 上传
- PR 模板加入 `preflight:v1` 勾选项
- README 中补充最小使用说明
- `.gitignore` 收口本地产物目录

### 24.3 第 11 轮验收标准
第 11 轮可视为完成的标准为：

1. 本地 `verify:v1` 可正常执行
2. 本地 `preflight:v1` 可正常执行
3. `verify:v1` 可落 summary JSON
4. CI 能上传 summary artifact
5. PR 模板已进入仓库并可被协作流程使用

### 24.4 当前阶段结论
截至第 11 轮，项目已经完成：

- 核心主链路
- Observation / Evidence / Constraint / Injury 最小闭环
- 统一回归入口
- 最小持续回归接入
- 可追溯门禁细化

因此，项目当前可以从“稳定化轮次”回到“产品可用性优化轮次”。

---

## 25. 第 12 轮建议方向

### 25.1 第 12 轮优先目标
建议第 12 轮优先处理第一次内部演示中暴露出的**主链路可用性问题**，而不是继续扩新能力。

尤其优先处理：

- Program 页面进入较慢
- Program 详情中 `SessionTemplate / TrainingUnitTemplate` 难以区分
- Planned Sessions 生成失败：
  `No enabled session templates found under this program`
- 首页没有“推荐操作顺序”
- 主链路从 Program 到 Execution 的行为链不够清晰

### 25.2 第 12 轮原则
第 12 轮应聚焦：

- 主链路可用性修复
- 最小术语解释
- 最小引导优化
- 不扩业务边界
- 不改 schema

---

## 26. 当前 build order 结论更新

当前阶段建议顺序更新为：

1. 已完成核心主链路与主要功能闭环
2. 已完成统一回归与门禁细化
3. 下一步优先修复 Program 主链路可用性问题
4. 在主链路顺畅后，再决定是否继续优化其他页面体验或扩展新业务能力

这意味着当前项目的下一个重点不再是“继续加模块”，而是“把现有最核心闭环真正变得顺手可用”。

## 27. 第 14 轮完成状态补充

### 27.1 第 14 轮定位
第 14 轮是“第二次内部演示前最小联调彩排入口”轮次。

它的目标不是新增能力，而是：

- 在正式演示前增加一个更贴近演示流程的统一检查入口
- 让 Demo Program 可用性与现有 v1 回归一起被执行
- 让失败结果可落盘、可追溯、可提示下一步

### 27.2 第 14 轮完成结果
当前第 14 轮已完成：

- `verify:demo-readiness` 命令入口
- Demo Program 存在性与 readiness 前置检查
- 对既有 `verify:v1` 的复用
- `demo-readiness-summary.json` 落盘
- 失败场景下的 nextActions 指引

### 27.3 第 14 轮验收结论
第 14 轮应区分两个层次理解：

#### 工程层
已完成。  
因为脚本、命令入口、summary 落盘与失败分支行为都已实现。

#### 环境层
尚未完全通过。  
因为当前机器仍存在数据库 TLS / 连接问题，导致演示彩排当前未能全绿通过。

因此，本轮可视为：

> 工具与流程完成，演示环境待修。

---

## 28. 第 15 轮建议方向

### 28.1 推荐方向
建议第 15 轮继续保持“轻量稳定化”思路，优先处理：

- 演示环境稳定性前置自检
- 数据库连接前置检查
- TLS / 连接串问题的最小可读提示

### 28.2 原因
因为当前业务能力和页面闭环已经够用，第二次内部演示当前真正的风险点不在“功能缺失”，而在“环境不稳定导致彩排失败”。

### 28.3 原则
第 15 轮应：

- 不扩业务
- 不改 schema
- 不重构回归体系
- 只增强演示环境可执行性和前置诊断能力

---

## 29. 当前 build order 结论更新

当前阶段建议顺序更新为：

1. 已完成核心业务闭环
2. 已完成统一回归与门禁细化
3. 已完成内部演示前彩排入口
4. 下一步优先修复演示环境稳定性问题
5. 环境稳定后，再进行第二次内部演示

## 30. 第 15 轮完成状态补充

### 30.1 第 15 轮定位
第 15 轮是“演示环境稳定性前置自检与连接提示最小修复”轮次。  
它的目的不是继续扩展演示能力，而是把 `verify:demo-readiness` 做到“失败原因更容易解释”。

### 30.2 第 15 轮完成结果
当前第 15 轮已完成：

- 环境变量前置检查
- 数据库可达性前置检查
- TLS / 连接错误最小分类
- 更可读的 nextActions
- 失败时继续输出 summary

### 30.3 当前阶段判断
第 15 轮之后，演示相关的工具链已经达到“足够支撑定位问题”的程度。  
继续在这一方向追加投入的边际收益已经明显下降。

---

## 31. 当前方向切换说明

### 31.1 当前建议
从第 16 轮开始，建议将重心从：

- 演示前工具链
- 环境前置诊断
- 展示流程稳定化

切回到：

- 产品主链路继续完善
- 核心使用价值增强
- 训练模块的真实操作能力提升

### 31.2 原因
因为当前项目已经具备：

- Program / Planned Sessions / Execution 主链路
- Observation 闭环
- Evidence 闭环
- Constraint / Injury 闭环
- 最小回归与门禁

所以当前更值得投入的方向，是让系统“更能用”，而不是继续让“演示更像演示”。

---

## 32. 第 16 轮建议方向

### 32.1 推荐方向
建议第 16 轮回到核心产品开发，优先增强训练模块中最有价值的一段：

- Execution 页的单位级录入（UnitExecution 最小前端闭环）

### 32.2 为什么优先这个方向
原因是：

- 训练模块当前仍然是系统最有价值的部分
- 现有主链路虽然已能走通，但 Execution 录入仍偏粗粒度
- 当前后端已具备 `UnitExecution` 相关能力，前端价值还没有真正释放出来

### 32.3 当前结论
第 15 轮可以视为演示工具链方向的阶段性收口。  
下一步不应继续扩展演示机制，而应转入更贴近真实使用价值的开发切片。

## 33. 当前阶段收口说明

### 33.1 当前阶段判断
截至第 25 轮，项目已不再处于“不断补模块”的阶段，而是进入“训练主链最后冲刺到初步可用”的阶段。

### 33.2 当前冻结策略
以下模块阶段性冻结，不再单独优先开轮：

- Observation
- Evidence
- Constraint / Injury
- CI / demo / 演示工具链
- 首页基础导航层

冻结的含义是：

- 当前先不继续做深
- 若主链真实使用时再次暴露硬阻塞，再回头处理
- 否则不继续消耗轮次

### 33.3 剩余轮次的目标
后续剩余两轮应只围绕训练主链，目标是让系统达到：

- 每天打开就能开始训练
- 当天训练安排可直接操作
- 训练完成后可顺手记录与修正
- 不需要频繁在多个页面间寻找入口

### 33.4 当前结论
从第 26 轮开始，项目应停止模块发散，进入训练主链集中收口阶段。

## 34. 剩余轮次使用策略

### 34.1 当前阶段判断
截至第 26 轮，训练主链已经接近可自用。  
后续轮次不应再平均分配给不同模块，而应聚焦完成最后一段主链收口。

### 34.2 剩余两轮策略
剩余两轮建议按以下方式使用：

#### 第 27 轮
做最后一个“必须轮次”：
- 把 Today -> Execute -> Today 的当天训练闭环做顺

#### 第 28 轮
预留为“真实自用后的首批阻塞修复轮次”：
- 不提前指定模块
- 不预先发散新功能
- 仅修第一次真实自用中暴露的高频硬阻塞

### 34.3 当前结论
从现在开始，开发策略不再是“继续补模块”，而是：

- 用一轮完成最后主链收口
- 用一轮修真实使用问题
- 然后进入真实自用阶段


## 35. 第 29 轮起的主线切换

### 35.1 新主线
从第 29 轮开始，主线切换为：

1. 设计好动作库
2. 设计好模板库
3. 设计好动作进步逻辑

### 35.2 当前推荐顺序
建议按以下顺序推进，不要并行平均展开：

#### 第 29 轮
动作库最小可用版

#### 第 30 轮
模板库最小可用版

#### 第 31 轮
动作进步逻辑 v1

### 35.3 顺序原因
- 模板库必须引用动作库中的动作定义
- 进步逻辑必须建立在动作的结构化属性之上
- 若动作库未先定型，模板库和进步逻辑都容易返工

### 35.4 当前结论
从当前阶段开始，不应再平均分散火力，而应围绕“动作定义 -> 模板复用 -> 进步逻辑”这条链持续推进。

## 36. 动作库后续推进顺序修正

### 36.1 当前主线不变
当前主线仍为：

1. 设计好动作库
2. 设计好模板库
3. 设计好动作进步逻辑

### 36.2 当前细化
但动作库阶段不应只停留在 CRUD，而应继续分成两个子阶段：

#### 第 29 轮
动作库最小可用版
- 动作定义最小字段
- 动作库页面
- 与训练主链初步接通

#### 第 30 轮
动作库标准化与详情页收口
- 首页与详情页信息架构收口
- 动作模式 / 肌群 / 标签统一标准
- 别名与标准动作实体方向收口
- 主 / 次训练部位与人体图联动

### 36.3 顺序原因
只有当动作库的信息架构与分类标准先稳定下来，后续模板库和进步逻辑才不会反复返工。

### 36.4 后续顺序
建议顺序更新为：

- 第 29 轮：动作库最小可用版
- 第 30 轮：动作库标准化与详情页收口
- 第 31 轮：模板库最小可用版
- 第 32 轮：动作进步逻辑 v1

## 37. 通用进步逻辑的 4 轮推进顺序

### 37.1 当前推进顺序
通用进步逻辑建议按以下 4 轮推进：

#### 第 31 轮
通用进步框架底座接线
- 模板动作槽位进步配置接入页面/API
- ProgressTrack 最小 ensure 链路
- ProgressionSnapshot 统一结构

#### 第 32 轮
最小可运行策略集
- linear_load_step
- double_progression
- total_reps_threshold
- add_set_then_load
- bodyweight_reps_progression
- duration_threshold
- manual
- 主项 / 次主项 / 辅助项差异
- “本次谁进步”的最小选择器
- 生成计划时写出 before/after/changed_fields/change_reason

#### 第 33 轮
周期类与例外处理
- linear_periodization_step
- scripted_cycle 最小版
- 漏练 / 部分完成 / 未做 / 补练 / 顺延 对动作轨的影响
- 与 scheduling / recovery policy 的最小联动
- 不同分化结构下的有效暴露判定

#### 第 34 轮
页面可视化与验证收口
- Planned Sessions / Today / Execute 的变化高亮
- 训练记录页回看变化原因
- 最小回归验证覆盖不同角色与策略
- 至少用一分化 + 上下肢两种真实模板验证通用性

### 37.2 当前提醒
后续轮次必须按以上顺序推进，不应跳过“底座接线”和“最小策略集”而直接做页面高亮或复杂周期脚本。

## 38. 通用进步逻辑：第 32 轮已完成后的下一步

### 38.1 当前阶段判断
第 32 轮完成后，通用进步逻辑已经从“底座接线”进入“生成端最小可运行”阶段。

当前已完成：
- 模板动作槽位进步配置接线
- ProgressTrack 最小 ensure 链路
- progression_snapshot 统一结构
- 常见策略的最小生成端运行
- 角色差异开始生效
- “本次谁变化”的最小选择器

### 38.2 下一轮仍按既定 4 轮顺序推进
下一轮必须继续按原定顺序进入：

#### 第 33 轮
周期类与例外处理
- `linear_periodization_step`
- `scripted_cycle` 最小版
- 漏练 / 部分完成 / 未做 / 补练 / 顺延 对动作轨的影响
- 与 scheduling / recovery policy 的最小联动
- 不同训练安排下的有效暴露判定

#### 第 34 轮
页面可视化与验证收口
- Planned Sessions / Today / Execute 的变化高亮
- 训练记录页回看变化原因
- 最小回归验证覆盖不同角色与策略
- 至少用一分化 + 上下肢两种真实模板验证通用性

### 38.3 当前提醒
后续轮次不得跳过第 33 轮而直接做最终 UI。  
原因是：
- 周期类与例外处理仍未进入运行逻辑
- 当前生成端仍未吸收 execution 反馈的关键例外
- 不同训练安排下的有效暴露判定仍需进一步收口

因此，第 33 轮仍然是必要轮次，不应被压缩或跳过。

## 39. 通用进步逻辑的最后一轮收口重点

### 39.1 第 34 轮目标补充
第 34 轮除了既定的：

- Planned Sessions / Today / Execute 的变化高亮
- 训练记录页回看变化原因
- 最小回归验证覆盖不同角色与策略
- 至少用一分化 + 上下肢两种真实模板验证通用性

还应补充：

- 进步配置表单从开发态 JSON 输入收口为用户可理解的受控配置 UI

### 39.2 原因
如果第 34 轮只做变化高亮，不收口配置表单，那么当前通用进步逻辑虽然“能跑”，但仍明显停留在开发态，不足以支撑真实用户持续编辑和理解。

### 39.3 当前提醒
第 34 轮是通用进步逻辑 4 轮推进中的最后一轮，应优先完成：

1. 可理解的配置入口
2. 可感知的变化高亮
3. 可验证的真实模板场景
4. 最小回归收口

不应继续扩张到新的策略家族或更复杂自动调节系统。