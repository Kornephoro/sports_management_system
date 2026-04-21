# 14. AI 共享因子总表 / 注册表 v1

> 更新时间：2026-04-20  
> 作用说明：本文件用于统一维护系统中所有可被多个 AI 模块复用的共享因子。  
> 维护原则：未来新增影响因素时，优先往本表追加，不要把同一个因子分散写进多个模块说明里。

---

## 1. 文档目的

本文件用于回答 4 个核心问题：

1. 哪些因素会跨 AI 模块复用
2. 这些因素从哪里来
3. 这些因素什么时候被记录、什么时候生效、什么时候真正接入 AI
4. 当前哪些因素已经落地，哪些还在计划中

本文件的目标不是描述某一个 AI 功能，而是维护：

> 整个系统的“共享因子池”。

---

## 2. 当前 AI 模块缩写

为避免表格过宽，本文件统一使用以下缩写：

- `O` = 首次使用者评估 / onboarding 分级
- `P` = AI 建包 / 计划包创建
- `A` = 动作继承 / 起始锚点
- `R` = 恢复与疲劳助手
- `S` = 轮转 / 自动调度 / 排期
- `I` = 伤病 / 限制 / 回归训练助手
- `X` = 动作替换 / 模糊匹配 / 语义选动作

---

## 3. 作用方式缩写

- `H` = 硬约束
  - 一旦命中，应优先于普通加权逻辑
- `W` = 强加权
  - 显著影响 AI 判断方向
- `M` = 中加权
  - 参与排序和调权，但通常不单独决定结果
- `E` = 解释因子
  - 主要用于解释、摘要、理由生成

---

## 4. 文档维护字段约定

这里的时间字段不是给系统运行逻辑看的，而是给文档维护看的。

它的目标只有一个：

> 让维护者一眼区分哪些因子是这份注册表最初就有的，哪些是后续追加的。

建议所有日期都尽量使用绝对日期，例如 `2026-04-20`。

| 字段 | 含义 | 用途 |
|---|---|---|
| `来源批次` | 该因子属于哪一轮整理或补充 | 区分初始版与后续新增 |
| `首次纳入注册表时间` | 该因子第一次被写入本注册表的日期 | 看它是什么时候加进文档的 |
| `最近维护时间` | 最近一次修改该因子描述、状态或备注的日期 | 看它最近有没有被更新 |
| `当前状态` | `planned / partial / live / deprecated` | 看它当前是否已接入系统 |

### 4.1 使用原则

- 这几个字段只服务文档维护，不代表数据库字段
- 它们不等于系统运行时的时间戳
- 如果未来需要系统级时间字段，应写到 schema 或实现文档，不放在这里
- 本文档里所有“是否已落地”的判断，以 `当前状态` 为准

---

## 5. 共享因子总表

| factor_key | 因子名称 | 分类 | 核心子项 / 典型字段 | 来源 | 更新频率 | 新鲜度窗口 | 影响模块 | 作用 | 当前状态 | 来源批次 | 首次纳入注册表时间 | 最近维护时间 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `exercise_semantics` | 动作语义知识库 | 知识库 | `name` `aliases` `movement_pattern` `primary_regions` `recording_mode` `equipment_tags` | knowledge / system | 低频 | 长期有效 | `P A S X` | `H/W` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 动作库已有别名和结构标签，可作为模糊匹配底座 |
| `training_profile_base` | 基础训练画像 | 基础画像 | `experience_level` `technique_confidence` `progression_literacy` | onboarding | 低频 | 90-180 天建议复核 | `O P A R S` | `W/M` | live | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 已落首次画像页、存储仓库，并在起算锚点 AI prompt 中实际接入 |
| `return_to_training_state` | 回归训练状态 | 基础画像 / 当前状态 | `is_returning` `detraining_gap_days` `reentry_phase` | onboarding + system | 中频 | 28-56 天 | `P A R S I` | `W` | live | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 已由首次画像自动派生，并作为起算锚点 AI 的共享输入 |
| `goal_phase_context` | 目标与阶段上下文 | 基础画像 | `primary_goal` `secondary_goal` `phase_bias` `current_block_type` | onboarding + program | 中频 | 一个阶段内有效 | `P A R S` | `W` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 影响计划结构、锚点保守程度、恢复阈值 |
| `schedule_capacity` | 时间与排期能力 | 基础画像 | `training_days_per_week` `session_duration_min` `schedule_stability` `travel_risk` | onboarding + calendar behavior | 中频 | 14-30 天建议更新 | `P R S` | `W` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 已落 `training_days_per_week` / `session_duration_min` 并接入锚点 AI；稳定性与出差风险仍未结构化 |
| `equipment_environment` | 器械与场地环境 | 基础画像 | `gym_type` `equipment_profile` `environment_stability` | onboarding + manual | 低频 | 长期有效 | `P A S X` | `H/W` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 已落 `equipment_environment` 并接入起算锚点 AI；更细的器械画像仍未补齐 |
| `exercise_preferences` | 动作偏好与禁忌 | 基础画像 | `must_keep_exercises` `must_avoid_exercises` `style_preference` | onboarding + manual | 中频 | 长期有效 | `P S X` | `H/W` | planned | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 必练 / 必避不应只在第一次建包生效 |
| `injury_constraint_profile` | 伤病与限制画像 | 基础画像 / 当前状态 | `constraint_domain` `restriction_rules` `return_readiness_status` `body_region_tags` | onboarding + injury + constraint | 中频 | 直到解除 | `P A R S I X` | `H` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 约束与伤病已接入起算锚点 AI prompt，但跨模块硬约束执行仍未完全统一 |
| `extra_activity_context` | 额外运动与体力背景 | 基础画像 / 当前状态 | `other_sports` `step_load` `manual_labor` `competition_period` | onboarding + manual + periodic checkin | 中频 | 3-14 天 | `P A R S I` | `M/W` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 已落 `extra_sports` 并接入起算锚点 AI；步数、体力劳动、赛期仍未结构化 |
| `sleep_fatigue_stress` | 睡眠 / 疲劳 / 压力 | 当前状态 | `sleep_hours` `sleep_quality` `fatigue_score` `stress_level` `readiness` | daily checkin / device / derived | 高频 | 1-3 天高权重 | `A R S I` | `W` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 已把 `sleep_hours` / `fatigue_score` 接入起算锚点 AI；睡眠质量、压力与 readiness 仍待补齐 |
| `pain_symptom_state` | 疼痛与症状状态 | 当前状态 | `pain_score` `symptom_tags` `pain_location` `abnormal_tightness` | post-workout + daily + injury | 高频 | 1-7 天 | `A R S I X` | `H/W` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 不只是伤病模块使用，也会影响继承和动作替换 |
| `body_metric_trends` | 身体指标趋势 | 当前状态 | `bodyweight` `waist_circumference` `resting_heart_rate` `hrv` | daily checkin / device | 高频 | 单点 1-3 天，趋势 14-45 天 | `P A R S` | `M/W` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 趋势比单点值更重要 |
| `training_completion_quality` | 训练完成质量 | 训练行为 | `completion_status` `partial_rate` `skip_rate` `adherence_run` | system | 高频 | 7-28 天 | `A R S S P` | `W` | live | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 会反向影响建包、继承、恢复和排期 |
| `execution_intensity_deviation` | 执行强度与偏离 | 训练行为 | `actual_rpe` `perceived_exertion` `deviation_tags` `reason_tags` `replaced_exercise_name` | workout system | 高频 | 最近 1-6 次训练最高权重 | `A R S I X` | `W` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 偏离原因非常重要，可区分时间问题、疲劳问题、疼痛问题 |
| `movement_performance_history` | 动作历史与表现锚点 | 训练行为 | `latest_load` `latest_reps` `latest_duration` `e1rm` `days_since_last_performed` `exposure_count` | system | 高频 | 14-240 天按场景取窗 | `A S P` | `W/H` | live | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 继承锚点最核心的证据组 |
| `plan_fit_behavior` | 计划适配行为画像 | 训练行为 / 派生结论 | `frequent_time_limit` `frequent_fatigue_abort` `frequent_pain_adjustment` | derived from system | 中频 | 14-42 天 | `P R S I` | `W` | planned | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 后期非常有价值，能让系统学会“用户实际上能执行什么” |
| `derived_recovery_risk` | 派生恢复风险 | 派生结论 | `fatigue_state` `recovery_risk` `stress_signals` | rules / derived | 高频 | 1-3 天 | `R S A I` | `W/E` | live | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 适合作为“规则底座 + AI 解释层”的核心桥梁 |
| `anchor_confidence` | 锚点置信度 | 派生结论 | `anchor_confidence` `history_reliability` `logic_change_risk` | rules / ai | 中频 | 直到下一次确认 | `A S` | `W/E` | partial | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 起算锚点 AI 已输出 `confidence` 并展示在排期前确认页，但尚未沉淀为独立规则层因子 |
| `schedule_disruption_risk` | 排期中断风险 | 派生结论 | `next_48h_conflict_risk` `travel_window` `sleep_disruption_risk` | calendar + checkin + derived | 高频 | 1-3 天 | `S R P` | `W` | planned | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 未来做智能排期很关键 |
| `ai_decision_trace` | AI 决策痕迹 | 派生结论 / 审计 | `decision_source` `selection_reason` `why_held` `why_not_selected` | ai + system | 高频 | 长期保留 | `A R S P I X` | `E` | planned | `v1 初始整理` | 2026-04-20 | 2026-04-20 | 便于解释和回溯，不是直接输入因子，但属于共享审计层 |

---

## 6. 当前优先补齐建议

如果从“共享因子池”角度看，当前最值得优先补齐的是：

### 6.1 第一优先级

- `sleep_fatigue_stress`
  - 重点补 `readiness` `stress_level` `sleep_quality`
- `pain_symptom_state`
  - 重点补部位、类型、持续时间、是否影响训练
- `training_profile_base`
  - 重点补首次评估结构化分级结果

### 6.2 第二优先级

- `schedule_capacity`
- `extra_activity_context`
- `plan_fit_behavior`

### 6.3 第三优先级

- `anchor_confidence`
- `schedule_disruption_risk`
- `ai_decision_trace`

---

## 7. 新增因子时的填写模板

未来新增因子时，建议直接复制下面这一行：

| factor_key | 因子名称 | 分类 | 核心子项 / 典型字段 | 来源 | 更新频率 | 新鲜度窗口 | 影响模块 | 作用 | 当前状态 | 来源批次 | 首次纳入注册表时间 | 最近维护时间 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `new_factor_key` | 新因子名称 | 基础画像 / 当前状态 / 训练行为 / 派生结论 / 知识库 | `field_a` `field_b` | onboarding / manual / system / device / derived / ai | 高频 / 中频 / 低频 | 例如 1-3 天 / 14-42 天 / 长期有效 | `P A R S` | `H/W/M/E` | planned / partial / live / deprecated | `v1 后续补充` / `v2 新增` | YYYY-MM-DD | YYYY-MM-DD | 说明它为什么值得进入共享因子池 |

---

## 8. 维护规则

### 8.1 不要重复造因子

如果某个信息已经在共享因子池里存在：

- 优先扩展它的字段
- 不要新建一个语义重叠的平行因子

### 8.2 不要把“原始数据”和“派生结论”混成一个因子

例如：

- `fatigue_score` 属于原始输入
- `fatigue_state` 属于派生结论

二者应分开维护。

### 8.3 每个因子都应尽量回答 3 个问题

1. 它从哪里来
2. 它会影响哪些 AI 模块
3. 它在多长时间内仍然有效

### 8.4 每次新增或修改因子时，至少维护 3 个字段

- `来源批次`
- `首次纳入注册表时间`
- `最近维护时间`

如果只是文档层新增，也应先把这 3 个字段补上。

### 8.5 是否已接入系统，以 `当前状态` 为准

- `planned` = 仅文档规划
- `partial` = 已有部分结构或局部链路
- `live` = 已明确接入当前系统判断
- `deprecated` = 已不建议继续使用

不要再把文档维护日期误当成系统时间字段。
