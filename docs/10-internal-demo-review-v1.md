# Internal Demo Review v1

## 1. 文档目的

本文档记录项目第一次内部演示（internal demo）的实际体验反馈。  
它的作用是：

- 固化第一次“看成果”的真实体验
- 识别当前 v1 的主要可用性问题
- 为下一轮优化确定优先级
- 区分“结构没通”与“体验不顺”的问题

本文档不替代：

- `/docs/02-core-domain-v1.md`
- `/docs/03-state-flows-v1.md`
- `/docs/05-ui-map-v1.md`
- `/docs/08-implementation-notes-v1.md`

---

## 2. 演示总体结论

当前系统已经具备“内部 alpha 可演示”的基础，但**主链路尚未顺利走通**，因此当前更准确的判断是：

- 已具备多个独立可验证模块
- 已具备产品雏形
- 但 Program 主链路仍存在阻塞与理解成本
- 下一轮应优先优化 Program / Planned Sessions / Execution 相关体验

---

## 3. 演示结果总览

### 3.1 成功项
- Observation 能录能查
- Evidence 能上传并走状态流转
- Constraint / Injury 能录入并影响计划生成
- 页面之间能顺利跳转
- 演示过程中没有出现结构性断链

### 3.2 未完成项
- 主链路无法完整走通
- 无法完成 Planned Sessions 到 Execution 的完整闭环测试

---

## 4. 分模块反馈记录

### 4.1 首页

#### 反馈
- 首页入口表达清晰
- 对每个页面有简要描述，便于理解其功能
- 但没有体现推荐使用顺序
- 用户看不出“应该先从哪里开始操作”

#### 结论
首页的信息架构已经具备基础说明能力，但缺少“新用户起步引导”。

#### 后续建议
后续应考虑补充最小使用路径提示，例如：

- 第一步看 Program
- 第二步生成 Planned Sessions
- 第三步进入 Execution
- 之后再看 Observations / Evidence / Constraints

---

### 4.2 Program 列表页

#### 反馈
- 进入 Program 时有约 2~3 秒缓冲
- 页面能打开，但响应偏慢

#### 结论
Program 页面当前可用，但性能体验一般。

#### 后续建议
下一轮应优先排查：

- 数据请求是否过重
- 是否有不必要的阻塞式加载
- 是否可增加最小 loading / skeleton 提示

---

### 4.3 Program 详情页

#### 反馈
- 进入 Program 详情时也略有卡顿
- Program 详情整体结构可以一眼看懂
- 但 `SessionTemplate` 和 `TrainingUnitTemplate` 没有被明显区分出来
- 其中一部分原因可能是当前术语为英文，理解成本较高

#### 结论
Program 详情的信息层次已有雏形，但当前命名与展示方式不足以帮助用户区分模板层级。

#### 后续建议
后续优先考虑：

- 补充中文标签或中英对照
- 在页面视觉上区分 SessionTemplate 与 TrainingUnitTemplate
- 增加最小术语解释

---

### 4.4 Planned Sessions 页

#### 反馈
- 进入 Planned Sessions 页面本身较顺畅
- 点击“生成 planned sessions”时，提示：
  `No enabled session templates found under this program`
- 因此无法完成后续 Planned Sessions / Execution 主链路测试

#### 结论
这是当前内部演示中最关键的阻塞点。  
主链路没有真正走通，不是因为页面跳转断裂，而是因为 Program -> Planned Sessions 生成阶段出现业务阻塞。

#### 后续建议
下一轮应优先检查：

- Program 下是否真实存在 enabled session templates
- 生成逻辑与 seed/demo 数据是否一致
- 页面提示是否对用户足够可理解
- 是否需要在 Program 详情页直接显示当前模板是否 enabled

---

### 4.5 Observation 页面

#### 反馈
- Observation 各项测试均顺利完成
- 体重、睡眠、疲劳录入与查询都可用
- 但 fatigue score 的含义不清楚：
  - 越大越疲劳，还是越大越精神？
  - 满分是多少？
  - 应该填整数、一位小数还是任意浮点数？
  - 缺少输入规则说明

#### 结论
Observation 功能闭环已成立，但“指标语义说明”不足。

#### 后续建议
后续应至少补充：

- fatigue score 的定义
- 量表方向（高分更差还是更好）
- 分值范围
- 输入格式限制与提示

---

### 4.6 Evidence 页面

#### 反馈
- 上传过程流畅
- parse 状态流转可能因英文而不太容易理解
- confirm / reject 含义清晰
- 初始时页面下方的 `Evidence 列表与状态流转` 显示 `Internal server error`
- 对第一张卡片执行 reject 后，所有卡片下方的交互按钮消失，导致后续测试无法继续完成

#### 结论
Evidence 模块的“上传”部分表现良好，但“列表 / 状态流转 / 多卡片交互”存在明显问题。

#### 后续建议
应排查：

- Evidence 列表初始加载错误
- 某张卡 reject 后是否错误影响整个列表渲染状态
- 状态流转后的按钮显示逻辑
- parse 状态展示是否需要中文化或术语提示

---

### 4.7 Constraint / Injury 页面

#### 反馈
- Constraint Profile 创建成功
- 成功显示在 active 列表中
- 与创建的 InjuryIncident 成功链接
- resolve 操作可用
- Planned Sessions 相关影响无法进一步验证，因为主链路在前面已被阻塞

#### 结论
Constraint / Injury 的最小闭环可视为成立。  
但它对计划生成的最终用户可感知影响尚未完成演示验证。

#### 后续建议
待 Program 主链路修复后，再重新验证：

- active constraints 是否真实影响 planned session 生成
- `constraint_snapshot` 是否可被页面感知

---

## 5. 易用性评估

### 5.1 总体判断
易用性目前一般。

### 5.2 具体感受
- 单个面板逻辑相对清晰，可以独立完成
- 但从 Program 到 Execution 的闭环较难完成
- 当前用户不容易理解完整行为链
- 这可能与产品尚未完全设计完有关
- 当前更需要“指引”与“流程提示”

### 5.3 当前判断
系统更适合“模块演示”，暂时还不够适合“无引导地完成完整主链路操作”。

---

## 6. 概念清晰度评估

### 6.1 当前问题
当前概念清晰度还不足以单独判断，因为页面主要使用英文术语，影响了测试结果。

### 6.2 当前结论
下一轮若继续做内部演示，应优先补充：

- 关键概念中文化
- 或中英对照
- 至少覆盖：
  - Program
  - SessionTemplate
  - TrainingUnitTemplate
  - PlannedSession
  - Execution
  - Observation
  - Evidence
  - Constraint
  - Injury

---

## 7. 当前产品力判断

### 7.1 总体判断
产品力不错，已经明显具备“产品雏形”。

### 7.2 当前最有价值的模块
当前最有价值的是：

- Program 模块

### 7.3 当前最不顺手的模块
当前最不顺手的也是：

- Program 模块

原因不是它没有价值，而是它当前正好承担最重要的主链路，但又有生成与理解上的阻塞。

---

## 8. 演示 checklist 结果回填

### 8.1 结果
- [ ] 主链路能走通
- [x] Observation 能录能查
- [x] Evidence 能上传并走状态流转
- [x] Constraint / Injury 能录能查并进入最小闭环
- [x] 页面之间能顺利跳转
- [x] 演示过程中没有出现结构性断链

### 8.2 解释
当前系统已经不是“不能演示”，而是：

- 大部分模块可演示
- 但最核心的主链路还没有顺畅完成

因此当前更准确的阶段判断是：

> 可演示的内部 alpha，但主链路仍需优先修复与优化。

---

## 9. 下一轮优先级建议

### 9.1 第一优先级
优先优化 Program / Planned Sessions / Execution 主链路，具体包括：

- 查清 `No enabled session templates found under this program` 的根因
- 修复主链路阻塞
- 让 Planned Sessions 可稳定生成
- 让 Execution 演示真正可走通

### 9.2 第二优先级
补最小指引与术语解释，包括：

- 首页操作顺序提示
- Program 页面中模板层级说明
- Observation 中 fatigue score 的解释
- Evidence 中 parse 状态的中文化或提示说明

### 9.3 第三优先级
修复 Evidence 列表中的错误与按钮消失问题。

---

## 10. 当前结论

第一次内部演示的核心结论不是“系统不行”，而是：

- 系统已经具备可演示的产品雏形
- 多个独立闭环已成立
- 当前最主要的问题集中在主链路可用性与术语理解成本上
- 下一轮应优先修复 Program 主链路并提升基础引导，而不是继续扩展新能力

## 11. 第一次内部演示后的修复回访（Round 12）

### 11.1 本轮修复目标
本轮优先处理第一次内部演示中最关键的阻塞点：

- Program 主链路无法顺畅走通
- 用户容易误选不可生成的 Program
- 首页缺少推荐操作顺序
- Program 页面中的模板层级不够容易理解
- 主链路页面缺少最小 loading / 提示

### 11.2 根因确认
已确认第一次内部演示中 `No enabled session templates found under this program` 的主要根因不是 Demo Program 本身损坏，而是：

- 最近创建的多个 `Round4 Minimal Program ...` 排在 Program 列表最上方
- 这些 Program 没有 block / session template 结构
- 演示时非常容易被误点
- 误点后进入 planned sessions 页面，自然无法生成

### 11.3 本轮修复结果
本轮已完成以下修复：

- Program 列表增加 `planning_ready` 就绪信息
- 首页增加“推荐演示顺序”与 Demo Program 快捷入口
- Planned Sessions 页面在前端先做就绪校验
- 对不可生成的 Program 给出明确提示并禁用生成按钮
- Program 详情页增加：
  - `SessionTemplate / 课程模板`
  - `TrainingUnitTemplate / 训练单元模板`
  的中英提示
- 增加 Program / Detail / Planned Sessions 页的最小 loading 反馈
- seed 中强制回收 demo 模板为 enabled

### 11.4 当前结论
这意味着第一次内部演示中最关键的 Program 主链路阻塞已经被针对性修复。  
下一次内部演示时，应优先复验：

1. 首页从 Demo Program 开始是否足够清楚  
2. Planned Sessions 是否能稳定生成  
3. Program -> Planned Sessions -> Execution 是否已真正更容易走通  

### 11.5 下一轮建议
下一轮可优先处理第一次内部演示中的另一个明显问题：

- Evidence 页初始列表错误
- reject 后交互按钮消失

## 12. Evidence 页面问题修复回访（Round 13）

### 12.1 本轮修复目标
本轮只针对第一次内部演示中 Evidence 页的两个明显问题做最小修复：

1. 页面初始列表区出现 `Internal server error`
2. 对第一张卡片执行 reject 后，整块交互看起来都消失

### 12.2 根因确认
本轮确认两个问题的根因分别为：

#### A. 初始列表错误
- `/api/evidence` 列表请求在数据库瞬时连通异常时，会被后端泛化成 `Internal server error`
- 前端只能看到泛化错误，无法给出更可恢复的提示

#### B. reject 后按钮“全消失”
- 前端旧逻辑在列表刷新失败时，会整块隐藏列表
- 因此用户会误以为“所有按钮都消失了”
- 同时，终态卡片本来就没有可执行按钮，但页面缺少清晰说明，也放大了误判

### 12.3 本轮修复结果
本轮已完成以下修复：

- Evidence GET 路由对数据库瞬时连通问题返回更可读的 503 提示
- 前端列表加载增加最小重试
- 刷新失败时不再整块清空已显示列表
- 动作成功但刷新失败时给出明确提示
- 对 confirmed / rejected 终态卡片显示“当前无可执行动作”说明

### 12.4 当前结论
这意味着 Evidence 页已经从“容易因瞬时异常而看起来整体坏掉”，提升为：

- 出错时有可读提示
- 列表更稳定
- reject 后不会再因为刷新失败而让整个交互区看起来消失
- 终态行为更容易理解

### 12.5 下一步建议
在第二次内部演示前，应优先再手工复验一次 Evidence 路径：

1. 上传
2. mock parse
3. reject
4. 确认页面仍保留列表与状态说明

如果这一步稳定，则 Evidence 模块可以视为已达到“内部演示可接受”状态。