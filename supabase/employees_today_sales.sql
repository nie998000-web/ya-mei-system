-- DEPRECATED
-- DO NOT USE
-- replaced by schema_final.sql

alter table public.employees
  add column if not exists today_sales numeric default 0;
