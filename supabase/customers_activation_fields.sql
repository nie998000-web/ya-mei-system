-- DEPRECATED
-- DO NOT USE
-- replaced by schema_final.sql

alter table public.customers add column if not exists follow_status text;
alter table public.customers add column if not exists last_follow_result text;
alter table public.customers add column if not exists last_follow_time date;
