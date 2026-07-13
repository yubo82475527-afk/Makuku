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

基准只使用已经进入 `price_snapshots` 的确认事实，窗口为 Jakarta 日期 D-30 到 D-1；同一门店、商品、渠道和日期只保留最新一条。每天刷新一次，门禁任务只读取当天已经生成的基准，不在 Visit 解析过程中扫描 30 天历史。

### `ai_price_candidates`（已实现的治理工作区）

`ai_price_candidates` 保存 Vision 证据判断、quality gate 状态、原因码、使用的基准和人工审核轨迹。它是价格进入事实层之前的治理工作区，不是确认事实表。

Vision 和 Visit 分析完成后先生成候选并结束主流程；Visit 不等待历史价格校验。独立后台任务领取候选、读取 T+1 基准并写回质量结果。只有证据判断和历史校验都通过的候选可以自动批准，风险候选保留给单条人工审核。

### `price_snapshots`（已实现）

`price_snapshots` 继续只保存已经确认的 L1 价格事实。T+1 样本数、偏差率、门禁状态和失败重试等过程字段不得写入该表。

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
3. 独立 quality gate worker 异步校验候选；通过审批服务后才生成 `price_snapshots` 确认事实。
4. L2 再按明确粒度形成市场基准、门店异常、执行跟踪和每日价格上下文。
5. L3 应用政策护栏并生成可解释的市场信号。
6. L4 形成预警、价格建议和每日摘要。
7. `Pricing Expert` 基于上述结果帮助管理者判断并推动经营动作。

当前阶段只实现后台质量门禁。运营审核页的极简化改造属于后续阶段，不应把尚未落地的页面设计描述成当前能力。

## 架构评审红线

- 不得新增 `market_price_index_weekly`
- 不得把非价格智能纳入 1.0
- 不得让 `pricing_context_daily` 承担门店异常或人员执行职责
- 不得提前建设多 Agent、自动执行、复杂规则引擎、动作目录或预算池
- 不得把内部数据质量指标包装为管理者经营成果

任何突破以上红线的需求，都应先说明业务价值、版本必要性、对现有职责的影响和新的验收标准，再进行架构评审。
