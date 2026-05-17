-- DEPRECATED
-- DO NOT USE
-- replaced by schema_final.sql

alter table public.employees
  add column if not exists today_followups numeric default 0,
  add column if not exists today_appointments numeric default 0,
  add column if not exists today_arrivals numeric default 0,
  add column if not exists today_deals numeric default 0,
  add column if not exists today_sales numeric default 0;
