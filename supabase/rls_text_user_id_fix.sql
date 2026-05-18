begin;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where user_id = auth.uid()::text
  limit 1
$$;

create or replace function public.current_profile_store()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select store
  from public.profiles
  where user_id = auth.uid()::text
  limit 1
$$;

create or replace function public.current_profile_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select name
  from public.profiles
  where user_id = auth.uid()::text
  limit 1
$$;

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.employees enable row level security;
alter table public.employee_daily_stats enable row level security;
alter table public.employee_performance_reports enable row level security;
alter table public.followups enable row level security;
alter table public.daily_reviews enable row level security;

drop policy if exists stores_authenticated_select on public.stores;
create policy stores_authenticated_select
on public.stores for select
to authenticated
using (true);

drop policy if exists profiles_select_scope on public.profiles;
create policy profiles_select_scope
on public.profiles for select
to authenticated
using (
  user_id = auth.uid()::text
  or public.current_profile_role() = 'boss'
);

drop policy if exists profiles_update_self_or_boss on public.profiles;
create policy profiles_update_self_or_boss
on public.profiles for update
to authenticated
using (
  user_id = auth.uid()::text
  or public.current_profile_role() = 'boss'
)
with check (
  user_id = auth.uid()::text
  or public.current_profile_role() = 'boss'
);

drop policy if exists customers_select_scope on public.customers;
create policy customers_select_scope
on public.customers for select
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and owner = public.current_profile_name())
);

drop policy if exists customers_insert_scope on public.customers;
create policy customers_insert_scope
on public.customers for insert
to authenticated
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists customers_update_scope on public.customers;
create policy customers_update_scope
on public.customers for update
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and owner = public.current_profile_name())
)
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and store = public.current_profile_store() and owner = public.current_profile_name())
);

drop policy if exists customers_delete_scope on public.customers;
create policy customers_delete_scope
on public.customers for delete
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists employees_select_scope on public.employees;
create policy employees_select_scope
on public.employees for select
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and name = public.current_profile_name())
);

drop policy if exists employees_insert_scope on public.employees;
create policy employees_insert_scope
on public.employees for insert
to authenticated
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists employees_update_scope on public.employees;
create policy employees_update_scope
on public.employees for update
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
)
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists employees_delete_scope on public.employees;
create policy employees_delete_scope
on public.employees for delete
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists employee_daily_stats_select_scope on public.employee_daily_stats;
create policy employee_daily_stats_select_scope
on public.employee_daily_stats for select
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and employee_name = public.current_profile_name())
);

drop policy if exists employee_daily_stats_insert_scope on public.employee_daily_stats;
create policy employee_daily_stats_insert_scope
on public.employee_daily_stats for insert
to authenticated
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists employee_daily_stats_update_scope on public.employee_daily_stats;
create policy employee_daily_stats_update_scope
on public.employee_daily_stats for update
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
)
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists employee_performance_reports_select_scope on public.employee_performance_reports;
create policy employee_performance_reports_select_scope
on public.employee_performance_reports for select
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and employee = public.current_profile_name())
);

drop policy if exists employee_performance_reports_insert_scope on public.employee_performance_reports;
create policy employee_performance_reports_insert_scope
on public.employee_performance_reports for insert
to authenticated
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and store = public.current_profile_store() and employee = public.current_profile_name())
);

drop policy if exists employee_performance_reports_update_scope on public.employee_performance_reports;
create policy employee_performance_reports_update_scope
on public.employee_performance_reports for update
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and employee = public.current_profile_name())
)
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and store = public.current_profile_store() and employee = public.current_profile_name())
);

drop policy if exists employee_performance_reports_delete_scope on public.employee_performance_reports;
create policy employee_performance_reports_delete_scope
on public.employee_performance_reports for delete
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and employee = public.current_profile_name())
);

drop policy if exists followups_select_scope on public.followups;
create policy followups_select_scope
on public.followups for select
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and owner = public.current_profile_name())
);

drop policy if exists followups_insert_scope on public.followups;
create policy followups_insert_scope
on public.followups for insert
to authenticated
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and store = public.current_profile_store() and owner = public.current_profile_name())
);

drop policy if exists followups_update_scope on public.followups;
create policy followups_update_scope
on public.followups for update
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and owner = public.current_profile_name())
)
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and store = public.current_profile_store() and owner = public.current_profile_name())
);

drop policy if exists followups_delete_scope on public.followups;
create policy followups_delete_scope
on public.followups for delete
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
  or (public.current_profile_role() = 'beautician' and owner = public.current_profile_name())
);

drop policy if exists daily_reviews_select_scope on public.daily_reviews;
create policy daily_reviews_select_scope
on public.daily_reviews for select
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists daily_reviews_insert_scope on public.daily_reviews;
create policy daily_reviews_insert_scope
on public.daily_reviews for insert
to authenticated
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists daily_reviews_update_scope on public.daily_reviews;
create policy daily_reviews_update_scope
on public.daily_reviews for update
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
)
with check (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

drop policy if exists daily_reviews_delete_scope on public.daily_reviews;
create policy daily_reviews_delete_scope
on public.daily_reviews for delete
to authenticated
using (
  public.current_profile_role() = 'boss'
  or (public.current_profile_role() = 'manager' and store = public.current_profile_store())
);

commit;
