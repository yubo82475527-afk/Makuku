# 运营极简价格异常审核页设计

## 1. 目标

第二阶段为价格质量门禁提供可业务验收的运营入口。页面只帮助运营完成三件事：识别哪个价格需要处理、理解异常原因、依据来源图片作出人工决定。

现有“照片价格复核”菜单和 `/{locale}/offline-price-candidates` URL 直接替换为极简运营审核页，不新增并行运营页面。第一阶段的 Visit 解析、T+1 基准、质量门禁 worker、候选治理表和 Price Snapshot 事实边界保持不变。

## 2. 使用角色与业务动作

使用角色是后台运营审核人员。

运营可以执行：

1. 确认 AI 当前价格正确。
2. 修正包装价、片数后直接通过。
3. 判定候选错误。
4. 仅在商品归属不确定时修正商品关联。
5. 跳转完整 Visit 详情查看巡店上下文。

审核页不承担算法调试、基准配置、批量放行高风险价格或完整 Visit 浏览职责。

## 3. SKU 关联口径

Price Snapshot 必须关联一个明确 SKU，合法口径为：

- Makuku 自有商品关联 `material_master / sku_master`，Price Snapshot 写入 `sku_master_id` 和 `material_sku_code`。
- 竞品商品关联 `competitor_products`，Price Snapshot 写入 `competitor_product_id`。
- `matched_entity_type = unmatched` 或 `matched_entity_id` 为空时，不得确认正确、修正后通过或生成 Price Snapshot。

竞品关联到 `competitor_products` 即视为已关联竞品 SKU，不要求竞品写入自有品牌使用的 `sku_master_id`。

## 4. 页面替换策略

推荐采用增量替换，不在现有约 1800 行的 `ai-price-candidates-workbench.tsx` 中继续叠加分支。

- 新建运营专用 View Model 和页面组件。
- `offline-price-candidates/page.tsx` 改为渲染新运营组件。
- 旧技术工作台不再被运营路由引用，但保留一个验收周期用于快速回滚。
- 验收稳定后单独删除旧工作台和不再使用的前端批量审核代码。
- 已有技术数据仍保存在数据库和审计表中，技术人员通过数据库、调试能力或导出查看。

这是一条有明确结束条件的迁移路径，不形成长期平行架构。

## 5. 运营队列范围

页面只提供两个状态：

- `待处理`：候选仍为 `pending`，且质量门禁已经形成需要人工处理的终态。
- `已处理`：候选由人工确认、人工修正或人工拒绝完成。

待处理列表包含：

- `quality_gate_status = REVIEW_REQUIRED`
- `quality_gate_status = INSUFFICIENT_BENCHMARK`
- 达到最大重试次数的终态 `FAILED`

待处理列表排除：

- `PENDING` 和 `PROCESSING`
- 等待自动重试的 `FAILED`
- `PASSED` 和自动通过数据
- `NOT_REQUIRED`
- 非 SKU 候选
- 已删除、已替换或重新分析失效的候选

已处理列表只展示人工处理记录，不把 `review_method = auto_rule` 的自动通过记录带入运营主流程。

## 6. 服务端运营 View Model

新增独立领域模块，将数据库记录转换为运营端最小模型。组件不得直接解释质量原因码、置信度、样本数或 Supabase 联表结构。

列表 View Model 只包含：

- `id`
- `state: pending | processed`
- `source_thumbnail_url | null`
- `source_image_available`
- `product_name`
- `sku_label`
- `ai_package_price`
- `ai_piece_count`
- `ai_price_per_piece`
- `operator_reason`
- `requires_product_correction`
- `processed_decision | null`
- `processed_at | null`

详情 View Model 只包含：

- 列表所需字段
- `source_image_id | null`
- `source_image_url | null`
- `evidence_product_text`
- `evidence_package_price`
- `evidence_piece_count`
- `evidence_price_per_piece`
- `historical_common_price_per_piece | null`
- `current_match_type`
- `current_match_id`
- `current_match_label`
- `visit_detail_href`

接口不得返回 AI confidence、match score、benchmark sample count、benchmark store count、原始 JSON、warnings 数组、conflicts 数组或全部 Visit 图片。

## 7. 口语化异常原因

服务端使用固定优先级生成一个主要 `operator_reason`，避免组件拼装技术字段。

优先级从高到低：

1. 商品无法确认：无法确认价格属于哪款商品。
2. 价格证据不清晰：价格牌模糊、遮挡或商品与价格绑定不可靠。
3. 包装数学冲突：包装价、片数与单片价不能互相换算。
4. 10/100/1000 倍疑似错误：可能多识别或少识别了 0。
5. 超过 50% 的严重历史偏差。
6. 超过 30% 的历史偏差。
7. 促销归属需要确认。
8. 历史样本不足。
9. 门禁重试耗尽，需要人工判断。

历史偏差文案示例：

> 这款商品过去通常约 Rp 2,140/片，本次识别为 Rp 2,865/片，高出约 34%。

样本数、门店数、算法版本和内部原因码不进入运营文案。

## 8. 来源图片边界

详情接口只按 `source_image_id` 查询 `offline_visit_images`。如果没有 ID，才使用已经归属于该候选的 `source_image_path`，并验证路径属于候选 Visit。

- 不加载同一 Visit 的其他图片。
- 不返回被认为“相似”的替代图片。
- 图片缺失、已删除或存储签名失败时，显示“原始证据不可用”。
- Visit 详情入口始终保留，用于查看其他照片、门店和巡店记录。

## 9. 列表设计

列表只展示：

1. 来源图片缩略图。
2. 商品名称 / SKU。
3. AI 识别价格。
4. 口语化异常原因。
5. “查看并处理”按钮。

列表不展示选择框、批量批准、AI 置信度、商品匹配分数、样本数、门店数、风险代码、异常数量、Evidence Status、Review Decision、技术状态或 JSON。

页面保留必要的日期和巡店批次筛选，但不保留算法筛选器。窄屏使用卡片式行布局，不要求横向滚动查看技术列。

## 10. 极简详情抽屉

抽屉顺序固定为：

1. 标题：“这个价格需要确认”。
2. 一段口语化异常原因。
3. 唯一来源图片。
4. 图片证据摘要：商品、包装价、片数、单片价；历史偏差类补充历史常见单片价。
5. 操作区。
6. “查看完整 Visit 详情 →”。

默认操作：

- `确认价格正确`
- `修正后通过`
- `判定为错误`

只有 `requires_product_correction = true` 时展示“修正商品”。正常候选不加载 SKU 搜索器。

点击“修正后通过”后才展开包装价和片数输入框，并实时显示修正后的单片价。

## 11. 写操作与事务边界

### 确认价格正确

服务端锁定候选，确认候选仍为待处理、当前输入指纹未变化且已关联合法 SKU，然后调用现有原子审批流程生成或复用 Price Snapshot。

### 修正后通过

运营人工确认是最终质量决定，不再等待历史门禁重新排队。

一次数据库事务必须完成：

1. 锁定仍为 `pending` 的候选。
2. 校验商品关联合法。
3. 校验包装价和片数均为正数。
4. 计算最终单片价。
5. 保留不可变 AI 原始字段。
6. 将人工修正值写入候选最终字段。
7. 生成或复用关联正确 SKU、Visit、门店和来源图片的 Price Snapshot。
8. 写入审核人、审核时间和人工修正审计信息。
9. 将候选置为 `approved`。

任何一步失败必须整体回滚。重复提交必须复用同一事实或返回已处理冲突，不能生成重复快照。

### 判定为错误

继续使用带行锁的原子拒绝 RPC。批准和拒绝并发时只允许一个事务成功。

### 商品修正

商品修正只允许待处理候选。修正商品后仍停留在抽屉，由运营继续执行“确认价格正确”或“修正后通过”。服务端最终生成快照前再次校验商品关联。

## 12. 错误处理

- 候选已被其他人处理：返回 409，关闭或刷新抽屉并更新列表。
- 原始证据缺失：允许运营查看原因，但明确显示证据不可用；是否通过仍需人工主动操作。
- SKU 未关联：禁用通过操作并引导“修正商品”。
- 金额或片数非法：在输入区就地提示，不提交请求。
- 提交中：禁用全部处理按钮，防止重复提交。
- 提交失败：保留输入值并显示口语化错误，不自动关闭抽屉。

## 13. 权限

- 页面和接口继续要求后台管理员会话。
- 前端可见性不是权限边界；服务端和数据库 RPC 必须重复校验候选状态、SKU 关联和操作合法性。
- `anon` 和 `authenticated` 不能直接修改候选或 Price Snapshot。

## 14. 测试与验收

必须覆盖：

1. 待处理列表只包含真正需要人工处理的候选。
2. 自动通过、门禁处理中和等待重试的数据不出现。
3. 原因码按优先级映射为正确的中英文口语文案。
4. 列表和详情 View Model 不包含技术字段。
5. 详情只查询和返回来源图片。
6. 来源图片缺失时显示明确状态。
7. Makuku 与竞品 SKU 关联都可生成正确归属的 Price Snapshot。
8. `unmatched` 不能通过。
9. 确认正确、修正后通过和判定错误均保留审计记录。
10. 修正后通过在同一事务内写入最终候选和 Price Snapshot。
11. 并发重复提交、批准与拒绝竞争不会产生重复或矛盾事实。
12. 商品修正入口只在商品不确定时出现。
13. Visit 详情入口始终存在且跳转正确。
14. 中文、英文、加载、空数据、提交失败和窄屏布局可用。
15. 页面不展示置信度、样本数、技术状态和原始 JSON。

## 15. 非目标

- 不建设算法调试页面。
- 不建设新的运营队列表或复杂规则引擎。
- 不允许高风险价格批量通过。
- 不在审核页展示完整 Visit 图片和巡店信息。
- 不修改历史基准计算、Visit 解析性能边界或市场分析职责。
