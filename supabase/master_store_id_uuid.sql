-- 雅美靓颜主数据 store_id 统一修复
-- 可直接在 Supabase SQL Editor 执行。
-- 目标：stores / customers / employees / cashier_orders 统一使用 uuid 类型 store_id。

begin;

create extension if not exists pgcrypto;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz default now()
);

alter table public.stores
  add column if not exists name text,
  add column if not exists created_at timestamptz default now();

create unique index if not exists idx_stores_name_unique on public.stores (name);

insert into public.stores (name)
values
  ('龙泉1店'),
  ('龙泉2店'),
  ('龙泉金龙店'),
  ('郫县1店')
on conflict (name) do nothing;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  store_id uuid references public.stores(id),
  store text,
  created_at timestamptz default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  store_id uuid references public.stores(id),
  store text,
  role text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.cashier_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text,
  date date,
  month text,
  store_id uuid references public.stores(id),
  store_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.customers
  add column if not exists store_id uuid references public.stores(id),
  add column if not exists store text;

alter table public.employees
  add column if not exists store_id uuid references public.stores(id),
  add column if not exists store text;

alter table public.cashier_orders
  add column if not exists store_id uuid references public.stores(id),
  add column if not exists store_name text;

update public.customers c
set store_id = s.id,
    store = s.name
from public.stores s
where (c.store_id is null or c.store_id is distinct from s.id)
  and c.store = s.name;

update public.employees e
set store_id = s.id,
    store = s.name
from public.stores s
where (e.store_id is null or e.store_id is distinct from s.id)
  and e.store = s.name;

update public.cashier_orders o
set store_id = s.id,
    store_name = s.name
from public.stores s
where (o.store_id is null or o.store_id is distinct from s.id)
  and o.store_name = s.name;

-- 旧数据没有门店时，临时归到龙泉1店，避免页面无法筛选。
update public.customers c
set store_id = s.id,
    store = s.name
from public.stores s
where c.store_id is null
  and s.name = '龙泉1店';

update public.employees e
set store_id = s.id,
    store = s.name
from public.stores s
where e.store_id is null
  and s.name = '龙泉1店';

update public.cashier_orders o
set store_id = s.id,
    store_name = s.name
from public.stores s
where o.store_id is null
  and s.name = '龙泉1店';

create index if not exists idx_customers_store_id on public.customers (store_id);
create index if not exists idx_employees_store_id on public.employees (store_id);
create index if not exists idx_cashier_orders_store_id on public.cashier_orders (store_id);

commit;
