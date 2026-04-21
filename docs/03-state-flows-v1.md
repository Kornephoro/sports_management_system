# State Flows v1

## 1. 文档目的

本文档记录训练核心域 v1 当前已经落地的关键状态流转。  
它不替代 `/docs/02-core-domain-v1.md`，而是描述在后端主链路实现后，系统中的主要业务流程如何流动。

---

## 2. 当前覆盖范围

本文档当前只覆盖以下最小后端主链路：

1. create program
2. get program detail
3. generate planned sessions
4. list planned sessions
5. create session execution
6. create unit executions
7. mark planned session completed / partial / skipped

---

## 3. Program 创建流转

### 3.1 输入
- 用户提交 Program 创建请求
- 请求包含最小必要字段
- 未提供的部分由默认策略补齐

### 3.2 流程
1. 校验输入
2. 生成 Program 默认策略配置
3. 写入 Program
4. 返回 Program 详情

### 3.3 输出
- Program 被创建
- Program 可被后续 planned session 生成逻辑使用

---

## 4. Planned Session 生成流转

### 4.1 输入
- 一个已有 Program
- Program 下关联的 Block / SessionTemplate / TrainingUnitTemplate
- 当前可用的 ProgressTrack

### 4.2 流程
1. 读取 Program 详情
2. 读取 Block 下的 SessionTemplate
3. 读取每个 SessionTemplate 下的 TrainingUnitTemplate
4. 读取当前用户的 ProgressTrack
5. 基于 Template 层生成 PlannedSession
6. 基于 TrainingUnitTemplate 生成 PlannedUnit
7. 将可匹配的 `progress_track_id` 和 `progression_snapshot` 写入 PlannedUnit
8. 返回生成结果

### 4.3 输出
- 一个或多个 PlannedSession
- 每个 PlannedSession 下关联多个 PlannedUnit

---

## 5. Planned Session 查询流转

### 5.1 输入
- Program 标识
- 用户标识

### 5.2 流程
1. 校验 Program 是否存在
2. 查询 Program 下的 PlannedSession
3. 返回 PlannedSession 列表及必要结构信息

### 5.3 输出
- PlannedSession 列表
- 可供页面展示与执行入口使用

---

## 6. Session Execution 创建流转

### 6.1 输入
- 某个 PlannedSession
- 用户提交的执行开始信息

### 6.2 流程
1. 校验 PlannedSession 是否存在
2. 创建 SessionExecution
3. 建立 `planned_session_id` 与 `program_id` 关联
4. 根据 execution 状态映射，回写 PlannedSession.status

### 6.3 输出
- SessionExecution 创建成功
- PlannedSession.status 被同步更新

---

## 7. Unit Execution 创建流转

### 7.1 输入
- 某个 SessionExecution
- 一个或多个 UnitExecution 输入项
- 输入项可关联 PlannedUnit

### 7.2 流程
1. 校验 SessionExecution 是否存在
2. 为每个输入项创建 UnitExecution
3. 若有关联 PlannedUnit，则回写对应 PlannedUnit.status
4. 聚合所有 UnitExecution 的状态
5. 推导并更新对应 PlannedSession.status

### 7.3 输出
- UnitExecution 写入成功
- PlannedUnit.status 更新
- PlannedSession.status 聚合更新

---

## 8. Planned Session 状态手动更新流转

### 8.1 输入
- 某个 PlannedSession
- 目标状态：completed / partial / skipped
- 可选的 PlannedUnit 状态批量更新

### 8.2 流程
1. 校验 PlannedSession 是否存在
2. 更新 PlannedSession.status
3. 如果请求包含 unit 状态，则同步更新相关 PlannedUnit.status
4. 返回更新结果

### 8.3 输出
- PlannedSession.status 被手动更新
- 必要时，PlannedUnit.status 一并更新

---

## 9. 当前状态映射原则

当前 v1 已实现的状态层次：

- Template 层：定义理论训练结构
- Planned 层：定义某次具体安排
- Execution 层：定义某次真实执行

当前已落地原则：

1. Template 不直接承载执行状态
2. Planned 不等于已执行
3. Execution 创建后会影响 Planned 状态
4. UnitExecution 的聚合结果会影响 PlannedSession 状态

---

## 10. 当前未覆盖内容

以下内容不在本文档当前范围：

- Observation 流转
- Evidence 上传与确认流转
- Constraint / Injury 介入流转
- 自动 progression 推进
- 复杂调度器
- Recommendation / DerivedAssessment

---

## 11. 当前结论

当前项目已经具备最小后端主链路：

`Program -> PlannedSession -> PlannedUnit -> SessionExecution -> UnitExecution`

因此，第 4 轮可视为完成。  
后续页面层应围绕该主链路进行最小闭环接入，而不应跳过 Planned 层直接写入 Execution 层。


## 12. ConstraintProfile 创建流转

### 12.1 输入
- 用户提交一个新的 ConstraintProfile
- 输入包括最小结构化字段，例如：
  - title
  - domain
  - body_region_tags
  - movement_tags
  - restriction_rules
  - training_implications
  - rehab_focus_tags

### 12.2 流程
1. 校验输入
2. 创建 ConstraintProfile
3. 初始状态设为 active
4. 返回创建结果

### 12.3 输出
- ConstraintProfile 创建成功
- 后续可被计划生成链路读取

---

## 13. ConstraintProfile resolve 流转

### 13.1 输入
- 一个已有的 ConstraintProfile
- resolve 操作请求

### 13.2 流程
1. 校验 ConstraintProfile 是否存在
2. 将其状态更新为 resolved
3. 写入 resolved 时间（如果当前实现包含该字段）
4. 返回更新结果

### 13.3 输出
- ConstraintProfile 不再属于 active constraint 集合
- 后续不会继续影响 planned session 生成链路

---

## 14. InjuryIncident 创建与关联流转

### 14.1 输入
- 用户提交一个新的 InjuryIncident
- 输入包括最小结构化字段，例如：
  - title
  - incident_type
  - body_region_tags
  - movement_context_tags
  - symptom_summary
  - current_restrictions

### 14.2 流程
1. 校验输入
2. 创建 InjuryIncident
3. 返回 injury 记录
4. 如用户后续选择关联约束，则通过更新 `ConstraintProfile.linked_injury_incident_id` 建立最小关联

### 14.3 输出
- InjuryIncident 创建成功
- 可被页面查看
- 可被后续约束条目链接

### 14.4 当前实现边界
当前只实现最小关联：

- `InjuryIncident -> ConstraintProfile` 的最小 link
- 不做复杂伤病恢复流程
- 不做自动 return-to-training 评分
- 不做完整 rehab plan

---

## 15. Constraint-aware 计划生成最小流转

### 15.1 输入
- 一个已有 Program
- Program 下关联的 Block / SessionTemplate / TrainingUnitTemplate
- 当前 active constraints
- 当前可用的 ProgressTrack

### 15.2 流程
1. 读取 Program 详情
2. 读取当前用户的 active constraints
3. 读取 Block 下的 SessionTemplate
4. 读取 TrainingUnitTemplate
5. 在构建 PlannedSession / PlannedUnit 时，对每个 PlannedUnit 进行最小约束匹配
6. 基于以下最小信息进行标签交集判断：
   - `progress_track_key`
   - `movement_pattern_tags`
   - `contraindication_tags`
   - `fatigue_tags`
   - ConstraintProfile 的 `movement_tags`
   - `body_region_tags`
   - `restriction_rules.avoid_patterns`
   - `restriction_rules.limit_fatigue_tags`
7. 将匹配结果写入 `PlannedUnit.constraint_snapshot`

### 15.3 当前输出
每个 PlannedUnit 的 `constraint_snapshot` 当前至少可包含：

- `active_constraint_count`
- `affected`
- `warning`
- `matched_constraints`

### 15.4 当前实现边界
当前只做到最小 constraint-aware planning：

- 能读取 active constraints
- 能写 `constraint_snapshot`
- 能标记 `affected = true`
- 能写轻量 warning（如 `constraint_affected_unit`）

当前未实现：

- 复杂动作替换
- 自动容量调整
- 自动疲劳重排
- 完整 rehab / recovery 引擎

---

## 16. 当前结论更新

当前项目的主链路已从：

`Program -> PlannedSession -> PlannedUnit -> SessionExecution -> UnitExecution`

扩展为：

`Program -> PlannedSession -> PlannedUnit(+constraint_snapshot) -> SessionExecution -> UnitExecution`

同时，系统当前已具备最小 Constraint / Injury 闭环：

- create constraint
- list active constraints
- resolve constraint
- create injury
- list injuries
- link injury to constraint

这意味着第 8 轮完成后，Constraint / Injury 已正式进入系统主链路，但仍保持在最小可验证范围内。

## 17. Execution 页面最小前端闭环更新

### 17.1 当前前端执行流程
在第 16 轮之后，Execution 页面当前采用两步式最小录入流程：

1. 先提交 `SessionExecution`
2. 再按 `PlannedUnit` 逐项提交 `UnitExecution`

这样做的目的，是在不重构主链路的前提下，把当前后端已有的 `UnitExecution` 能力释放到前端页面中。

### 17.2 Step 1：SessionExecution 提交流程
#### 输入
- 某个 `PlannedSession`
- 最小执行信息，例如：
  - performedAt
  - completionStatus
  - actualDurationMin
  - notes

#### 流程
1. 页面提交 `SessionExecution`
2. 后端创建 `SessionExecution`
3. 返回 `session_execution_id`
4. 页面进入 UnitExecution 录入阶段

#### 输出
- 当前执行记录获得 `session_execution_id`
- 页面可开始逐项录入 `UnitExecution`

---

### 17.3 Step 2：UnitExecution 逐项录入流程
#### 输入
- 某个 `SessionExecution`
- 当前 `PlannedSession` 下的 `PlannedUnit` 列表
- 每个 unit 的最小执行输入，例如：
  - completion_status
  - notes
  - perceived_exertion（可选）
  - pain_score（可选）

#### 流程
1. 页面加载该 `PlannedSession` 对应的 `PlannedUnit`
2. 用户为每个 `PlannedUnit` 填写最小执行结果
3. 页面调用 `POST /api/session-executions/[sessionExecutionId]/unit-executions`
4. 后端创建 `UnitExecution`
5. 后端回写 `PlannedUnit.status`
6. 后端聚合更新 `PlannedSession.status`
7. 页面刷新并显示最新状态

#### 输出
- `UnitExecution` 被逐项创建
- `PlannedUnit.status` 被更新
- `PlannedSession.status` 被聚合更新

---

### 17.4 当前前端闭环的意义
这意味着当前主链路已从：

`Program -> PlannedSession -> SessionExecution`

增强为：

`Program -> PlannedSession -> SessionExecution -> UnitExecution`

但仍保持在最小实现范围内，不等于完整训练日志系统。

### 17.5 当前实现边界
当前前端执行页已支持：

- 加载 `PlannedUnit`
- 逐项提交 `UnitExecution`
- 展示回写后的 `planned_session_status`
- 展示回写后的 `planned_unit.status`

当前未支持：

- 组级编辑器
- set-by-set 训练记录
- 历史执行对比
- 自动 progression 建议
- 完整训练日志回看系统

## 18. Execution 历史回看最小读取流转

### 18.1 输入
- 用户标识
- 可选 limit（默认最近若干条）

### 18.2 流程
1. 页面请求最近的 `SessionExecution`
2. 后端按 `performed_at desc, created_at desc` 查询该用户最近执行记录
3. 同时最小关联读取：
   - Program
   - PlannedSession
   - UnitExecution
   - UnitExecution 对应的 PlannedUnit 最小信息
4. 页面先展示 SessionExecution 列表
5. 用户按需展开某次执行，查看本次 `UnitExecution` 简表

### 18.3 输出
- 最近的 `SessionExecution` 列表
- 每条记录可展开查看本次 `UnitExecution` 简表

### 18.4 当前实现边界
当前历史回看流转已支持：

- 最近执行列表
- 本次 unit 执行简表
- Program / PlannedSession 的最小关联信息

当前未支持：

- 完整训练日志中心
- 复杂筛选与多维统计
- 历史趋势图
- set-by-set 历史明细


## 19. Execution 记录最小编辑流转

### 19.1 SessionExecution 编辑流转

#### 输入
- 某个已有的 `SessionExecution`
- 用户提交的最小修正字段，例如：
  - completion_status
  - actual_duration_min
  - notes

#### 流程
1. 校验 `SessionExecution` 是否存在
2. 校验当前用户是否有权限编辑该记录
3. 至少要求有一个可更新字段
4. 更新 `SessionExecution`
5. 如果 `completion_status` 发生变化，且存在 `planned_session_id`：
   - 将 execution completion status 映射为 planned session state
   - 回写 `PlannedSession.status`

#### 输出
- `SessionExecution` 更新成功
- 必要时，`PlannedSession.status` 被同步更新

---

### 19.2 UnitExecution 编辑流转

#### 输入
- 某个已有的 `UnitExecution`
- 用户提交的最小修正字段，例如：
  - completion_status
  - notes
  - perceived_exertion
  - pain_score

#### 流程
1. 校验 `UnitExecution` 是否存在
2. 校验当前用户是否有权限编辑该记录
3. 至少要求有一个可更新字段
4. 更新 `UnitExecution`
5. 如果 `completion_status` 发生变化，且存在 `planned_unit_id`：
   - 回写 `PlannedUnit.status`
   - 读取当前 `PlannedSession` 下所有 `PlannedUnit.status`
   - 聚合推导新的 `PlannedSession.status`
   - 回写 `PlannedSession.status`

#### 输出
- `UnitExecution` 更新成功
- 必要时，`PlannedUnit.status` 与 `PlannedSession.status` 被同步更新

---

### 19.3 当前结论更新
第 23 轮之后，训练主链路已不只是：

- 能创建执行记录
- 能回看执行记录

还进一步支持：

- 对 `SessionExecution` 做最小编辑
- 对 `UnitExecution` 做最小编辑
- 编辑后保持 Planned 层状态同步

这意味着训练记录已经从“只可写入”升级为“最小可修正”。

## 20. Planned Session 最小改期流转

### 20.1 输入
- 某个已有的 `PlannedSession`
- 用户提交的新 `session_date`

### 20.2 流程
1. 校验 `PlannedSession` 是否存在
2. 校验当前用户是否有权限修改该记录
3. 校验日期输入合法且非空
4. 更新 `PlannedSession.session_date`
5. 返回更新后的 `PlannedSession`
6. 页面重新拉取列表，反映：
   - 新日期
   - 新排序位置
   - 在当前分组规则中的新归位

### 20.3 输出
- `PlannedSession.session_date` 更新成功
- 安排页立即体现新日期与新位置

### 20.4 当前实现边界
当前最小改期流转已支持：

- 单条 `PlannedSession` 改期
- 页面内联编辑
- 改期后即时刷新

当前未支持：

- 自动顺延整组计划
- 冲突检测
- 拖拽排期
- 智能重排
- 完整排程系统

### 20.5 当前结论更新
第 24 轮之后，Planned Sessions 已不只是：

- 可生成
- 可查看
- 可标记状态

还进一步支持：

- **最小手动改期**

这意味着训练安排功能已经从“静态计划查看”升级为“最小可调度”。

## 21. 按 Planned Session 恢复最近执行记录流转

### 21.1 输入
- 某个 `PlannedSession`
- 用户标识
- mode = latest

### 21.2 流程
1. 页面请求某个 `PlannedSession` 的最近一次 `SessionExecution`
2. 后端按 `planned_session_id + user_id` 查询最近一次执行记录
3. 若找到记录，则返回该次 `SessionExecution`
4. execute 页可根据该结果进入“继续录入动作”或“去训练记录页继续编辑”的路径
5. 若该次已有 `UnitExecution`，页面应避免给用户造成“记录消失”的感觉，而应提供明确继续编辑入口

### 21.3 输出
- 用户可基于某个 `PlannedSession` 找回最近一次执行记录
- 用户可继续录入 `UnitExecution` 或跳转到训练记录页继续编辑

### 21.4 当前结论更新
该流转的加入，意味着训练主链已经开始支持“从安排找回执行记录”，而不是录了一次基本信息后就与原计划断开。