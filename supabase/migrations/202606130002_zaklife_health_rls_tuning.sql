begin;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists "health_profiles_select_own" on public.health_profiles;
create policy "health_profiles_select_own"
  on public.health_profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "health_profiles_insert_own" on public.health_profiles;
create policy "health_profiles_insert_own"
  on public.health_profiles for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "health_profiles_update_own" on public.health_profiles;
create policy "health_profiles_update_own"
  on public.health_profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "health_measurements_select_own" on public.health_measurements;
create policy "health_measurements_select_own"
  on public.health_measurements for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists "health_measurements_insert_own" on public.health_measurements;
create policy "health_measurements_insert_own"
  on public.health_measurements for insert
  to authenticated
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "health_measurements_update_own" on public.health_measurements;
create policy "health_measurements_update_own"
  on public.health_measurements for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "health_measurements_delete_own" on public.health_measurements;
create policy "health_measurements_delete_own"
  on public.health_measurements for delete
  to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists "health_pr_records_select_own" on public.health_pr_records;
create policy "health_pr_records_select_own"
  on public.health_pr_records for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists "health_pr_records_insert_own" on public.health_pr_records;
create policy "health_pr_records_insert_own"
  on public.health_pr_records for insert
  to authenticated
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "health_pr_records_update_own" on public.health_pr_records;
create policy "health_pr_records_update_own"
  on public.health_pr_records for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "health_pr_records_delete_own" on public.health_pr_records;
create policy "health_pr_records_delete_own"
  on public.health_pr_records for delete
  to authenticated
  using (owner_user_id = (select auth.uid()));

commit;
