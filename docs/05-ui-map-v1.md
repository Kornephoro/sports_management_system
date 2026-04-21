# UI Map v1

## 1. 文档目的

本文档定义本项目 v1 当前阶段的页面地图（UI map）。  
它的作用是：

- 记录当前已有页面与页面职责
- 约束页面边界，防止页面层与领域逻辑混乱
- 帮助后续继续迭代时保持清晰的信息架构

本文档不替代：

- `/docs/02-core-domain-v1.md`（领域真相）
- `/docs/03-state-flows-v1.md`（状态流转）
- `/docs/04-architecture-v1.md`（技术约束）

---

## 2. v1 页面设计原则

### 2.1 页面优先围绕“完成任务”设计
页面首先服务于用户完成核心操作，而不是展示概念。

### 2.2 页面不直接访问数据库
页面必须通过：

- route handlers
- server actions
- API 封装

访问后端，而不是直接写数据库逻辑。

### 2.3 页面优先验证主链路，不追求复杂设计
v1 先验证：

- 能不能看懂
- 能不能点通
- 能不能完成最小操作闭环

### 2.4 页面与领域模型保持对齐
页面层要尊重以下主链：

`Program -> PlannedSession -> PlannedUnit -> SessionExecution -> UnitExecution`

以及：

`Observation`

---

## 3. 当前 v1 页面总览

当前已落地的页面主要分为 4 组：

1. 首页
2. Program 页面组
3. Execution 录入页面组
4. Observation 页面组

---

## 4. 首页

### 4.1 路由
- `/`

### 4.2 页面职责
- 作为开发阶段的最小导航入口
- 引导用户进入：
  - Programs
  - Observations
  - 后续其他模块

### 4.3 当前阶段要求
- 可以很简单
- 不要求完整 dashboard
- 不承担复杂业务逻辑

---

## 5. Program 页面组

### 5.1 Program 列表页

#### 路由
- `/programs`

#### 页面职责
- 展示当前用户的 Program 列表
- 提供进入 Program 详情页的入口

#### 依赖接口
- `GET /api/programs?userId=...`

#### 当前边界
- 不做复杂筛选
- 不做复杂排序
- 不做多用户协作视图

---

### 5.2 Program 详情页

#### 路由
- `/programs/[programId]`

#### 页面职责
- 展示单个 Program 的基础信息
- 展示 Program 下的 Block / SessionTemplate / TrainingUnitTemplate 概览
- 提供进入 Planned Sessions 页的入口

#### 依赖接口
- `GET /api/programs/[programId]?userId=...`

#### 当前边界
- 只做结构展示
- 不直接承担执行录入
- 不做复杂编辑器

---

### 5.3 Planned Sessions 列表页

#### 路由
- `/programs/[programId]/planned-sessions`

#### 页面职责
- 展示某个 Program 下的 PlannedSession 列表
- 提供最小“生成 planned sessions”入口
- 提供进入单次 execution 录入页的入口

#### 依赖接口
- `GET /api/programs/[programId]/planned-sessions?userId=...`
- `POST /api/programs/[programId]/planned-sessions/generate`

#### 当前边界
- 不做复杂调度器界面
- 不做拖拽排序
- 不做复杂 calendar 视图

---

## 6. Execution 录入页面组

### 6.1 Session Execution 录入页

#### 路由
- `/programs/[programId]/planned-sessions/[plannedSessionId]/execute`

#### 页面职责
- 为某个 PlannedSession 提供最小 execution 录入入口
- 允许提交一次 SessionExecution
- 允许完成最小“计划 -> 执行”人工闭环

#### 依赖接口
- `POST /api/planned-sessions/[plannedSessionId]/executions`

#### 当前边界
- 不做复杂组级录入器
- 不做高级动作编辑
- 不做批量模板化执行界面

---

## 7. Observation 页面组

### 7.1 Observation 页面

#### 路由
- `/observations`

#### 页面职责
- 提供 Observation 的最小手动录入与查询闭环
- 当前至少支持：
  - 体重录入
  - 睡眠录入
  - 疲劳录入（或疼痛中的一种）
- 支持按 metric 查看最近记录
- 支持展示 latest observation summary

#### 依赖接口
- `POST /api/observations`
- `GET /api/observations?userId=...&metricKey=...&limit=...`
- `GET /api/observations/summary/latest?userId=...&metricKeys=...`

#### 当前边界
- 不做图表
- 不做复杂分析
- 不做 readiness score
- 不做饮食系统
- 不做 Evidence 上传

---

## 8. 当前信息架构

当前页面结构可以概括为：

```text
/
├── /programs
│   ├── /programs/[programId]
│   └── /programs/[programId]/planned-sessions
│       └── /programs/[programId]/planned-sessions/[plannedSessionId]/execute
└── /observations
```

---

## 9. 当前页面与领域对象的对应关系

### 9.1 Programs 页面组
主要对应：

- Program
- Block
- SessionTemplate
- TrainingUnitTemplate
- PlannedSession
- PlannedUnit

### 9.2 Execution 页面组
主要对应：

- PlannedSession
- SessionExecution
- UnitExecution

### 9.3 Observations 页面组
主要对应：

- Observation

---

## 10. 当前已打通的人工闭环

### 10.1 计划到执行闭环
已打通：

1. 查看 Program
2. 查看 Planned Sessions
3. 进入 execution 录入
4. 提交 SessionExecution

### 10.2 Observation 录入与查询闭环
已打通：

1. 手动录入 Observation
2. 按 metric 查询最近记录
3. 查看 latest observation summary

---

## 11. 当前未进入页面层的模块

以下模块当前还没有正式进入页面层：

- Evidence 上传与解析
- Constraint / Injury 页面
- Dashboard 正式页
- Nutrition 页面
- Recommendation / DerivedAssessment 页面
- 游戏化 / 生活方式页面

这些内容应在后续轮次中按 build order 逐步进入，而不应提前混入现有页面。

---

## 12. 页面层当前技术边界

### 12.1 页面必须通过 API / route handlers 调用后端
不允许在页面中直接操作 Prisma 或数据库。

### 12.2 页面层可以有最小客户端组件
适用于：

- 表单提交
- 按钮交互
- 列表刷新
- 错误提示

### 12.3 页面层当前允许存在开发期辅助对象
例如：

- demo user
- 简单 http client
- 最小 API 封装

但这些内容后续应逐步收口到正式鉴权与正式数据流中。

---

## 13. 当前结论

截至当前版本，v1 页面层已经具备两个最小可用闭环：

1. `Program -> PlannedSession -> SessionExecution`
2. `Observation create -> list by metric -> latest summary`

因此，页面层已经从“纯占位”进入“可验证业务闭环”的阶段。  
后续新增页面应继续遵循：

- 单轮单目标
- 围绕当前主链路扩展
- 不提前引入复杂页面系统


## 14. Constraint / Injury 页面组

### 14.1 Constraint / Injury 页面

#### 路由
- `/constraints`

#### 页面职责
- 提供 ConstraintProfile 的最小创建、查看与 resolve 闭环
- 提供 InjuryIncident 的最小创建与查看闭环
- 提供 InjuryIncident 与 ConstraintProfile 的最小链接操作
- 作为当前 v1 中 Constraint / Injury 的统一入口页面

#### 依赖接口
- `POST /api/constraints`
- `GET /api/constraints/active?userId=...`
- `PATCH /api/constraints/[id]/resolve`
- `POST /api/constraints/[id]/link-injury`
- `POST /api/injuries`
- `GET /api/injuries?userId=...`

#### 当前边界
- 不做复杂 rehab 计划页面
- 不做 return-to-training 评分页面
- 不做医学判断或自动伤病建议
- 不做复杂规则编辑器
- 不做 constraint 替换引擎可视化界面

---

## 15. 当前信息架构更新

当前页面结构更新为：

```text
/
├── /programs
│   ├── /programs/[programId]
│   └── /programs/[programId]/planned-sessions
│       └── /programs/[programId]/planned-sessions/[plannedSessionId]/execute
├── /observations
├── /evidence
└── /constraints
```

## 16. 当前页面与领域对象的对应关系更新

### 16.1 Constraint / Injury 页面组
主要对应：

- ConstraintProfile
- InjuryIncident
- PlannedUnit.constraint_snapshot（通过计划生成链路间接体现）

### 16.2 当前页面作用说明
该页面组的作用不是完整康复系统，而是验证：

- 约束是否能被结构化记录
- 伤病是否能被结构化记录
- 两者之间是否能建立最小链接
- active constraints 是否能真实影响 planned session 生成链路

---

## 17. 当前已打通的人工闭环更新

### 17.1 Constraint / Injury 最小闭环
已打通：

1. 创建 ConstraintProfile
2. 查看 active constraints
3. resolve ConstraintProfile
4. 创建 InjuryIncident
5. 查看 InjuryIncident
6. 将 InjuryIncident 链接到 ConstraintProfile
7. 在生成 planned sessions 时写入 `constraint_snapshot`

---

## 18. 当前未进入页面层的康复相关能力

以下内容当前仍未进入页面层：

- RehabPlan 页面
- RehabUnitTemplate 页面
- 功能维护提醒页面
- Return-to-sport 评分页面
- 复杂康复处方编辑器

这些能力后续如进入开发，应作为单独切片推进，而不应直接混入当前 `/constraints` 页面。

## 19. Program 页面组补充说明（Round 12）

### 19.1 首页引导补充
首页当前除导航入口外，还应承担最小“推荐操作顺序”提示作用。  
当前建议的推荐路径是：

1. 从 Demo Program 开始
2. 进入 Planned Sessions
3. 生成计划
4. 进入 Execution 录入
5. 再查看 Observations / Evidence / Constraints

### 19.2 Program 列表页补充
Program 列表页当前除了展示 Program 外，还承担一个新的最小职责：

- 帮助用户区分“可继续进入计划生成链路的 Program”与“当前未就绪的 Program”

因此列表页当前允许展示：

- planning readiness
- 最小状态提示
- 对 demo / ready program 的更清晰入口

### 19.3 Planned Sessions 页补充
Planned Sessions 页当前不只是展示列表，还应承担最小主链路防误操作职责：

- 在生成前做就绪校验
- 对未就绪 Program 给出可理解提示
- 在未就绪时禁用生成按钮

这属于当前 v1 的最小可用性保护，不视为复杂调度器逻辑。

## 20. Execution 录入页补充说明（Round 16）

### 20.1 当前执行页职责增强
当前 `/programs/[programId]/planned-sessions/[plannedSessionId]/execute` 页面除了创建 `SessionExecution` 外，已进一步承担：

- 加载当前 `PlannedSession` 下的 `PlannedUnit`
- 逐项录入最小 `UnitExecution`
- 展示回写后的 `planned_session_status`
- 展示回写后的 `planned_unit.status`

### 20.2 当前页面交互结构
当前执行页采用两步式最小交互：

1. Step 1：创建 `SessionExecution`
2. Step 2：按 `PlannedUnit` 逐项提交 `UnitExecution`

这种设计保持了：

- `SessionExecution` 与 `UnitExecution` 分层
- 页面逻辑仍可理解
- 不需要直接进入复杂训练日志系统

### 20.3 当前依赖接口补充
执行页当前依赖接口包括：

- `GET /api/programs/[programId]/planned-sessions?userId=...`
- `POST /api/planned-sessions/[plannedSessionId]/executions`
- `POST /api/session-executions/[sessionExecutionId]/unit-executions`

### 20.4 当前边界
当前执行页仍然不做：

- 组级编辑器
- 完整训练日志页
- 历史执行详情页
- 高级统计视图
- 自动 progression 提示

它当前仍然属于“最小可用执行录入页面”，而不是完整训练记录中心。

## 21. Execution 录入页补充说明（Round 17）

### 21.1 当前执行结果回看增强
当前 `/programs/[programId]/planned-sessions/[plannedSessionId]/execute` 页面在完成 `UnitExecution` 提交后，已支持展示：

- 本次已提交的 `UnitExecution` 简表（只读）
- 当前 `planned_session_status`
- 当前各 `planned_unit.status`

### 21.2 当前只读结果区块职责
该区块当前的作用是：

- 帮助用户确认“刚刚提交了什么”
- 降低执行录入后的状态不确定感
- 帮助用户在页面内完成最小结果回看

当前它不是：

- 完整训练日志页
- 历史执行检索页
- 长期记录中心

### 21.3 当前展示字段
当前最小只读结果区块至少展示：

- PlannedUnit / 名称
- completion status
- notes
- perceived exertion
- pain score

### 21.4 当前边界
该结果区块当前仅面向“本次提交结果”，不承担：

- 历史执行汇总
- 多次提交批次对比
- 图表化回顾
- 长期训练日志查询

## 22. Planned Sessions 页面补充说明（Round 18）

### 22.1 当前页面定位更新
当前 `/programs/[programId]/planned-sessions` 页面已经不再只是“生成列表页”，而是开始承担最小训练安排工作台的职责。

### 22.2 当前新增职责
当前页面除原有功能外，已进一步支持：

- 更清楚地展示 session_date
- 展示 weekday
- 展示更明确的 status badge
- 展示 unit 状态摘要
- 展示最小执行回写提示
- 提供更直接的操作入口：
  - 进入 execute
  - 快捷标记 completed / partial / skipped

### 22.3 当前页面价值
这使得 Planned Sessions 页面更接近“安排页”，而不只是“计划数据展示页”。

用户现在可以在该页面上完成：

- 看近期安排
- 快速判断某次训练当前状态
- 直接进入执行
- 对某些 session 做最小状态操作

### 22.4 当前边界
当前页面仍然不承担：

- 完整日历视图
- 拖拽排期
- 复杂周计划管理
- 自动重排
- 训练历史记录中心

它当前仍属于“轻量安排工作台”，而不是完整排程系统。


## 23. Execution 历史页面组

### 23.1 训练记录回看页

#### 路由
- `/executions`

#### 页面职责
- 提供最近 `SessionExecution` 的最小回看入口
- 支持展开查看某次执行对应的 `UnitExecution` 简表
- 作为当前 v1 的最小训练记录页面

#### 依赖接口
- `GET /api/executions?userId=...&limit=...`

#### 当前展示内容
列表层至少展示：

- performed_at
- completion_status
- actual_duration_min
- notes（如有）
- Program / PlannedSession 的最小关联信息

展开层至少展示：

- UnitExecution completion status
- notes
- perceived exertion
- pain score

#### 当前边界
该页面当前不是：

- 完整训练日志中心
- 高级筛选页
- 历史统计页
- 图表页

它当前只承担“最近训练记录最小回看”的职责。

---

## 24. 当前信息架构更新

当前页面结构更新为：

```text
/
├── /programs
│   ├── /programs/[programId]
│   └── /programs/[programId]/planned-sessions
│       └── /programs/[programId]/planned-sessions/[plannedSessionId]/execute
├── /executions
├── /observations
├── /evidence
└── /constraints
```

## 25. 当前已打通的人工闭环更新

### 25.1 训练记录最小回看闭环
已打通：

1. 从 execute 页提交 `SessionExecution`
2. 提交 `UnitExecution`
3. 进入 `/executions`
4. 查看最近 `SessionExecution`
5. 展开查看本次 `UnitExecution` 简表

这意味着当前系统已从“能录入训练执行”升级为“能录入并最小回看训练记录”。

## 26. 首页补充说明（Round 20）

### 26.1 首页当前定位更新
首页当前已经不再只是导航页，而是开始承担“日常入口页”的职责。

### 26.2 当前首页新增职责
当前首页新增两个最小日常入口区块：

1. 下一次 / 最近 Planned Session
2. 最近一次 SessionExecution

### 26.3 下一次 / 最近 Planned Session 区块职责
该区块当前用于帮助用户快速知道：

- 下一次该练什么
- 当前最近一条计划训练是什么
- 应该去哪里继续：
  - Planned Sessions 页
  - Execute 页

### 26.4 最近一次 SessionExecution 区块职责
该区块当前用于帮助用户快速知道：

- 最近一次练了什么
- 最近一次训练完成状态
- 是否需要回到训练记录页继续查看

### 26.5 当前首页的边界
首页当前虽然更实用了，但仍然不是：

- 完整 dashboard
- 统计中心
- 图表页
- 复杂运营首页

它当前的定位仍是：

> 更适合每天打开来开始使用的最小入口页。


## 27. Execution 历史页面补充说明（Round 21）

### 27.1 当前页面实用化增强
当前 `/executions` 页面在最小历史回看的基础上，已进一步增强为更适合日常查看和回跳使用的记录页。

### 27.2 当前新增能力
当前页面已支持：

- 轻量筛选：
  - 全部
  - completed
  - partial / skipped
- 每条记录的最小回跳入口：
  - 返回对应 Program 的 planned sessions 页
  - 返回对应 planned session 的 execute 页（有 planned_session 关联时）
- 保持原有的 UnitExecution 展开简表能力

### 27.3 当前页面价值
这使得 `/executions` 页面不再只是“能看到最近记录”，而是开始承担：

- 记录快速浏览
- 状态快速切换查看
- 从记录页快速回到安排 / 执行链路

### 27.4 当前边界
当前页面仍然不是：

- 完整训练日志中心
- 高级筛选和统计页
- 长期历史分析页
- 图表页

它当前仍属于“轻量训练记录页”。

## 28. Execution 历史页面补充说明（Round 22）

### 28.1 当前页面进一步增强
当前 `/executions` 页面在最小历史回看的基础上，已进一步支持按 Program 维度查看训练记录。

### 28.2 当前新增能力
当前页面已支持两层最小筛选并存：

- 状态筛选：
  - all
  - completed
  - partial / skipped
- Program 筛选：
  - All Programs
  - 当前记录列表中存在的 Program

### 28.3 当前页面价值
这使得 `/executions` 页面更接近真实使用场景，因为用户已经可以：

- 查看最近训练记录
- 按完成状态快速筛选
- 按 Program 维度筛选
- 从记录页直接回跳到安排页或执行页

### 28.4 当前边界
当前页面虽然更实用，但仍然不是：

- 完整训练日志中心
- 多维统计分析页
- 高级筛选器页面
- 图表与趋势页

它当前仍然属于“轻量训练记录回看页”。

## 29. Execution 历史页面补充说明（Round 23）

### 29.1 当前页面能力更新
当前 `/executions` 页面已从“只读回看页”进一步增强为：

- 可回看最近训练记录
- 可展开查看本次 `UnitExecution`
- 可最小编辑 `SessionExecution`
- 可最小编辑 `UnitExecution`

### 29.2 当前最小编辑入口
当前页面支持两类最小编辑：

#### A. Session 级编辑
可编辑：
- completion_status
- actual_duration_min
- notes

#### B. Unit 级编辑
可编辑：
- completion_status
- notes
- perceived_exertion
- pain_score

### 29.3 当前页面价值
这使得 `/executions` 页面已经开始承担“训练记录修正入口”的职责。  
用户现在不只是在这里看记录，还能在发现录错、漏填时做最小修正。

### 29.4 当前边界
当前页面虽然更强了，但仍然不是：

- 完整训练日志编辑中心
- 批量修正页
- set-by-set 编辑器
- 高级历史管理页

它当前仍属于“轻量训练记录回看 + 最小修正页”。

## 30. Planned Sessions 页面补充说明（Round 24）

### 30.1 当前页面能力更新
当前 `/programs/[programId]/planned-sessions` 页面已进一步支持：

- 生成 planned sessions
- 查看状态与摘要
- 快捷标记状态
- 进入 execute
- **卡片内联改期**

### 30.2 当前最小改期入口
当前每条 Planned Session 卡片支持：

- 点击“改期”
- 内联显示 date input
- 保存日期
- 取消修改

### 30.3 当前页面价值
这使得 Planned Sessions 页面进一步接近真实的训练安排工作台。  
用户现在不只是在这里看安排，还能对单次训练做最小日期调整。

### 30.4 当前边界
当前页面虽然更实用了，但仍然不是：

- 完整日历视图
- 拖拽排期系统
- 自动顺延引擎
- 复杂冲突管理器

它当前仍然属于“轻量训练安排工作台”。

## 31. Today 页面组

### 31.1 Today 训练入口页

#### 路由
- `/today`

#### 页面职责
- 作为当前系统面向“今天 / 这周训练”的最小工作台
- 提供：
  - 今日 / 下一次训练入口
  - 本周 upcoming planned sessions 列表
  - 最近一次训练记录入口

#### 依赖接口
- `GET /api/planned-sessions/next?userId=...`
- `GET /api/planned-sessions/upcoming?userId=...&limit=...`
- `GET /api/executions?userId=...&limit=1`

#### 当前页面价值
该页面当前的主要价值是：

- 让用户不必先思考“去哪里开始”
- 让训练安排和训练记录有一个更贴近日常使用的入口
- 让系统开始具备“每天打开就能直接用”的特征

#### 当前边界
当前 `/today` 页面不是：

- 完整 dashboard
- 图表中心
- 周计划编辑器
- 复杂统计首页

它当前仍然属于“最小训练工作台”。

## 32. Today 页面补充说明（Round 26）

### 32.1 当前页面能力更新
当前 `/today` 页面已从“日常入口页”进一步增强为“可直接操作的轻量训练工作台”。

### 32.2 当前新增能力
当前页面已支持：

- 在“今日 / 下一次训练”卡片中：
  - 标记 completed / partial / skipped
  - 改期
  - 进入 planned sessions
  - 进入 execute
- 在“This Week upcoming”列表中：
  - 对每条 session 执行最小状态操作
  - 改期
  - 跳转到 planned sessions / execute

### 32.3 当前页面价值
这使得 `/today` 不再只是“看今天练什么”，而是开始承担：

- 当天训练快速开始入口
- 当周训练最小调整入口
- 训练安排即时操作入口

### 32.4 当前边界
当前 `/today` 页面虽然更强了，但仍然不是：

- 完整 dashboard
- 复杂周计划编辑器
- 日历系统
- 自动顺延引擎

它当前仍属于“轻量训练工作台”。

## 33. 单次训练动作清单与调整页面

### 33.1 路由
- `/programs/[programId]/planned-sessions/[plannedSessionId]/plan`

### 33.2 页面职责
该页面作为当前系统唯一的“查看动作清单与调整”入口，用于：

- 查看某次已安排训练包含的动作清单
- 调整单次训练层的动作安排数据
- 在进入 execute 前，先确认本次训练具体练什么

### 33.3 当前入口来源
当前至少有两个入口会跳到该页面：

- `/programs/[programId]/planned-sessions`
- `/today`

### 33.4 当前页面价值
该页面的加入使训练主链更清晰地分为：

- 已安排训练层：先看动作并调整
- 执行层：再进入 execute 做训练核销

### 33.5 当前边界
该页面当前仍不是：

- 完整模板编辑器
- 动作库管理页
- 模板库管理页

它当前仅承担“单次训练层查看动作清单与调整”的职责。

## 34. 动作库首页

### 34.1 页面定位
动作库首页是“动作总览与管理页”，不是训练页、模板页或执行页。

它的职责是：
- 浏览系统中已有动作
- 搜索 / 筛选动作
- 新建动作
- 停用 / 归档动作
- 进入某个动作详情页

### 34.2 页面形态
首页更适合采用动作卡片总览，而不是纯表格或大段表单。  
每张动作卡片只承载最小摘要信息，例如：

- 动作名称
- 记录方式
- 负重模型
- 活跃状态
- 最近使用
- 快捷入口：查看详情 / 编辑 / 停用

首页不应承载过多动作定义细节、历史分析或完整肌群配置。

### 34.3 首页目标
动作库首页的价值不是“展示很多字段”，而是让用户快速完成：

- 找动作
- 新建动作
- 进入动作详情
- 把动作用于安排训练

---

## 35. 动作详情页

### 35.1 页面定位
动作详情页不是简单的“编辑动作表单”，而是动作的定义与使用信息页。

动作详情页服务于训练安排，但不应被设计成孤立百科页。

### 35.2 主要信息分层
动作详情页建议分为四层：

#### A. 动作定义层
回答“这个动作是什么”，包括：
- 标准名称
- 别名
- 记录方式
- 负重模型
- 默认安排参数
- 动作模式
- 主要训练部位 / 次要训练部位
- 动作做法
- 注意事项
- 拉伸 / 准备建议

#### B. 动作档案摘要层
回答“这个动作最近练得怎么样”，包括：
- 历史训练次数
- 最近一次训练
- 最近表现摘要
- 最佳重量
- 最佳次数
- 最近趋势

#### C. 引用关系层
回答“这个动作当前在哪里被使用”，包括：
- 模板引用
- 计划引用
- 最近训练引用

#### D. 治理层
回答“这个动作是否干净、统一、可维护”，包括：
- 活跃 / 归档状态
- 疑似重复动作
- 别名管理
- 合并入口

### 35.3 全局跳转原则
动作详情页应成为系统中“动作”的统一落点。

理想状态下，计划页、单次训练调整页、已安排训练页、execute 页、训练记录页中出现的动作名称，只要存在明确动作映射，都应能跳到同一个动作详情页。

---

## 36. 肌群选择与人体图联动

### 36.1 交互目标
动作详情页中的“主要训练部位 / 次要训练部位”不应只是文本标签，而应尽量具备可视化联动。

### 36.2 左右结构
建议采用：
- 左侧：主要训练部位 / 次要训练部位标签选择区
- 右侧：人体图示意区

### 36.3 联动规则
- 选择主要训练部位时，对应区域在人体图中以深色高亮
- 选择次要训练部位时，对应区域以浅色高亮
- 后续若交互允许，人体图点击也可反向同步到标签选择区

### 36.4 当前颗粒度
当前建议使用“区域级”颗粒度，不做更细解剖颗粒度，以避免冗余和维护负担。

## 37. 模板动作槽位的进步配置入口

### 37.1 当前页面能力
第 31 轮之后，模板动作槽位不再只是训练安排参数的编辑入口，也开始承担“进步配置入口”的职责。

当前模板相关页面中，单个动作槽位至少应能配置并回显：
- 角色（unit role）
- 进步家族（progression family）
- 具体策略类型（progression policy type）
- 进步配置（policy config）
- 调整策略（adjustment policy）
- 成功判定（success criteria）
- 进步轨 key（progress track key）

### 37.2 当前页面定位
该入口当前仍属于开发态的最小可用入口，其作用是：

- 让模板动作槽位开始具备“未来如何进步”的明确信息
- 让进步逻辑成为真实产品概念，而不是只存在于 schema 中

### 37.3 当前边界
这一入口当前不是：
- 完整进步引擎控制台
- 周期化脚本可视化编辑器
- 变化高亮结果页

它当前只是通用进步框架的最小配置入口。

## 38. 进步配置表单的收口方向

### 38.1 当前问题
当前模板动作槽位的进步配置虽然已经可编辑、可保存、可回显，但页面仍保留明显开发态输入方式，例如：

- progress track key 直接输入框
- success criteria 直接 JSON 文本框
- progression policy config 直接 JSON 文本框
- adjustment policy config 直接 JSON 文本框

这种方式适合开发验证，不适合真实用户持续使用。

### 38.2 页面目标
进步配置页不应要求用户直接理解内部 JSON 结构。  
更合理的方向是：

> 让用户先理解“这个动作怎么进步”，再通过受控表单填写必要参数

### 38.3 建议的收口方式
#### A. 保留少数底层字段
如：
- progress track key（可折叠到高级设置）
- 原始 JSON（仅开发态或高级模式可见）

#### B. 主配置改为受控表单
例如：
- 进步家族：下拉
- 具体策略：下拉
- 成功判定：条件字段
- 步长 / 阈值 / set cap / phase advance_on：受控输入项
- rotation / cooldown / retry 等：条件出现

#### C. 按策略类型条件显示
不同策略只显示相关字段，例如：
- `linear_load_step` 显示 load increment / target rule
- `double_progression` 显示 rep range / load increment
- `add_set_then_load` 显示 base sets / set cap / load increment
- `linear_periodization_step` 显示 phases
- `scripted_cycle` 显示 steps / cycle mode

### 38.4 页面定位
该区域应被视为：

> 模板动作槽位“未来如何变化”的配置面板

而不是原始系统内部对象编辑器。

### 38.5 当前阶段提醒
第 34 轮应优先把这些 JSON 输入框收口为用户可理解的配置 UI，哪怕底层仍然最终保存为 JSON。

## 40. 整体界面结构方向：系统型框架 + 任务型首页 + 专业深页

### 40.1 目标
训练系统最终不应被设计成纯财务后台式首页，也不应被设计成只能层层点进去的树状系统。  
更合适的方向是：

> 系统型框架 + 任务型首页 + 专业深页

也就是：
- 用系统框架保证模块稳定、入口清晰
- 用任务型首页承接每天最常见的训练操作
- 用专业深页承接复杂编辑、管理、回看与分析

### 40.2 为什么不建议纯财务后台式首页
财务后台式首页的优点是：
- 入口稳定
- 上下文清晰
- 卡片化信息承载能力强

但它的问题也很明显：
- 主任务不够突出
- 容易平均铺开信息
- 更适合“管理信息”，不够适合“执行任务”

训练系统和财务系统的根本差异在于：
- 用户每天最关心的是“今天练什么、哪里变了、怎么录、后面怎么变”
- 而不是均匀浏览一堆经营指标式卡片

因此不能直接照抄财务后台式首页。

### 40.3 为什么不建议纯层层钻取式系统
纯系统面板 / 纯树状钻取式结构的问题是：
- 高频任务路径太深
- 每天开始训练前需要连续点很多层
- 用户较难快速看到当前计划上下文与未来变化

训练系统中的高频任务包括：
- 今日训练
- 后续安排查看
- 执行录入
- 动作变化识别
- 训练记录回看

这些都要求系统有一个“任务工作台层”，而不能完全依赖深层页面。

### 40.4 推荐的整体结构
#### A. 左侧：系统导航
左侧用于放稳定入口，不承担复杂决策。

推荐优先级：
- 今日训练
- 训练计划
- 训练记录
- 模板库
- 动作库
- 观察与恢复
- 复盘分析
- 设置

原则：
- 高频训练任务靠前
- 低频管理模块靠后

#### B. 顶部：全局上下文栏
顶部用于展示当前用户所处的训练上下文，例如：
- 当前计划
- 当前周期 / microcycle
- 当前时间范围
- 当前视图模式（如本周 / 未来 7 次 / 本阶段）

目标：
> 让用户始终知道“我现在在看哪个计划、哪个阶段、哪个视图”。

#### C. 中部：首页采用任务型工作台
首页不应是平均铺开的后台总览，而应优先承接训练主任务。

首页优先级建议：
1. 今日 / 下一次训练
2. 逾期待处理
3. 未来几次训练变化摘要
4. 最近一次训练与恢复状态
5. 快捷入口（执行录入 / 查看后续安排 / 查看训练记录等）

### 40.5 深页定位
复杂编辑与深度查看，应放在专业深页中完成，例如：
- 计划详情页
- 模板详情页
- 动作详情页
- 执行录入页
- 训练记录页
- 复盘页

这些页面承担“真正深入处理信息”的职责，而不是把所有复杂信息都塞回首页。

### 40.6 桌面与移动端差异
#### 桌面端
推荐：
- 左侧固定导航
- 顶部上下文栏
- 中部任务型工作台
- 深页承接复杂操作

#### 移动端
推荐：
- 底部 Tab 或顶部切换替代左侧导航
- 保留上下文切换能力
- 仍以“今日训练”为第一入口

### 40.7 配色原则提醒
整体界面可以有活力和科技感，但不应让全局配色压过训练语义色。

建议：
- 底层 UI 使用中性底色
- 品牌色用于主按钮 / 顶部强调 / 选中态
- 训练语义色保持严格稳定，用于表达：
  - 常规推进
  - 实现进阶
  - 计划减量
  - 异常调整
  - 下次进阶预告
  - skipped / 风险 / 错误

### 40.8 当前结论
训练系统最终应长成：

> 有系统骨架的训练操作台

而不是：
- 纯财务后台
- 纯树状管理系统
- 纯 dashboard 式信息墙

## 39. 逾期待处理与当天训练的操作分流 UI

### 39.1 逾期待处理区块
逾期待处理区块的当前可操作对象仍应是“最早未解决训练”。

该区块建议提供 3 个主动作：
- 今天补练
- 改到某天（顺延后续）
- 忽略此次训练

其中：
- “忽略此次训练”应明确表达为：本次不补练，将以未训练结果归档
- 不应让用户误解为“顺延”或“只是关闭提醒”

### 39.2 当天训练卡片
当天训练卡片应新增“跳过本次训练”的操作入口。

该入口不应直接一键执行，而应展开为两个明确选项：
- 不练了（未训练归档，后续正常）
- 顺延（当前保留，后续整体往后）

### 39.3 文案原则
这些操作的文案必须让用户一眼知道差别：

- 忽略此次训练：强调“不补练”
- 不练了：强调“当前这次结束，不顺延”
- 顺延：强调“后续整体往后”

不要再只使用一个笼统的“跳过”或“改期”按钮承担全部语义。

### 39.4 交互原则
- 危险动作要二次确认
- 顺延动作尽量附带影响预览
- 忽略 / 不练了 应有清晰的结果说明
- 同一区域内不要同时堆太多等价按钮