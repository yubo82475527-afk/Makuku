# 价格异常审核原因筛选设计

## 业务目标

在“价格异常审核”列表增加完整的异常原因筛选，帮助管理者验证不同质量门禁规则实际拦截了多少候选，重点支持统计：

- 价格偏差超过 30% 且不超过 50%；
- 价格偏差超过 50%。

筛选后的列表总数必须由数据库在分页前计算，不能只过滤当前页，也不能通过匹配运营文案实现。

## 设计原则

1. 直接复用 `ai_price_candidates` 已保存的质量原因码、证据原因码和质量状态。
2. 不新增异常分类字段、数据库表、视图或迁移。
3. 不重新判断价格是否异常，不改变 Price Quality Gate、人工审核或 Price Snapshot 流程。
4. 中文和英文筛选名称只负责展示，后台查询始终使用稳定原因码。
5. 一条候选可能同时命中多个规则，因此不同筛选项的数量可能重叠，不能相加作为总异常数。

## 筛选口径

新增 URL 参数：

```text
reason=<filter-key>
```

支持以下筛选项：

| 筛选名称 | Filter Key | 数据来源 |
|---|---|---|
| 全部原因 | 空值 | 不增加原因条件 |
| 商品归属不明确 | `SKU_MATCH_UNCERTAIN` | `quality_gate_reason_codes`，并兼容未关联商品状态 |
| 商品与价格对应不明确 | `PRODUCT_PRICE_BINDING_UNCLEAR` | `price_evidence_reason_code` |
| 价格牌或金额不清晰 | `PRICE_TAG_UNCLEAR` | `price_evidence_reason_code` |
| 包装片数不清晰 | `PIECE_COUNT_UNCLEAR` | `price_evidence_reason_code` |
| 包装价格数学冲突 | `PRICE_MATH_CONFLICT` | `price_evidence_reason_code` 或 `price_evidence_status = CONFLICT` |
| 换算单片价需要确认 | `PRICE_DERIVED` | `price_evidence_reason_code` |
| 历史识别依据缺失 | `LEGACY_EVIDENCE_UNAVAILABLE` | `price_evidence_reason_code` |
| 其他图片证据不明确 | `OTHER_EVIDENCE_REVIEW_REQUIRED` | 已命中证据审核，但没有上述精准证据原因 |
| 疑似金额位数错误 | `AMOUNT_SCALE_SUSPECTED` | `quality_gate_reason_codes` |
| 价格偏差超过 50% | `PRICE_DEVIATION_CRITICAL` | `quality_gate_reason_codes` |
| 价格偏差超过 30% 且不超过 50% | `PRICE_DEVIATION_HIGH` | `quality_gate_reason_codes` |
| 促销价格需要确认 | `PROMOTION_EVIDENCE` | `quality_gate_reason_codes` |
| 历史基准不足 | `INSUFFICIENT_BENCHMARK` | 原因码或旧质量状态 |
| 系统校验失败 | `QUALITY_CHECK_FAILED` | `quality_gate_status = FAILED` 且达到人工处理阈值 |
| 其他原因 | `OTHER_REVIEW_REQUIRED` | 已进入人工审核，但没有任何已知原因信号 |

`PRICE_DEVIATION_HIGH` 和 `PRICE_DEVIATION_CRITICAL` 在门禁中互斥：

- 偏差 `>30%` 且 `<=50%` 写入 `PRICE_DEVIATION_HIGH`；
- 偏差 `>50%` 写入 `PRICE_DEVIATION_CRITICAL`。

金额位数错误、促销等原因可以与价格偏差原因同时存在。这种重叠是门禁真实命中结果，不做去重或主要原因重分类。

## 单一配置边界

新增一个集中维护的筛选定义，包含：

- 稳定的 filter key；
- 中文名称；
- 英文名称；
- 对应已有字段和原因码。

页面下拉框、参数校验和服务端查询共用该定义。不得在页面组件中根据运营文案推断原因，也不得新增一套持久化的“运营异常分类”。

现有 `buildOperatorReason` 继续负责生成列表中的口语化说明。筛选负责回答“命中了哪条后台规则”，二者职责不同：

- 筛选可以命中同一候选的多个真实规则；
- 列表仍只展示当前优先级最高、最适合运营处理的一条说明。

## 页面与导航

在现有日期、拍照批次筛选旁增加“异常原因”下拉框：

- 默认值为“全部原因”；
- 提交筛选时将页码重置为 1；
- 待处理/已处理切换保留 `reason`；
- 上一页/下一页保留 `reason`；
- 非法或未知参数按“全部原因”处理；
- 右上角“共 X 条”和分页总数均为应用原因筛选后的数据库准确数量。

筛选同时支持待处理与已处理列表。已处理候选继续使用审核时保留在候选记录上的原因码，不从 Price Snapshot 反推原因。

## 服务端与接口

`getOperatorPriceReviewsPage` 增加规范化后的原因筛选参数，并在 `.range()` 分页之前追加数据库条件。

`GET /api/operator-price-reviews` 同步接受 `reason` 参数，使用相同的规范化和查询规则。

查询不加载全部记录到应用内存中再过滤，确保候选数据增长后分页和总数仍然正确。

## 错误和兼容处理

- 未知原因参数：忽略原因条件，按全部原因查询。
- 旧数据没有精准证据原因，但具有证据审核状态：归入“其他图片证据不明确”。
- 旧数据使用 `INSUFFICIENT_BENCHMARK`：仍可通过“历史基准不足”筛选。
- 达到最大重试次数的 `FAILED`：归入“系统校验失败”。
- 已进入人工审核但没有任何已知原因信号：归入“其他原因”。

## 测试与验收

1. 页面显示完整的中英文原因筛选项。
2. `PRICE_DEVIATION_HIGH` 只返回命中 30% 至 50% 门禁原因的候选。
3. `PRICE_DEVIATION_CRITICAL` 只返回命中超过 50% 门禁原因的候选。
4. 同时命中金额位数错误和严重偏差的候选可出现在两个筛选结果中。
5. 各精准证据原因使用 `price_evidence_reason_code` 筛选。
6. 其他证据问题、系统失败、历史基准不足和其他原因具有明确兜底规则。
7. 原因筛选在分页前执行，`total` 是筛选后的数据库数量。
8. 日期、拍照批次、状态和异常原因可以组合筛选。
9. 切换状态和翻页时保留异常原因参数。
10. 非法原因参数不会报错，也不会暴露技术原因码。
11. 不新增数据库迁移，不改变门禁判定和快照生成。
