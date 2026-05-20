-- 雅美靓颜 customers.store_id 统一修复
-- 可直接在 Supabase SQL Editor 执行。
-- 目标：customers.store_id 使用 stores.id(uuid) 作为门店关联字段。

begin;

-- 1. 确保 stores 表存在，并包含固定 4 家门店。
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

-- 2. 确保 customers 表存在，并补齐 store_id / store 字段。
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  store_id uuid references public.stores(id),
  store text,
  created_at timestamptz default now()
);

alter table public.customers
  add column if not exists store_id uuid references public.stores(id),
  add column if not exists store text;

-- 3. 用旧门店名称字段回填 store_id。
--    兼容 store / store_name / branch_id / shop_id / current_store_id 等旧字段。
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'store'
  ) then
    update public.customers c
    set store_id = s.id,
        store = s.name
    from public.stores s
    where c.store_id is null
      and c.store is not null
      and s.name = c.store;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'store_name'
  ) then
    execute $sql$
      update public.customers c
      set store_id = s.id,
          store = s.name
      from public.stores s
      where c.store_id is null
        and c.store_name is not null
        and s.name = c.store_name
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'branch'
  ) then
    execute $sql$
      update public.customers c
      set store_id = s.id,
          store = s.name
      from public.stores s
      where c.store_id is null
        and c.branch is not null
        and s.name = c.branch
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'shop_name'
  ) then
    execute $sql$
      update public.customers c
      set store_id = s.id,
          store = s.name
      from public.stores s
      where c.store_id is null
        and c.shop_name is not null
        and s.name = c.shop_name
    $sql$;
  end if;
end $$;

-- 4. 对仍为空的历史顾客，临时归到龙泉1店，避免开单无法选择。
update public.customers c
set store_id = s.id,
    store = s.name
from public.stores s
where c.store_id is null
  and s.name = '龙泉1店';

-- 5. 索引。
create index if not exists idx_customers_store_id on public.customers (store_id);
create index if not exists idx_customers_store on public.customers (store);
create index if not exists idx_customers_phone_lookup on public.customers (phone);

commit;
