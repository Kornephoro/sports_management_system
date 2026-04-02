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