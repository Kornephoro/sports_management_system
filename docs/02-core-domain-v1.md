# Core Domain v1

## 1. 文档目的

本文档定义本项目的训练核心域 v1。  
它是数据库 schema、后端接口、前端页面、AI 导入流程的领域真相来源。

本项目当前阶段采用 **spec-first** 方式推进：

- 先人工确定核心数据结构和规则边界
- 再交给 vibe coding 执行实现
- 实现必须尽量服从本文档
- 如果实现与文档冲突，优先暴露冲突，不允许自行重构领域模型

---

## 2. v1 的目标

v1 只解决以下问题：

1. 系统打算让用户练什么
2. 用户实际练了什么
3. 每个训练单元如何维持自己的进步轨道
4. 系统如何接住图片 / 截图证据
5. 系统如何记录身体状态与恢复状态
6. 系统如何记录限制 / 疼痛 / 伤病，并影响训练安排

---

## 3. v1 不做什么

以下内容不属于 v1 正式实现范围：

- 完整饮食系统
- 消费 / 衣橱 / 厨房系统
- 游戏化激励系统
- 独立的康复计划引擎
- 自动医学诊断
- 复杂推荐引擎
- 完整多运动规则包
- 独立 SetExecution 表
- 独立 ParsedArtifact 表
- 微服务拆分
- 移动端 App

v1 的原则是：**先让主链路跑通，再扩展。**

---

## 4. v1 的硬原则

### 4.1 模板、计划实例、实际执行必须分开

- Template = 理论上怎么练
- Planned = 某次具体安排
- Execution = 实际发生了什么

### 4.2 进步轨道必须单独成实体

不能只靠历史执行记录临时推导。  
系统必须显式保存某个训练单元当前的进步状态。

### 4.3 原始证据和最终记录必须分开

因为未来要支持截图识别、图片识别、第三方导入。  
原始证据不是最终真相。

### 4.4 限制和伤病必须分开

- `ConstraintProfile` = 当前限制画像
- `InjuryIncident` = 一次具体伤病 / 疼痛 / 异常事件

### 4.5 训练单元不是“动作表”

`TrainingUnitTemplate` 是统一训练单元模板，可以表达：

- 力量动作
- 跑步间歇
- 连续有氧
- WOD
- 技术练习
- mobility / prehab / activation 单元

### 4.6 v1 的康复域先影响训练，不急着独立出完整康复处方系统

v1 只做：

- 记录限制
- 记录伤病
- 影响计划生成
- 记录疼痛和症状趋势
- 支持维护暴露不足警报

---

## 5. 顶层结构

训练核心域 v1 由 5 层组成：

1. 计划层
2. 执行层
3. 观测层
4. 证据层
5. 康复限制层

v1 的正式实体总数为 14 个：

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

---

## 6. 核心枚举

### 6.1 SportType

- `strength`
- `hypertrophy`
- `running`
- `swimming`
- `racket`
- `functional`
- `mixed`

### 6.2 GoalType

- `strength`
- `hypertrophy`
- `fat_loss`
- `endurance`
- `performance`
- `health`
- `habit`
- `return_to_training`

### 6.3 ProgramStatus

- `draft`
- `active`
- `paused`
- `completed`
- `archived`

### 6.4 BlockType

- `accumulation`
- `intensification`
- `peaking`
- `deload`
- `maintenance`
- `technique`
- `base`
- `return_to_training`

### 6.5 SessionCategory

- `strength`
- `hypertrophy`
- `conditioning`
- `endurance`
- `skill`
- `mixed`
- `recovery`
- `mobility`

### 6.6 UnitRole

- `main`
- `secondary`
- `accessory`
- `skill`
- `conditioning`
- `warmup`
- `cooldown`
- `mobility`
- `prehab`

### 6.7 UnitCategory

- `exercise`
- `intervals`
- `continuous`
- `circuit`
- `wod`
- `drill`
- `test`
- `mobility`
- `stability`
- `activation`

### 6.8 ProgressionFamily

- `strict_load`
- `threshold`
- `exposure`
- `performance`
- `autoregulated`

### 6.9 SessionState

- `planned`
- `ready`
- `completed`
- `partial`
- `skipped`
- `canceled`

### 6.10 UnitState

- `planned`
- `completed`
- `partial`
- `skipped`
- `failed`
- `replaced`
- `dropped`

### 6.11 ObservationDomain

- `body`
- `recovery`
- `nutrition`
- `health`
- `lifestyle`
- `rehab`

### 6.12 EvidenceParseStatus

- `pending`
- `parsed`
- `needs_review`
- `confirmed`
- `rejected`
- `failed`

### 6.13 ConstraintStatus

- `active`
- `monitoring`
- `resolved`

### 6.14 ConstraintDomain

- `mobility`
- `stability`
- `pain`
- `injury`
- `load_tolerance`
- `return_to_training`

### 6.15 InjuryStatus

- `acute`
- `monitoring`
- `recovering`
- `resolved`
- `recurring`

---

## 7. 实体定义

> 说明：
>
> - `id` 默认使用 UUID
> - `created_at` / `updated_at` 默认使用 `timestamptz`
> - `jsonb` 代表灵活结构字段，v1 不要过度拆表
> - `?` 表示可空

---

## 7.1 Goal

用户当前训练目标。

### 字段

- `id: UUID`
- `user_id: UUID`
- `name: string`
- `goal_type: GoalType`
- `primary_sport: SportType`
- `status: "draft" | "active" | "paused" | "completed" | "archived"`
- `priority: int`
- `start_date: date`
- `target_date?: date`
- `target_payload: jsonb`
- `success_metrics: jsonb`
- `constraints: jsonb`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 说明

`target_payload` 允许未来支持多种目标表达，例如：

- 体重目标
- 体脂目标
- 力量表现目标
- 跑步成绩目标

---

## 7.2 Program

阶段性训练容器，例如“12 周增肌计划”。

### 字段

- `id: UUID`
- `user_id: UUID`
- `goal_id: UUID`
- `name: string`
- `sport_type: SportType`
- `program_type: "training_cycle" | "maintenance" | "travel" | "return" | "prep"`
- `status: ProgramStatus`
- `version: int`
- `parent_program_id?: UUID`
- `start_date: date`
- `end_date?: date`
- `duration_weeks?: int`
- `weekly_frequency_target?: int`
- `weekly_exposure_mix: jsonb`
- `default_recovery_policy_type: "preserve_order" | "preserve_calendar" | "smart_merge" | "manual"`
- `default_recovery_policy_config: jsonb`
- `default_adaptation_policy_config: jsonb`
- `constraint_aware_planning: boolean`
- `source: "manual" | "ai_generated" | "template" | "imported"`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 说明

`weekly_exposure_mix` 是比“分化”更高一层的抽象。  
例如：

```json
{
  "upper_strength": 2,
  "lower_strength": 2,
  "aerobic_base": 1,
  "mobility_maintenance": 2
}
```

---

## 7.3 Block

Program 下的阶段块。

### 字段

- `id: UUID`
- `program_id: UUID`
- `sequence_no: int`
- `name: string`
- `block_type: BlockType`
- `start_date?: date`
- `end_date?: date`
- `objective_summary?: text`
- `volume_target: jsonb`
- `intensity_target: jsonb`
- `progression_focus: jsonb`
- `entry_criteria?: jsonb`
- `exit_criteria?: jsonb`
- `recovery_overrides?: jsonb`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

---

## 7.4 SessionTemplate

训练日模板。

### 字段

- `id: UUID`
- `block_id: UUID`
- `code: string`
- `name: string`
- `sequence_in_microcycle: int`
- `microcycle_anchor: "fixed_weekday" | "ordered_rotation" | "flexible"`
- `preferred_weekday?: int`
- `sport_type: SportType`
- `session_category: SessionCategory`
- `theme_tags: jsonb`
- `objective_summary?: text`
- `expected_duration_min?: int`
- `fatigue_cost: "low" | "medium" | "high" | "very_high"`
- `priority: int`
- `scheduling_policy_type: "fixed" | "ordered_rotation" | "flexible_window"`
- `scheduling_policy_config: jsonb`
- `enabled: boolean`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

---

## 7.5 TrainingUnitTemplate

统一训练单元模板。  
这是训练核心域 v1 最重要的实体。

### 字段

- `id: UUID`
- `session_template_id: UUID`
- `sequence_no: int`
- `name: string`
- `display_name?: string`
- `sport_type: SportType`
- `unit_role: UnitRole`
- `unit_category: UnitCategory`
- `movement_pattern_tags: jsonb`
- `muscle_tags: jsonb`
- `capability_tags: jsonb`
- `function_support_tags: jsonb`
- `fatigue_tags: jsonb`
- `conflict_tags: jsonb`
- `contraindication_tags: jsonb`
- `prerequisite_function_tags: jsonb`
- `is_key_unit: boolean`
- `optional: boolean`
- `priority_score_base: numeric(6,2)`
- `progress_track_key: string`
- `progression_family: ProgressionFamily`
- `progression_policy_type: string`
- `progression_policy_config: jsonb`
- `adjustment_policy_type: "always" | "rotating_pool" | "gated" | "manual"`
- `adjustment_policy_config: jsonb`
- `prescription_type: "sets_reps" | "sets_time" | "intervals" | "distance_time" | "rounds" | "amrap" | "emom" | "freeform"`
- `prescription_payload: jsonb`
- `success_criteria: jsonb`
- `min_spacing_sessions?: int`
- `adjustment_cooldown_exposures?: int`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 关键说明

#### `progress_track_key`

不要把进步轨道绑死在 `unit_template_id` 上。  
系统使用 `progress_track_key` 聚合“属于同一进步轨道”的暴露。

适用于：

- 同动作跨训练日累计
- 变式共用进步轨道
- 一分化下累计总次数后再进步

#### `function_support_tags`

描述这个单元在发展哪些身体功能，例如：

- `ankle_mobility`
- `scapular_control`
- `trunk_stability`

#### `contraindication_tags`

描述哪些限制状态下不适合做这个单元，例如：

- `overhead_irritation`
- `high_impact_knee_pain`
- `lumbar_flexion_intolerance`

#### `prerequisite_function_tags`

描述执行该单元最好具备哪些前置功能，例如：

- `ankle_dorsiflexion_basic`
- `shoulder_flexion_overhead_ok`

---

## 7.6 ProgressTrack

进步轨道的持久化实体。

### 字段

- `id: UUID`
- `user_id: UUID`
- `program_id?: UUID`
- `track_key: string`
- `name: string`
- `sport_type: SportType`
- `progression_family: ProgressionFamily`
- `progression_policy_type: string`
- `progression_policy_config: jsonb`
- `current_state: jsonb`
- `exposure_count: int`
- `success_count: int`
- `failure_count: int`
- `progression_count: int`
- `last_exposure_at?: timestamptz`
- `last_success_at?: timestamptz`
- `last_failure_at?: timestamptz`
- `last_progression_at?: timestamptz`
- `status: "active" | "paused" | "reset" | "completed"`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 说明

`current_state` 保存当前轨道状态，例如：

- 力量训练：负重 / 组数 / 次数区间
- 跑步：配速 / 间歇数量 / 时间目标
- mobility：维护暴露次数 / 阶段目标

---

## 7.7 PlannedSession

某天被生成出来的训练计划实例。

### 字段

- `id: UUID`
- `user_id: UUID`
- `program_id: UUID`
- `block_id?: UUID`
- `session_template_id?: UUID`
- `sequence_index: int`
- `session_date: date`
- `status: SessionState`
- `generation_reason: "initial_generation" | "rescheduled" | "manual_add" | "adapted"`
- `source_session_id?: UUID`
- `planned_start_at?: timestamptz`
- `planned_duration_min?: int`
- `objective_summary?: text`
- `adaptation_snapshot?: jsonb`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 说明

`adaptation_snapshot` 用于记录该次计划生成时参考了哪些上下文，例如：

- readiness
- active constraints
- reschedule 原因

---

## 7.8 PlannedUnit

某次训练里的具体计划单元实例。

### 字段

- `id: UUID`
- `planned_session_id: UUID`
- `unit_template_id?: UUID`
- `sequence_no: int`
- `status: UnitState`
- `selected_exercise_name?: string`
- `selected_variant_tags?: jsonb`
- `progress_track_id?: UUID`
- `target_payload: jsonb`
- `progression_snapshot?: jsonb`
- `constraint_snapshot?: jsonb`
- `required: boolean`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

---

## 7.9 SessionExecution

实际发生的一次训练。

### 字段

- `id: UUID`
- `user_id: UUID`
- `planned_session_id?: UUID`
- `program_id?: UUID`
- `block_id?: UUID`
- `performed_at: timestamptz`
- `completion_status: "completed" | "partial" | "skipped" | "aborted" | "extra"`
- `actual_duration_min?: int`
- `session_rpe?: numeric(3,1)`
- `pre_session_state?: jsonb`
- `post_session_state?: jsonb`
- `deviation_reason?: text`
- `notes?: text`
- `imported_from_evidence_id?: UUID`
- `created_at: timestamptz`
- `updated_at: timestamptz`

---

## 7.10 UnitExecution

实际完成的训练单元。

### 字段

- `id: UUID`
- `session_execution_id: UUID`
- `planned_unit_id?: UUID`
- `unit_template_id?: UUID`
- `progress_track_id?: UUID`
- `sequence_no: int`
- `completion_status: "completed" | "partial" | "skipped" | "failed" | "replaced"`
- `actual_unit_name?: string`
- `actual_payload: jsonb`
- `set_logs?: jsonb`
- `result_flags?: jsonb`
- `symptom_tags?: jsonb`
- `perceived_exertion?: numeric(3,1)`
- `pain_score?: int`
- `auto_progression_candidate?: boolean`
- `notes?: text`
- `imported_from_evidence_id?: UUID`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 说明

v1 不单独建立 `SetExecution` 表。  
组级日志先放在 `set_logs` 中。

`symptom_tags` 用于记录症状趋势，例如：

- `right_shoulder_front_pain`
- `low_back_tightness`
- `left_knee_tracking_issue`

---

## 7.11 Observation

通用观测值实体。

### 字段

- `id: UUID`
- `user_id: UUID`
- `observed_at: timestamptz`
- `observation_domain: ObservationDomain`
- `metric_key: string`
- `value_numeric?: numeric(10,3)`
- `value_text?: string`
- `value_json?: jsonb`
- `unit?: string`
- `source: "manual" | "device" | "image_parse" | "import"`
- `confidence?: numeric(4,3)`
- `linked_program_id?: UUID`
- `linked_session_execution_id?: UUID`
- `evidence_asset_id?: UUID`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 说明

Observation 统一承载：

- 体重
- 体脂
- 腰围
- 晨脉
- 睡眠
- 疲劳
- 疼痛
- 活动度测量
- 康复相关状态

示例 `metric_key`：

- `bodyweight`
- `resting_hr`
- `sleep_hours`
- `fatigue_score`
- `pain_score_shoulder_right`
- `ankle_dorsiflexion_left_cm`

---

## 7.12 EvidenceAsset

原始证据实体。

### 字段

- `id: UUID`
- `user_id: UUID`
- `asset_type: "image" | "screenshot" | "pdf" | "other"`
- `source_app?: string`
- `domain_hint: "training" | "nutrition" | "body_metric" | "health" | "rehab" | "other"`
- `captured_at?: timestamptz`
- `uploaded_at: timestamptz`
- `storage_url: text`
- `mime_type: string`
- `file_hash?: string`
- `parse_status: EvidenceParseStatus`
- `parser_version?: string`
- `parsed_summary?: jsonb`
- `confidence?: numeric(4,3)`
- `linked_entity_type?: "session_execution" | "unit_execution" | "observation" | "injury_incident" | "none"`
- `linked_entity_id?: UUID`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 说明

v1 不独立建立 ParsedArtifact 表。  
解析结果先放在 `parsed_summary` 中。

---

## 7.13 ConstraintProfile

当前限制画像。

### 字段

- `id: UUID`
- `user_id: UUID`
- `status: ConstraintStatus`
- `title: string`
- `domain: ConstraintDomain`
- `body_region_tags: jsonb`
- `movement_tags: jsonb`
- `severity: "low" | "moderate" | "high"`
- `description?: text`
- `symptom_summary?: text`
- `restriction_rules: jsonb`
- `training_implications: jsonb`
- `rehab_focus_tags: jsonb`
- `maintenance_requirement?: jsonb`
- `detected_from: "manual" | "coach" | "system_inference" | "image_parse"`
- `linked_injury_incident_id?: UUID`
- `started_at?: timestamptz`
- `resolved_at?: timestamptz`
- `notes?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 关键说明

#### `restriction_rules`

定义禁止和限制，例如：

```json
{
  "avoid_patterns": ["overhead_press", "high_impact_landing"],
  "limit_fatigue_tags": ["axial_load_high"],
  "max_pain_allowed": 2
}
```

#### `training_implications`

定义训练系统应该如何改，例如：

```json
{
  "replace_with_tags": ["landmine_press", "scapular_control"],
  "add_warmup_tags": ["tspine_mobility", "rotator_cuff_activation"],
  "reduce_volume_percent": 30
}
```

#### `maintenance_requirement`

定义维护暴露要求，用于长期不维护时警报，例如：

```json
{
  "target_tags": ["ankle_mobility", "tspine_extension"],
  "min_exposures_per_14_days": 4,
  "warning_threshold_days": 10
}
```

---

## 7.14 InjuryIncident

一次具体伤病 / 疼痛 / 事件。

### 字段

- `id: UUID`
- `user_id: UUID`
- `linked_session_execution_id?: UUID`
- `linked_unit_execution_id?: UUID`
- `evidence_asset_id?: UUID`
- `status: InjuryStatus`
- `incident_type: "pain" | "strain" | "sprain" | "overuse" | "mobility_loss" | "other"`
- `title: string`
- `body_region_tags: jsonb`
- `movement_context_tags: jsonb`
- `onset_at?: timestamptz`
- `pain_level_initial?: int`
- `mechanism_summary?: text`
- `symptom_summary?: text`
- `suspected_causes: jsonb`
- `clinical_diagnosis?: text`
- `current_restrictions: jsonb`
- `return_readiness_status: "not_ready" | "limited" | "graded_return" | "ready"`
- `resolved_at?: timestamptz`
- `retrospective_summary?: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### 说明

这个实体用于：

- 记录伤病 / 疼痛事件
- 跟踪恢复状态
- 支持伤后复盘
- 反向生成或关联限制画像

---

## 8. 实体关系

### 8.1 计划主链

- `Goal` 1 对多 `Program`
- `Program` 1 对多 `Block`
- `Block` 1 对多 `SessionTemplate`
- `SessionTemplate` 1 对多 `TrainingUnitTemplate`

### 8.2 计划实例链

- `Program` 1 对多 `PlannedSession`
- `PlannedSession` 1 对多 `PlannedUnit`

### 8.3 执行链

- `Program` 1 对多 `SessionExecution`
- `SessionExecution` 1 对多 `UnitExecution`

### 8.4 进步轨道链

- `Program` 1 对多 `ProgressTrack`
- `PlannedUnit` 可关联 `ProgressTrack`
- `UnitExecution` 可关联 `ProgressTrack`

### 8.5 观测与证据链

- `Observation` 可关联 `Program`
- `Observation` 可关联 `SessionExecution`
- `Observation` 可关联 `EvidenceAsset`
- `EvidenceAsset` 可关联 `SessionExecution`
- `EvidenceAsset` 可关联 `UnitExecution`
- `EvidenceAsset` 可关联 `Observation`
- `EvidenceAsset` 可关联 `InjuryIncident`

### 8.6 康复限制链

- `ConstraintProfile` 可关联 `InjuryIncident`
- `ConstraintProfile` 在计划生成时影响 `Program / PlannedSession / PlannedUnit`
- `InjuryIncident` 可关联 `SessionExecution / UnitExecution / EvidenceAsset`

---

## 9. v1 的关键流程

### 9.1 计划生成

`Program -> Block -> SessionTemplate -> TrainingUnitTemplate -> PlannedSession -> PlannedUnit`

生成过程中可以读取：

- 当前 `ProgressTrack`
- 当前 `ConstraintProfile`
- 最近 `Observation`

### 9.2 执行记录

`PlannedSession -> SessionExecution`  
`PlannedUnit -> UnitExecution`

### 9.3 导入记录

`EvidenceAsset -> parsed_summary -> 用户确认 -> SessionExecution / UnitExecution / Observation / InjuryIncident`

### 9.4 限制影响训练

`ConstraintProfile -> 过滤 / 替换 / 降级 / 加 warmup / 加 prehab`

### 9.5 伤病事件闭环

`UnitExecution/SessionExecution -> InjuryIncident -> ConstraintProfile -> 影响未来计划`

---

## 10. v1 中必须保持 jsonb 的字段

以下字段在 v1 不要过度拆表：

- `Goal.target_payload`
- `Goal.success_metrics`
- `Goal.constraints`
- `Program.weekly_exposure_mix`
- `Program.default_recovery_policy_config`
- `Program.default_adaptation_policy_config`
- `Block.volume_target`
- `Block.intensity_target`
- `Block.progression_focus`
- `SessionTemplate.theme_tags`
- `SessionTemplate.scheduling_policy_config`
- `TrainingUnitTemplate.movement_pattern_tags`
- `TrainingUnitTemplate.muscle_tags`
- `TrainingUnitTemplate.capability_tags`
- `TrainingUnitTemplate.function_support_tags`
- `TrainingUnitTemplate.fatigue_tags`
- `TrainingUnitTemplate.conflict_tags`
- `TrainingUnitTemplate.contraindication_tags`
- `TrainingUnitTemplate.prerequisite_function_tags`
- `TrainingUnitTemplate.progression_policy_config`
- `TrainingUnitTemplate.adjustment_policy_config`
- `TrainingUnitTemplate.prescription_payload`
- `TrainingUnitTemplate.success_criteria`
- `ProgressTrack.progression_policy_config`
- `ProgressTrack.current_state`
- `PlannedSession.adaptation_snapshot`
- `PlannedUnit.target_payload`
- `PlannedUnit.progression_snapshot`
- `PlannedUnit.constraint_snapshot`
- `SessionExecution.pre_session_state`
- `SessionExecution.post_session_state`
- `UnitExecution.actual_payload`
- `UnitExecution.set_logs`
- `UnitExecution.result_flags`
- `UnitExecution.symptom_tags`
- `Observation.value_json`
- `EvidenceAsset.parsed_summary`
- `ConstraintProfile.body_region_tags`
- `ConstraintProfile.movement_tags`
- `ConstraintProfile.restriction_rules`
- `ConstraintProfile.training_implications`
- `ConstraintProfile.rehab_focus_tags`
- `ConstraintProfile.maintenance_requirement`
- `InjuryIncident.body_region_tags`
- `InjuryIncident.movement_context_tags`
- `InjuryIncident.suspected_causes`
- `InjuryIncident.current_restrictions`

---

## 11. v1 的关键设计决定

### 11.1 `ProgressTrack` 必须独立存在

否则无法稳定支持：

- 跨训练日累计
- 主项 / 辅项不同推进策略
- 低分化 / 高分化统一表达

### 11.2 `TrainingUnitTemplate` 是核心，不是动作表

这样未来才能接更多运动形式，而不是被力量训练绑死。

### 11.3 `ConstraintProfile` 先做限制画像，不急着做完整康复引擎

这样可以在 v1 就把康复和训练接起来，同时控制复杂度。

---

## 12. v1 之后最自然的扩展方向

以下内容属于 v2 优先扩展范围：

- RehabPlan
- RehabUnitTemplate
- DerivedAssessment
- Recommendation
- NutritionEntry
- RewardLedger
- Purchase / Inventory

---

## 13. 对实现层的约束

实现层必须遵守以下约束：

1. 不允许擅自重命名领域对象
2. 不允许把 Template / Planned / Execution 合并
3. 不允许删掉 `ProgressTrack`
4. 不允许把 `ConstraintProfile` 简化成备注字段
5. 不允许把所有 jsonb 字段提前完全正规化
6. 如果发现文档与实现冲突，应先报告冲突，再等待进一步决策