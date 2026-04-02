# Architecture v1

## 1. 文档目的

本文档定义本项目 v1 的技术实现约束。  
目标不是追求“最完美架构”，而是为当前阶段提供一套：

- 足够快开工
- 足够容易维护
- 足够适合 vibe coding
- 足够支持未来扩展到大众产品

的全栈方案。

---

## 2. 当前阶段判断

当前阶段目标：

- 先服务作者本人和训练伙伴
- 快速形成真实使用闭环
- 支持持续迭代
- 不提前做复杂基础设施

因此，v1 采用：

> **模块化单体应用（modular monolith）**

不是微服务架构。

理由：

1. 当前领域复杂度高，但团队规模小
2. 真正难点在领域建模，而不是服务拆分
3. 微服务会显著增加部署、调试、权限、数据一致性成本
4. vibe coding 在单仓全栈项目中更容易稳定产出

---

## 3. v1 技术栈

### 3.1 应用框架

- **Next.js**
- **TypeScript**

### 3.2 数据库

- **PostgreSQL**

### 3.3 ORM

- **Prisma**

### 3.4 鉴权与文件存储

- **Supabase Auth**
- **Supabase Storage**
- **Supabase Postgres**（数据库托管）

### 3.5 部署

- **Vercel**

### 3.6 UI

- **Tailwind CSS**
- 可选使用 **shadcn/ui**

### 3.7 数据校验

- **Zod**

### 3.8 AI 接入

v1 先保留 AI 解析接口层，不在本阶段锁死具体 provider。  
要求做到：

- 上传证据
- 触发解析
- 存储 `parsed_summary`
- 支持人工确认入库

---

## 4. 为什么现在就定这套栈

以下层现在必须定：

### 4.1 Web 应用框架
因为目录结构、接口写法、服务端逻辑组织都依赖它。

### 4.2 数据库类型
因为 schema、jsonb 策略、索引设计都依赖它。

### 4.3 ORM
因为 migration、查询写法、类型生成都依赖它。

### 4.4 鉴权 / 文件方案
因为 Evidence 上传、用户隔离、未来伙伴协作都依赖它。

---

## 5. 现在不定的东西

以下内容暂不在 v1 锁定：

- 消息队列
- 后台任务系统
- 全文搜索
- 向量数据库
- Realtime 实时同步
- 多租户高级隔离
- 微服务拆分
- 移动端技术栈
- BI / 数据仓库
- 独立对象存储服务替换

如果未来需要，再在 v2 / v3 决策。

---

## 6. 总体架构原则

### 6.1 以领域模块划分目录，不以技术分层硬拆

推荐模块：

- `goals`
- `programs`
- `sessions`
- `executions`
- `progress-tracks`
- `observations`
- `evidence`
- `constraints`
- `injuries`

### 6.2 数据库 schema 优先服从领域文档

`/docs/02-core-domain-v1.md` 是领域真相来源。

### 6.3 后端接口优先围绕用例，而不是围绕表做纯 CRUD

例如：

- create program
- generate planned sessions
- record session execution
- upload evidence
- confirm parsed evidence
- create constraint profile
- report injury incident

### 6.4 v1 不追求前后端完全分离

Next.js 中允许：

- 页面
- route handlers
- server actions
- server-side queries

共存。

---

## 7. 仓库结构建议

```text
/apps
  /web
    /src
      /app
      /components
      /features
      /lib
      /server
      /types

/docs

/prisma
  schema.prisma
  /migrations
  seed.ts
```

如果只做单仓单应用，可以先简化为：

```text
/src
  /app
  /components
  /features
  /lib
  /server
  /types

/docs
/prisma
```

---

## 8. 目录职责建议

### 8.1 `/src/app`

Next.js 页面和 route handlers。

### 8.2 `/src/features`

按领域模块组织 UI、hooks、actions、schemas、view models。

例如：

```text
/src/features/programs
/src/features/sessions
/src/features/evidence
/src/features/constraints
```

### 8.3 `/src/server`

服务端逻辑，包含：

- repositories
- services
- domain mappers
- use cases

### 8.4 `/src/lib`

通用工具：

- supabase client
- prisma client
- date utils
- logger
- env parsing

### 8.5 `/src/types`

共享类型，但不要把领域真相只放在这里。  
领域真相仍然来自 `/docs`。

---

## 9. 数据库实现原则

### 9.1 使用 Prisma 管理 schema 和 migration

### 9.2 保留 json/jsonb 字段，不提前过度拆表

以下是强约束：

- policy config 类字段保留 JSON
- payload 类字段保留 JSON
- parsed summary 保留 JSON
- progress current state 保留 JSON
- rehab / restriction / implication 类字段保留 JSON

### 9.3 先保证主链路可用，再做精细索引

### 9.4 v1 不要为所有子对象建独立表

尤其不要提前拆：

- SetExecution
- ParsedArtifact
- DerivedAssessment
- RehabPlan

---

## 10. 用户与权限模型

v1 权限模型尽量简单。

### 10.1 用户身份

每条核心业务数据都归属某个 `user_id`。

### 10.2 当前阶段默认模式

- 一个用户只能修改自己的数据
- 训练伙伴之间暂不开放复杂共享编辑
- 后续如需支持伙伴视图，再新增协作模型

### 10.3 数据隔离原则

以下实体都必须带 `user_id` 或通过上层实体可追溯到 `user_id`：

- Goal
- Program
- PlannedSession
- SessionExecution
- Observation
- EvidenceAsset
- ConstraintProfile
- InjuryIncident

---

## 11. 文件上传与 Evidence 流程

### 11.1 上传流程

1. 用户上传图片 / 截图 / PDF
2. 文件进入 Supabase Storage
3. 创建 `EvidenceAsset`
4. `parse_status = pending`
5. 触发解析流程
6. 写入 `parsed_summary`
7. 用户确认后入库为：
   - SessionExecution
   - UnitExecution
   - Observation
   - InjuryIncident

### 11.2 v1 的要求

- 必须先把上传和状态流转做通
- AI 解析可以先 mock
- 先保证状态机和数据落点正确

### 11.3 解析状态最小状态机

- `pending`
- `parsed`
- `needs_review`
- `confirmed`
- `rejected`
- `failed`

---

## 12. API / 服务层设计原则

v1 不建议先做纯 REST-first 设计。  
优先围绕真实用例组织服务。

推荐核心用例：

### 12.1 Goals
- create goal
- list goals
- update goal

### 12.2 Programs
- create program
- update program
- activate program
- generate planned sessions

### 12.3 Sessions
- get today planned session
- list planned sessions
- get session detail

### 12.4 Executions
- create session execution
- record unit execution
- complete planned session
- log extra session

### 12.5 Progress Tracks
- get progress track
- update progress track after execution

### 12.6 Observations
- create observation
- list observations by metric
- get latest observation summary

### 12.7 Evidence
- upload evidence
- request parse
- confirm parsed evidence
- reject parsed evidence

### 12.8 Constraints / Injuries
- create constraint profile
- resolve constraint profile
- report injury incident
- link incident to constraint

---

## 13. 前端页面建议

v1 建议至少做这些页面：

### 13.1 Dashboard
展示：

- 今日训练
- 本周训练完成度
- 最近体重 / 睡眠 / 疲劳
- 当前 active constraints / injuries

### 13.2 Programs
- Program 列表
- Program 详情
- Block / SessionTemplate 视图

### 13.3 Today Session
- 今日计划
- 执行记录入口
- 偏离计划说明
- 症状记录

### 13.4 Executions
- 历史训练记录
- 单次训练详情
- 单元执行详情

### 13.5 Observations
- 体重 / 睡眠 / 晨脉 / 疼痛 / 活动度记录
- 趋势图

### 13.6 Evidence
- 上传
- 解析状态
- 确认导入

### 13.7 Constraints / Injuries
- 当前限制画像
- 伤病事件记录
- 状态跟踪

---

## 14. UI 原则

### 14.1 v1 先追求清晰，不追求炫技

### 14.2 页面以“任务完成”为中心，不以“展示概念”为中心

### 14.3 每个页面尽量回答一个问题

例如：

- 今天该练什么
- 我练了什么
- 我现在有哪些限制
- 这张图识别出了什么

---

## 15. 表单与校验原则

### 15.1 所有输入都必须做 runtime validation

使用 Zod。

### 15.2 前后端共享 schema，但不要把所有领域规则只写在前端

### 15.3 AI 解析结果进入正式数据前必须经过确认步骤

---

## 16. 日志与调试原则

v1 阶段，所有关键流程要能追踪：

- Program 生成了哪些 PlannedSession
- Evidence 何时上传、何时解析
- Constraint 如何影响了具体 PlannedUnit
- InjuryIncident 是如何被创建的

至少要保留结构化日志。

---

## 17. 环境变量建议

```env
DATABASE_URL=
DIRECT_URL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=
```

如果 v1 还没有接入真实解析模型，`OPENAI_API_KEY` 可以后置。

---

## 18. 开发顺序

### 第 1 阶段
- 建立项目骨架
- 接入 Prisma
- 接入 Supabase Auth / Storage
- 写 schema 和 migration
- seed 基础数据

### 第 2 阶段
- 实现 Program / Session / Execution 的最小后端
- 实现最基础页面

### 第 3 阶段
- 接入 Observation
- 做 Dashboard 初版

### 第 4 阶段
- 接入 Evidence 上传
- 跑通 pending -> parsed -> confirmed 流程

### 第 5 阶段
- 接入 Constraint / Injury 闭环
- 让计划生成可读取 active constraints

---

## 19. 对 vibe coding 的约束

实现时必须遵守：

1. 以 `/docs/02-core-domain-v1.md` 为领域真相来源
2. 不允许擅自改领域命名
3. 不允许擅自把 json 字段全部拆表
4. 不允许提前上复杂基础设施
5. 不允许一轮内同时做 schema、业务、UI、AI 全套大改
6. 每一轮只做一个切片

---

## 20. 推荐的喂给 vibe coding 的方式

每轮只给它：

- 1 份主文档
- 1 个任务目标
- 1 组硬约束
- 1 组验收标准

### 推荐模板

```text
你现在是这个项目的实现工程师，不是产品设计师。
请严格以 /docs/02-core-domain-v1.md 和 /docs/04-architecture-v1.md 为准。

本轮目标：
1. 实现 Prisma schema
2. 生成 migration
3. 提供 seed 数据
4. 不做 UI，不做 AI 解析

硬约束：
- 不要改动文档中的实体命名
- 不要擅自新增领域对象
- 不要把 json 字段过度拆表
- 不要引入新的第三方服务

输出要求：
1. 先复述你理解到的实体和关系
2. 列出将修改/新增的文件
3. 给出 schema 设计
4. 给出 migration
5. 给出验证方式
6. 如果发现文档冲突，只指出冲突，不要自行重构
```

---

## 21. 第一轮建议任务

第一轮只做：

- 初始化 Next.js + TypeScript
- 接入 Prisma
- 接入 Supabase
- 写 Prisma schema
- 生成 migration
- 写 seed

不做：

- 页面美化
- AI 识别
- 复杂 dashboard
- 推荐系统
- 饮食系统
- 游戏化系统

---

## 22. 何时写下一份文档

在开始第一轮实现前，应新增：

- `/docs/06-build-order.md`

它只写一件事：  
**开发切片顺序和每一轮的验收标准。**