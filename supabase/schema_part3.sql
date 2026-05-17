-- DEPRECATED
-- DO NOT USE
-- replaced by schema_final.sql

-- 雅美靓颜 Supabase schema part3
-- 执行顺序：part1 -> part2 -> part3
-- 本段：更新时间触发器、RLS 权限策略、账号资料示例

-- 更新时间触发器函数
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_staff_updated_at on public.staff;
create trigger set_staff_updated_at
before update on public.staff
for each row execute function public.set_updated_at();

drop trigger if exists set_employees_updated_at on public.employees;
create trigger set_employees_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

drop trigger if exists set_followups_updated_at on public.followups;
create trigger set_followups_updated_at
before update on public.followups
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_reviews_updated_at on public.daily_reviews;
create trigger set_daily_reviews_updated_at
before update on public.daily_reviews
for each row execute function public.set_updated_at();

-- RLS：当前版本先保证登录用户可读写，避免页面读取和保存失败。
alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.staff enable row level security;
alter table public.employees enable row level security;
alter table public.followups enable row level security;
alter table public.daily_reviews enable row level security;

drop policy if exists "stores_authenticated_all" on public.stores;
create policy "stores_authenticated_all"
on public.stores for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "profiles_authenticated_all" on public.profiles;
create policy "profiles_authenticated_all"
on public.profiles for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "customers_authenticated_all" on public.customers;
create policy "customers_authenticated_all"
on public.customers for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "staff_authenticated_all" on public.staff;
create policy "staff_authenticated_all"
on public.staff for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "employees_authenticated_all" on public.employees;
create policy "employees_authenticated_all"
on public.employees for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "followups_authenticated_all" on public.followups;
create policy "followups_authenticated_all"
on public.followups for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "daily_reviews_authenticated_all" on public.daily_reviews;
create policy "daily_reviews_authenticated_all"
on public.daily_reviews for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- 建议的账号资料示例
-- 创建 Supabase Auth 用户后，把 auth.users.id 填入 user_id：
-- insert into public.profiles (user_id, name, role, store)
-- values ('这里填写 auth.users.id', '王总', '老板', 'all');
-- insert into public.profiles (user_id, name, role, store)
-- values ('这里填写 auth.users.id', '龙泉1店店长', '店长', '龙泉1店');
-- insert into public.profiles (user_id, name, role, store)
-- values ('这里填写 auth.users.id', '林娜', '美容师', '龙泉1店');
