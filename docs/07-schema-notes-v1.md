# Schema Notes v1

## 1. 文档目的
本文档用于记录训练核心域 v1 在 Prisma schema 落地阶段的实现备注、折中与临时假设。  
本文档**不替代** `02-core-domain-v1.md`，领域真相仍以该文档为准。

## 2. 当前状态
- 14 个核心实体已落地到 `prisma/schema.prisma`。
- 首版 migration SQL 已生成，并已整理为 Prisma 标准 migration 目录结构。
- 当前 `prisma migrate dev` 未完成的核心原因是数据库不可达（`P1001`），不是 schema 语法错误。
- 当前代码状态已可进入第 3 轮前的文档整理与准备阶段。

## 3. 已落地的关键实现决定
- `Goal.status` 复用 `ProgramStatus`（两者值集合一致）。
- `EvidenceAsset.linked_entity_type + linked_entity_id` 保留为多态普通列，不做跨表外键。
- `ProgramType.return` 与 `ObservationSource.import` 使用 Prisma `@map(...)` 处理保留词。
- `ProgressTrack` 采用 `(user_id, track_key)` 全局唯一约束。
- payload/policy/config/snapshot/summary/state/restriction 等字段按 v1 原则保留为 `Json`，不提前拆表。
- Template / Planned / Execution 三层实体保持分离实现，未混合建模。

## 4. 关于 ProgressTrack 的特别说明
- `ProgressTrack` 从普通索引改为唯一约束，是为了防止同一用户同一轨道键出现重复记录，导致进步计数和状态分叉。
- v1 先不按 `program_id` 拆唯一性，是为了保持“同一用户同一轨道键对应同一持久轨道”的一致语义。
- 该决定意味着：在 v1 中，`(user_id, track_key)` 被视为进步轨道的稳定身份。

## 5. 关于 migration 基线的说明
- 最初 `prisma migrate dev --create-only` 未成功，根因是数据库连接不可达（`P1001`），并非 schema 建模错误。
- 当前已生成并保留 Prisma 标准 migration 目录结构（含 `migration_lock.toml` 与首个 `migration.sql`）。
- 当前阻塞 `migrate dev` 的问题是数据库连接，不是 schema 本身。
- 后续只要 PostgreSQL 可达，应优先恢复正常 Prisma migrate 流程（以 `_prisma_migrations` 为准）。

## 6. 当前仍然存在的限制 / 技术债
- 数据库当前不可达，尚未真实写入 `_prisma_migrations` 历史表。
- 首版 migration 目前属于基线整理后的结果。
- 尚未执行 seed（本轮范围外）。
- 尚未完成“真实数据库 apply + 回放校验”的全流程验证。

## 7. 第 3 轮前的注意事项
- 第 3 轮可以开始，但应先确认数据库连接可用。
- 优先恢复标准 Prisma migrate 工作流，确保迁移历史可追踪。
- 第 3 轮聚焦 seed 与最小数据访问层，不要顺手改 schema 结构；除非发现明确错误再单独处理。

## 8. 不在本文档范围
- 不新增领域对象。
- 不重写 14 个实体完整定义。
- 不复制 `02-core-domain-v1.md` 全文。
- 不将本文档写成 build order 或任务清单。
- 不展开 v2 规划细节。

## 9. 数据库落地验证更新

### 9.1 当前数据库落地状态
- 已切换为使用 Supabase Postgres。
- Prisma schema 已通过校验。
- `prisma migrate status` 已成功识别 migration 历史，并确认数据库 schema 为最新状态。
- `prisma migrate deploy` 已执行，当前无待应用 migration。
- `prisma db seed` 已成功执行，demo 数据已写入数据库。

### 9.2 当前连接策略
- 当前开发环境使用 Supabase connection pooler 连接数据库。
- `DATABASE_URL` 与 `DIRECT_URL` 当前均指向可用的 Supabase pooler 连接，以优先保证本地开发链路跑通。
- 当前数据库链路在本机网络直连条件下存在不稳定性，使用 VPN tun 模式后已成功完成 migration / seed 验证。

### 9.3 已完成的真实落库验证
以下链路已完成真实验证：

1. Prisma schema 校验通过  
2. 数据库 migration 状态检查通过  
3. migration deploy 执行通过  
4. seed 成功写入 demo 数据  
5. repository 读取链路可进入验证阶段

### 9.4 对当前状态的解释
这意味着当前项目已经不再停留在“仅完成 schema 编写”的阶段，而是已经完成：

- 真实数据库连接验证
- 真实数据库 schema 落地
- demo 数据落库

因此，第 3 轮的数据库准备工作可以视为完成，项目可以进入下一轮的主链路后端实现。

### 9.5 当前仍保留的注意事项
- 当前网络连通性对数据库访问存在环境依赖，后续如不使用 VPN 或网络路径变化，可能仍需重新确认连接可用性。
- 当前 `package.json#prisma` 的 deprecation warning 仍存在，但不影响 v1 当前推进，可后续统一处理。
- 当前 migration 历史已经可被 Prisma 正常识别，但后续仍应避免手工修改 migration 目录内容。

### 9.6 下一步边界
下一步应进入第 4 轮：

- Program / Session / Execution 主链路最小后端用例

但不应在下一轮中顺手重构 schema、连接策略或 migration 机制，除非出现新的明确错误。

### 9.7 Repository 读取验证结果

已通过最小验证脚本成功完成 repository 查询验证，结果如下：

```json
{
  "programFound": true,
  "blockCount": 1,
  "sessionTemplateCount": 3,
  "progressTrackCount": 2
}
```

项目正式进入后端主链路阶段


## 10. Evidence 最小闭环落地更新

### 10.1 当前落地状态
第 7 轮已完成 Evidence 模块的最小闭环，当前已经具备：

- 文件上传
- `EvidenceAsset` 创建
- `parse_status = pending`
- mock parse
- confirm / reject
- confirm 后的最小落点写入

### 10.2 当前 parse 状态说明
当前 Evidence 的解析流程仍为 **mock parse**，不是真实 AI / vision 解析。  
当前阶段的目标是验证：

- 证据上传链路
- `EvidenceAsset` 状态流转
- confirm / reject 交互
- confirm 后最小数据落点是否可用

因此，当前模块已经满足 v1 的最小验证需求，但不应被误解为真实解析能力已经完成。

### 10.3 当前最小落点策略
当前 `confirmParsedEvidence` 的最小落点选择为 `Observation`。  
这是当前阶段的最小实现决定，原因包括：

- 最容易验证
- 可快速形成与 Observation 模块的联动
- 能保持 `EvidenceAsset` 与实际业务对象分离

### 10.4 当前链路说明
当前已打通的最小 Evidence 链路为：

`upload -> EvidenceAsset(pending) -> mock parse(parsed / needs_review / failed) -> confirm / reject`

其中：

- confirm：写入 `Observation`
- reject：只更新 `EvidenceAsset.parse_status`

### 10.5 当前注意事项
- 当前 parse 仍为 mock，后续在页面、文档和 prompt 中都应持续明确标注
- 当前 `confirm -> Observation` 只是最小落点，不代表未来所有 evidence 都应统一落 Observation
- 后续接训练截图、营养截图、伤病证据时，应根据类型重新设计落点策略

### 10.6 当前结论
第 7 轮完成后，项目已具备最小 Evidence 验证闭环。  
这意味着：

- v1 已经不只是“计划 + 执行 + observation”
- 系统已经开始具备“外部证据输入 -> 状态流转 -> 确认落库”的能力

后续可以在不改变当前核心边界的前提下，继续推进 Constraint / Injury 等模块。

## 11. Constraint / Injury 最小闭环落地更新

### 11.1 当前落地状态
第 8 轮已完成 Constraint / Injury 的最小闭环，当前已经具备：

- ConstraintProfile 创建
- active constraints 查询
- ConstraintProfile resolve
- InjuryIncident 创建
- InjuryIncident 列表查询
- InjuryIncident 与 ConstraintProfile 的最小链接

### 11.2 `constraint_snapshot` 已从设计字段进入真实链路
在第 8 轮之前，`PlannedUnit.constraint_snapshot` 主要停留在 schema / 设计层。  
第 8 轮之后，该字段已经进入真实计划生成链路，并在生成 PlannedUnit 时写入最小约束快照。

这意味着：

- `constraint_snapshot` 不再只是预留字段
- 它已经是当前 constraint-aware planning 的实际输出

### 11.3 当前最小 constraint-aware planning 的实现范围
当前实现已支持：

- 读取当前 active constraints
- 在生成 planned sessions 时做最小标签交集匹配
- 对受影响的 PlannedUnit 写入：
  - `active_constraint_count`
  - `affected`
  - `warning`
  - `matched_constraints`

### 11.4 当前实现边界
当前仍然只做到最小可验证版本，不包括：

- 复杂动作替换
- 自动减量策略
- 自动疲劳管理
- rehab 计划驱动的训练重排
- return-to-training 评分系统

### 11.5 伤病与约束的当前关系
当前 InjuryIncident 与 ConstraintProfile 的关系已最小落地：

- InjuryIncident 可独立创建
- ConstraintProfile 可通过 `linked_injury_incident_id` 与 InjuryIncident 建立最小链接

当前未做：

- 多 injury 对一个 constraint 的复杂关系建模
- 自动由 injury 推导 constraint
- 复杂 injury 生命周期管理

### 11.6 当前结论
第 8 轮完成后，Constraint / Injury 已从“只存在于 schema 中的预留设计”升级为：

- 有 API
- 有页面
- 有最小主链路接入
- 能对 PlannedUnit 生成产生真实影响

因此，Constraint / Injury 已正式进入 v1 的实际运行能力范围，但仍处于最小实现边界内。