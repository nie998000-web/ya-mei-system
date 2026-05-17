# 雅美靓颜门店管理系统架构说明

## 当前页面结构

- 今日看板：查看当天跟进、未到店风险、今日到店、今日成交、门店业绩排行和美容师复盘。
- 未到店激活：按 30 天、60 天、90 天未到店顾客分组，处理顾客跟进状态。
- 顾客档案：维护顾客姓名、手机号、门店、负责人、等级、最后到店日期等核心信息。
- 跟进记录：登记顾客沟通内容、反馈、预约、成交和下次跟进时间。
- 每日复盘：记录门店每日转化率、成交金额、未完成原因和明日动作。
- 员工管理：维护员工所属门店、角色、今日跟进、预约、到店、成交和业绩数据。

## 数据流

- 登录后通过 Supabase Auth 获取当前用户 session。
- `useCloudData` 读取 `profiles`，确定当前账号角色和门店。
- 根据角色读取对应范围内的 `customers`、`employees`、`employee_daily_stats`、`followups`、`daily_reviews`、`stores`。
- 员工基础资料来自 `employees`，当天跟进、预约、到店、成交和业绩来自当天 `employee_daily_stats`，前端读取后合并显示。
- 页面新增、编辑、删除后调用对应保存方法，再重新读取云端数据。
- 所有业务数据以 Supabase 为准，前端不再使用 localStorage 保存业务数据。

## 表关系

- `profiles.user_id` 对应 Supabase Auth 用户 id，用于判断当前账号角色。
- `customers.store`、`employees.store`、`followups.store`、`daily_reviews.store` 都使用固定门店名称。
- `customers.owner` 保存负责美容师或店长姓名。
- `followups.customer_id` 对应 `customers.id`。
- `followups.customer_name`、`followups.customer_phone` 保存跟进时的顾客快照，便于表格直接展示。
- `employee_daily_stats.employee_id` 对应 `employees.id`，按 `date + employee_id` 保存员工每日数据。

## 权限逻辑

- `boss`：查看全部门店数据。
- `manager`：只查看自己 `profiles.store` 对应门店数据。
- `beautician`：只查看自己负责的顾客、跟进和员工本人数据。
- 每日复盘由 `boss` 和 `manager` 使用，`beautician` 不读取复盘列表。

## 统计来源

- 今日跟进：当前日期 `employee_daily_stats.followups` 汇总。
- 今日已邀约：当前日期 `employee_daily_stats.appointments` 汇总。
- 今日到店：当前日期 `employee_daily_stats.arrivals` 汇总。
- 今日成交：当前日期 `employee_daily_stats.sales` 汇总。
- 30 天未到店：`customers.last_visit` 距今天大于等于 30 天。
- 60 天未到店：`customers.last_visit` 距今天大于等于 60 天。
- 90 天高风险：`customers.last_visit` 距今天大于等于 90 天。
- 老客回店率：今日到店数 / 30 天未到店数。
- 4 家门店业绩对比：按 `employee_daily_stats.store` 汇总当天 `sales`。
- 美容师复盘：按当前日期员工每日数据展示跟进数、预约数和成交金额。

## 固定门店

- 龙泉1店
- 龙泉2店
- 龙泉金龙店
- 郫县1店

所有门店字段必须使用以上名称，前端统一通过固定门店列表渲染选项。

## 最终字段规范

### profiles

- `id`
- `user_id`
- `name`
- `role`
- `store`
- `created_at`

### stores

- `id`
- `name`
- `created_at`

### customers

- `id`
- `name`
- `phone`
- `store`
- `owner`
- `level`
- `last_visit`
- `follow_status`
- `last_follow_result`
- `last_follow_time`
- `next_follow_time`
- `created_at`

### employees

- `id`
- `name`
- `phone`
- `store`
- `role`
- `note`
- `today_followups`
- `today_appointments`
- `today_arrivals`
- `today_deals`
- `today_sales`
- `created_at`
- `updated_at`

`today_followups`、`today_appointments`、`today_arrivals`、`today_deals`、`today_sales` 为旧覆盖字段，当前保留但不再作为今日看板统计来源。

### employee_daily_stats

- `id`
- `date`
- `employee_id`
- `employee_name`
- `phone`
- `store`
- `role`
- `followups`
- `appointments`
- `arrivals`
- `deals`
- `sales`
- `note`
- `created_at`
- `updated_at`

### followups

- `id`
- `customer_id`
- `customer_name`
- `customer_phone`
- `store`
- `owner`
- `method`
- `content`
- `feedback`
- `issue_type`
- `has_appointment`
- `appointment_time`
- `has_deal`
- `deal_amount`
- `next_follow_time`
- `created_at`

### daily_reviews

- `id`
- `date`
- `store`
- `invite_rate`
- `appointment_rate`
- `arrival_rate`
- `deal_rate`
- `deal_amount`
- `unfinished_reason`
- `tomorrow_action`
- `created_at`

## 已废弃字段

- `store_id`
- `beautician`
- `staff_name`
- `employee_name`
- `owner_name`
- `responsible_staff`
- `recent_visit`
- `today_visits`
- `today_revenue`
- `todaySales`
- `sales`
- `today_amount`
- `position`
- `age`
- `project`
- `spend`
- `remaining`
- `status`

## 已废弃 SQL 文件

以下文件仅保留历史参考，不再执行：

- `schema.sql`
- `schema_part1.sql`
- `schema_part1a.sql`
- `schema_part1b.sql`
- `schema_part1c.sql`
- `schema_part2.sql`
- `schema_part2a.sql`
- `schema_part2b.sql`
- `schema_part2c.sql`
- `schema_part3.sql`
- `part2a_1.sql`
- `part2a_2.sql`
- `part2a_3.sql`
- `employees_store.sql`
- `employees_today_sales.sql`
- `employees_daily_fields.sql`
- `stores.sql`
- `customers_owner.sql`
- `customers_rls.sql`
- `customers_activation_fields.sql`
- `customer_follow_status.sql`
- `fix_followups_customer_id_bigint.sql`
- `unify_store_fields.sql`

当前唯一数据库结构文件是 `supabase/schema_final.sql`。
