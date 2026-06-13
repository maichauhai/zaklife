begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.health_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  height_cm numeric(5,1) not null default 170 check (height_cm between 120 and 230),
  unit_system text not null default 'metric' check (unit_system in ('metric')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_measurements (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  measured_on date not null,
  measurement_condition text not null default 'relaxed'
    check (measurement_condition in ('relaxed', 'flexed_normal', 'flexed_post_workout')),
  weight_kg numeric(5,1) not null check (weight_kg between 30 and 200),
  neck_cm numeric(5,1) check (neck_cm between 20 and 80),
  shoulder_cm numeric(5,1) check (shoulder_cm between 40 and 200),
  chest_cm numeric(5,1) check (chest_cm between 40 and 200),
  waist_cm numeric(5,1) check (waist_cm between 40 and 200),
  hip_cm numeric(5,1) check (hip_cm between 40 and 200),
  bicep_left_cm numeric(5,1) check (bicep_left_cm between 20 and 80),
  bicep_right_cm numeric(5,1) check (bicep_right_cm between 20 and 80),
  thigh_left_cm numeric(5,1) check (thigh_left_cm between 20 and 100),
  thigh_right_cm numeric(5,1) check (thigh_right_cm between 20 and 100),
  calf_cm numeric(5,1) check (calf_cm between 20 and 80),
  notes text,
  photos jsonb not null default '{}'::jsonb,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (measured_on <= current_date),
  check (jsonb_typeof(photos) = 'object')
);

create table if not exists public.health_pr_records (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  performed_on date not null,
  exercise_name text not null,
  weight_kg numeric(6,1) not null check (weight_kg > 0 and weight_kg <= 500),
  reps integer not null default 1 check (reps between 1 and 50),
  notes text,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (performed_on <= current_date)
);

create index if not exists health_measurements_owner_date_idx
  on public.health_measurements(owner_user_id, measured_on desc);
create index if not exists health_measurements_owner_condition_idx
  on public.health_measurements(owner_user_id, measurement_condition, measured_on desc);
create index if not exists health_pr_records_owner_exercise_idx
  on public.health_pr_records(owner_user_id, exercise_name, performed_on desc);

drop trigger if exists health_profiles_set_updated_at on public.health_profiles;
create trigger health_profiles_set_updated_at
  before update on public.health_profiles
  for each row execute function private.set_updated_at();

drop trigger if exists health_measurements_set_updated_at on public.health_measurements;
create trigger health_measurements_set_updated_at
  before update on public.health_measurements
  for each row execute function private.set_updated_at();

drop trigger if exists health_pr_records_set_updated_at on public.health_pr_records;
create trigger health_pr_records_set_updated_at
  before update on public.health_pr_records
  for each row execute function private.set_updated_at();

alter table public.health_profiles enable row level security;
alter table public.health_measurements enable row level security;
alter table public.health_pr_records enable row level security;

drop policy if exists "health_profiles_select_own" on public.health_profiles;
create policy "health_profiles_select_own"
  on public.health_profiles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "health_profiles_insert_own" on public.health_profiles;
create policy "health_profiles_insert_own"
  on public.health_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "health_profiles_update_own" on public.health_profiles;
create policy "health_profiles_update_own"
  on public.health_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "health_measurements_select_own" on public.health_measurements;
create policy "health_measurements_select_own"
  on public.health_measurements for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "health_measurements_insert_own" on public.health_measurements;
create policy "health_measurements_insert_own"
  on public.health_measurements for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "health_measurements_update_own" on public.health_measurements;
create policy "health_measurements_update_own"
  on public.health_measurements for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "health_measurements_delete_own" on public.health_measurements;
create policy "health_measurements_delete_own"
  on public.health_measurements for delete
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "health_pr_records_select_own" on public.health_pr_records;
create policy "health_pr_records_select_own"
  on public.health_pr_records for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "health_pr_records_insert_own" on public.health_pr_records;
create policy "health_pr_records_insert_own"
  on public.health_pr_records for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "health_pr_records_update_own" on public.health_pr_records;
create policy "health_pr_records_update_own"
  on public.health_pr_records for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "health_pr_records_delete_own" on public.health_pr_records;
create policy "health_pr_records_delete_own"
  on public.health_pr_records for delete
  to authenticated
  using (owner_user_id = auth.uid());

grant select, insert, update, delete on public.health_profiles to authenticated;
grant select, insert, update, delete on public.health_measurements to authenticated;
grant select, insert, update, delete on public.health_pr_records to authenticated;

comment on table public.health_measurements is 'ZakLife Health Tracker body measurement logs. Compare trends only within the same measurement_condition.';
comment on column public.health_measurements.photos is 'JSON object with optional front, side, back base64 or URL values.';
comment on table public.health_pr_records is 'ZakLife Health Tracker PR logs. Frontend computes estimated 1RM using Epley.';

commit;
