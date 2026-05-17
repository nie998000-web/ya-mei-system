# 开发规则

## 数据库优先

- 所有新增字段必须先写入 `supabase/schema_final.sql`。
- 所有页面字段必须与 `supabase/schema_final.sql` 保持一致。
- 不允许新增兼容字段。
- 不允许再为了兼容旧数据读取旧字段。
- SQL 迁移完成后必须检查前端查询字段是否同步更新。

## 禁止使用的旧字段

以下字段已经废弃，不允许在新代码中继续使用：

- `beautician`
- `today_revenue`
- `recent_visit`
- `staff_name`
- `employee_name`
- `owner_name`
- `responsible_staff`
- `todaySales`
- `today_amount`
- `today_visits`
- `store_id`

## 字段命名规范

- 顾客负责人只使用 `owner`。
- 门店只使用 `store`。
- 最后到店日期只使用 `last_visit`。
- 页面表单里的员工今日业绩字段可以命名为 `today_sales`，保存时必须写入 `employee_daily_stats.sales`。
- 页面表单里的员工今日到店字段可以命名为 `today_arrivals`，保存时必须写入 `employee_daily_stats.arrivals`。
- 角色只使用 `role`。
- 今日看板统计必须使用 `employee_daily_stats` 的当天记录，不允许使用 `employees.today_sales` 等覆盖字段作为今日统计来源。

## 角色规范

`role` 只允许以下值：

- `boss`
- `manager`
- `beautician`

页面可以显示中文角色名称，但数据库只保存英文枚举。

## 门店规范

固定门店只允许：

- 龙泉1店
- 龙泉2店
- 龙泉金龙店
- 郫县1店

所有门店选项必须来自固定门店列表，不允许页面自己手写临时门店。

## 查询规范

- 不允许使用 `select('*')`。
- 每个表查询必须显式列出字段。
- 查询字段必须和 `schema_final.sql` 一致。
- 页面不允许 fallback 到旧字段。

## 页面开发规范

- 不允许页面直接写魔法字符串；角色、门店、状态等选项必须从统一常量或配置读取。
- 不允许保留临时调试 UI。
- 不允许保留 `console.log`。
- 可以保留 `console.error`，用于 Supabase 错误排查。
- 保存失败必须把 Supabase `error.message` 显示给用户。
- 新增、编辑、删除成功后必须重新读取云端数据或更新对应 state。

## 当前稳定口径

- 员工基础资料保存在 `employees`。
- 员工每日数据保存在 `employee_daily_stats`。
- 员工管理页面显示今天的数据时，必须读取当前日期的 `employee_daily_stats`。
- 如果当天没有员工每日记录，页面显示 0。
- 不在当前阶段新增小程序、总部大屏、复杂报表或额外兼容层。
