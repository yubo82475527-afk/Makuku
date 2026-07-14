# Makuku 1.0 价格智能架构

## 文档状态

本文记录 Makuku 1.0 已冻结的价格智能范围和架构职责。新增设计不得突破这些边界，除非用户明确重新评审并开放范围。

本文描述目标架构和职责边界，不表示所有对象都已经完成实现。实施状态应以当前代码、迁移和测试为准。

## 范围

Makuku 1.0 只建设价格智能能力。

范围外能力包括：

- 铺货、陈列、货架、OSA、缺货和可见度分析
- 其他非价格终端智能
- 多 Agent 编排和自动执行
- 复杂规则引擎
- 动作目录表和预算池表

产品名称为 `Market Intelligence Agent`，1.0 只启用 `Pricing Expert`。`Promotion Expert` 和 `Competitor Expert` 属于后续阶段。

## 冻结分层

| 层级 | 职责 | 1.0 对象 |
| --- | --- | --- |
| L1 原始事实 | 保存可追溯的市场和执行事实 | `price_snapshots`、`promo_events`、`offline_store_visits` |
| L2 业务聚合 | 形成数据质量、价格分析和执行跟踪所需的稳定上下文 | `price_quality_benchmark_daily`、`market_benchmark_period_prices`、`store_price_status_daily`、`promoter_execution_weekly`、`pricing_context_daily` |
| L3 治理 | 管理价格政策边界并生成标准市场信号 | `pricing_policy_guardrails`、`market_signals` |
| L4 智能 | 形成异常、建议和日常经营摘要 | `alerts`、`pricing_recommendations`、`market_daily_brief` |
| L5 Agent | 基于事实和治理结果支持经营决策 | `Market Intelligence Agent`，仅启用 `Pricing Expert` |

## 核心表职责

### `market_benchmark_period_prices`

承载既定周期和规则下的市场价格基准，并继续作为顶部价格指数的基础。1.0 不创建 `market_price_index_weekly`，避免重复口径和重复存储。

### `price_quality_benchmark_daily`（已实现）

这是 AI 价格候选质量门禁使用的 T+1 日基准，不是市场机会指数，也不替代 `market_benchmark_period_prices`。粒度固定为“基准日期 + 标准商品/SKU + 来源渠道”，1.0 不引入城市维度。

基准只使用已经进入 `price_snapshots` 的确认事实，窗口为 Jakarta 日期 D-30 到 D-1；同一门店、商品、渠道和日期只保留最新一条。每天刷新一次，门禁任务只 Lookup 当天已经生成的基准，不在 Visit 解析或门禁任务中扫描历史、也不实时计算中位数。

`price_quality_benchmark_refresh_runs` 记录每天基准刷新已完整提交。候选 worker 只有看到当天 `COMPLETED` 标记后才领取任务，因此午夜到定时刷新之间候选保持待处理，不会被误判为“历史样本不足”。

### `ai_price_candidates`（已实现的治理工作区）

`ai_price_candidates` 保存 Vision 证据判断、quality gate 状态、原因码、使用的基准和人工审核轨迹。它是价格进入事实层之前的治理工作区，不是确认事实表。

Vision 和 Visit 分析完成后先生成候选并结束主流程；Visit 不等待历史价格校验。独立后台任务领取候选、读取 T+1 基准并写回质量结果。证据、商品归属和包装数学等硬性事实通过后，成熟基准执行历史偏差校验；没有成熟基准的普通价格以 `BUILDING` 状态进入冷启动自动批准，促销和其他风险候选保留给单条人工审核。

`benchmark_assessment` 独立记录 `READY`、`BUILDING` 或 `NOT_EVALUATED`。`BUILDING` 原因区分无历史、低样本、低门店和两者均不足，不能再作为异常原因进入运营队列。

候选包含由商品、金额、片数和促销输入生成的指纹。历史校验保存当时的输入指纹；批准时数据库锁定候选并再次核对指纹，在同一事务内生成或复用 `price_snapshots` 并完成候选状态迁移。批量修正必须先保存并重新校验，不能在批准动作里替换金额。

自动批准使用独立的有界租约队列，最多尝试三次。失败或 worker 崩溃不会长期占用 `PROCESSING`；耗尽重试后回到单条人工处理，也不会阻塞后续候选。

`price_quality_gate_evaluations` 以追加方式保存每次门禁尝试的领取指纹、基准、结论、原因、worker 和版本。候选表保留最新状态用于排队，审计表保留历史，不因重新校验而覆盖。

数据库权限边界固定为：`anon` 和 `authenticated` 只能读取获准数据，不能直接写 `ai_price_candidates`、`price_snapshots` 或门禁审计表。批准、拒绝和事实生成必须通过 service-role 服务与带行锁的 RPC。已经批准的 H5 价格事实不可原地修改或删除；后续纠错必须产生新的待校验候选或专门的更正流程。

### `price_snapshots`（已实现）

`price_snapshots` 继续只保存已经确认的 L1 价格事实。T+1 样本数、偏差率、门禁状态和失败重试等过程字段不得写入该表。只保留来源属性 `benchmark_assessment_at_approval`，说明该事实在审批时使用了成熟基准、处于基准建设期或未执行基准评估；它不是当前实时基准状态。

### `pricing_context_daily`

一行表示一个城市-渠道-SKU 的每日价格上下文，服务于价格分析、预警和 `Pricing Expert`。

必须包含以下质量和版本字段：

- `context_version`
- `store_count`
- `valid_store_count`
- `sample_status`

该表不得吸收门店级异常跟踪或人员执行管理。

### `store_price_status_daily`

一行表示一个门店-SKU-日期的价格状态或异常，专门负责门店级价格例外的识别和追踪。

### `promoter_execution_weekly`

负责价格相关执行动作的周度跟踪，不承担城市-渠道-SKU 的价格上下文计算，也不替代门店价格状态表。

### `pricing_recommendations`

记录价格智能建议及其决策范围，必须包含：

- `decision_type`
- `recommendation_scope`

建议必须能够关联输入依据、适用对象和后续经营动作，不能只保存一段无法执行的文字。

## 指标边界

`coverage` 只作为内部结论可信度控制，不作为老板或区域负责人首页的核心经营指标。管理者页面应优先展示价格机会、风险、影响范围和待采取动作。

## 数据流

1. Vision/Visit 解析生成 `ai_price_candidates`，主解析链路不等待历史校验。
2. L2 每天用 D-30 到 D-1 的已确认事实刷新 `price_quality_benchmark_daily`。
3. 独立 quality gate worker 异步校验候选；硬性事实通过的 `BUILDING` 普通价格和成熟基准校验通过的价格，经审批服务生成 `price_snapshots` 确认事实。
4. 审批时为 `BUILDING` 的确认快照继续参与下一次 T+1 基准刷新，达到 5 条有效记录和 3 家门店后形成 `READY` 基准。
5. L2 再按明确粒度形成市场基准、门店异常、执行跟踪和每日价格上下文。
6. L3 应用政策护栏并生成可解释的市场信号。
7. L4 形成预警、价格建议和每日摘要。
8. `Pricing Expert` 基于上述结果帮助管理者判断并推动经营动作。

当前阶段只实现后台质量门禁。运营审核页的极简化改造属于后续阶段，不应把尚未落地的页面设计描述成当前能力。

## 部署与恢复顺序

1. 在现有 Phase 1、Phase 2 和证据原因迁移之后执行 `202607140002_price_quality_cold_start_v2.sql`，再部署 V2 应用代码；迁移保留 V1 finalize RPC 重载，避免滚动发布期间旧 worker 中断。
2. V2 应用启动后执行 `select public.requeue_ai_price_candidates_for_cold_start_v2();`，只把具备完整新版证据的旧基准不足候选重置为待评估，不直接批准或生成快照。
3. 执行 `node scripts/refresh-price-quality-benchmarks.mjs`，确认当天 refresh run 为 `COMPLETED`。
4. 执行 `node scripts/run-price-quality-gate.mjs --repeat=10` 回填待处理候选。
5. 用真实 `anon`/`authenticated` 角色验证不能直接修改候选或价格事实，并用两个数据库会话验证“输入变更与 finalize”“拒绝与批准”的竞争只允许一方成功。
6. 检查待处理候选的质量状态、过期租约、自动批准耗尽数、`price_quality_gate_evaluations` 审计记录和非 `PASSED` 的自动决策。
7. 紧急回滚应用前先停用价格质量 cron，并把仍待处理的候选恢复为 `NOT_REQUIRED`/原证据决策；保留新增表和审计字段，后续优先向前修复。

## 架构评审红线

- 不得新增 `market_price_index_weekly`
- 不得把非价格智能纳入 1.0
- 不得让 `pricing_context_daily` 承担门店异常或人员执行职责
- 不得提前建设多 Agent、自动执行、复杂规则引擎、动作目录或预算池
- 不得把内部数据质量指标包装为管理者经营成果

任何突破以上红线的需求，都应先说明业务价值、版本必要性、对现有职责的影响和新的验收标准，再进行架构评审。
