-- DEPRECATED
-- DO NOT USE
-- replaced by schema_final.sql

-- 雅美靓颜 customers RLS 修复
-- 允许已登录用户 select / insert / update / delete customers。

alter table public.customers enable row level security;

drop policy if exists "customers_authenticated_all" on public.customers;

create policy "customers_authenticated_all"
on public.customers for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);
