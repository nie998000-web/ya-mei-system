-- DEPRECATED
-- DO NOT USE
-- replaced by schema_final.sql

alter table public.customers
  add column if not exists owner text;
