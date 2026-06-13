begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.crm_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_lead_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  color text not null default '#10b981',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug ~ '^[a-z0-9][a-z0-9_-]{1,48}$')
);

create table if not exists public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company_name text,
  phone text,
  email text,
  zalo_handle text,
  facebook_url text,
  source_id uuid references public.crm_lead_sources(id) on delete set null,
  status text not null default 'lead'
    check (status in ('lead', 'prospect', 'active', 'inactive', 'churned')),
  tags text[] not null default '{}',
  notes text,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  title text not null,
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'quoted', 'negotiating', 'won', 'lost')),
  value_amount numeric(14,0) not null default 0 check (value_amount >= 0),
  currency text not null default 'VND',
  service_type text not null default 'other'
    check (service_type in ('ai_mentoring', 'website', 'portfolio', 'pos', 'crm', 'automation', 'content', 'maintenance', 'other')),
  probability smallint not null default 20 check (probability between 0 and 100),
  expected_close_date date,
  follow_up_at timestamptz,
  lost_reason text,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  won_at timestamptz,
  lost_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  deal_id uuid references public.crm_deals(id) on delete set null,
  type text not null default 'note'
    check (type in ('zalo', 'facebook', 'phone', 'email', 'meeting', 'note', 'system', 'webhook')),
  title text,
  content text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  deal_id uuid references public.crm_deals(id) on delete set null,
  name text not null,
  status text not null default 'planning'
    check (status in ('planning', 'in_progress', 'review', 'delivered', 'maintenance', 'cancelled')),
  start_date date,
  deadline date,
  delivered_at timestamptz,
  budget_amount numeric(14,0) not null default 0 check (budget_amount >= 0),
  currency text not null default 'VND',
  tech_stack text[] not null default '{}',
  repo_url text,
  live_url text,
  notes text,
  owner_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.crm_clients(id) on delete cascade,
  deal_id uuid references public.crm_deals(id) on delete cascade,
  project_id uuid references public.crm_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'done', 'cancelled')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  due_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id is not null or deal_id is not null or project_id is not null)
);

create table if not exists public.crm_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  project_id uuid references public.crm_projects(id) on delete set null,
  deal_id uuid references public.crm_deals(id) on delete set null,
  code text unique,
  amount numeric(14,0) not null check (amount >= 0),
  currency text not null default 'VND',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  issued_date date not null default current_date,
  due_date date,
  paid_date date,
  payment_method text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_webhook_leads (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('zalo', 'facebook', 'website', 'google_sheet', 'manual', 'other')),
  external_id text,
  form_slug text not null default 'general',
  lead_name text,
  contact_phone text,
  contact_email text,
  contact_zalo text,
  need_type text not null default 'other'
    check (need_type in ('ai_mentoring', 'website_portfolio', 'pos_crm', 'automation', 'content_auto_post', 'other')),
  need_label text,
  need_summary text,
  page_url text,
  referrer_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  payload jsonb not null default '{}'::jsonb,
  client_id uuid references public.crm_clients(id) on delete set null,
  deal_id uuid references public.crm_deals(id) on delete set null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'duplicate', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_webhook_leads_provider_external_uidx
  on public.crm_webhook_leads(provider, external_id)
  where external_id is not null;
create index if not exists crm_webhook_leads_provider_form_idx on public.crm_webhook_leads(provider, form_slug);
create index if not exists crm_webhook_leads_status_idx on public.crm_webhook_leads(processing_status, received_at desc);
create index if not exists crm_webhook_leads_phone_idx on public.crm_webhook_leads(contact_phone) where contact_phone is not null;

create index if not exists crm_clients_status_idx on public.crm_clients(status);
create index if not exists crm_clients_source_idx on public.crm_clients(source_id);
create index if not exists crm_clients_owner_idx on public.crm_clients(owner_user_id);
create index if not exists crm_deals_stage_idx on public.crm_deals(stage);
create index if not exists crm_deals_follow_up_idx on public.crm_deals(follow_up_at) where stage not in ('won', 'lost');
create index if not exists crm_deals_client_idx on public.crm_deals(client_id);
create index if not exists crm_interactions_client_time_idx on public.crm_interactions(client_id, occurred_at desc);
create index if not exists crm_projects_deadline_idx on public.crm_projects(deadline) where status not in ('delivered', 'cancelled');
create index if not exists crm_tasks_due_idx on public.crm_tasks(due_at) where status not in ('done', 'cancelled');
create index if not exists crm_invoices_status_due_idx on public.crm_invoices(status, due_date);

create sequence if not exists private.crm_invoice_code_seq start with 1;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.assign_crm_invoice_code()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code = 'INV-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('private.crm_invoice_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function private.sync_crm_deal_stage_timestamps()
returns trigger
language plpgsql
as $$
begin
  if new.stage = 'won' and old.stage is distinct from 'won' then
    new.won_at = coalesce(new.won_at, now());
    new.lost_at = null;
  elsif new.stage = 'lost' and old.stage is distinct from 'lost' then
    new.lost_at = coalesce(new.lost_at, now());
    new.won_at = null;
  elsif new.stage not in ('won', 'lost') then
    new.won_at = null;
    new.lost_at = null;
  end if;
  return new;
end;
$$;

create or replace function private.crm_service_from_need_type(need_type text)
returns text
language sql
immutable
as $$
  select case coalesce(need_type, 'other')
    when 'ai_mentoring' then 'ai_mentoring'
    when 'website_portfolio' then 'website'
    when 'pos_crm' then 'crm'
    when 'automation' then 'automation'
    when 'content_auto_post' then 'content'
    else 'other'
  end;
$$;

create or replace function private.normalize_crm_webhook_lead()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  new.payload = coalesce(new.payload, '{}'::jsonb);
  new.form_slug = coalesce(nullif(btrim(new.form_slug), ''), nullif(new.payload->>'form_slug', ''), 'general');
  new.lead_name = coalesce(nullif(btrim(new.lead_name), ''), nullif(new.payload->>'lead_name', ''), nullif(new.payload->>'name', ''), nullif(new.payload->>'full_name', ''));
  new.contact_phone = coalesce(nullif(btrim(new.contact_phone), ''), nullif(new.payload->>'contact_phone', ''), nullif(new.payload->>'phone', ''), nullif(new.payload->>'phone_or_zalo', ''));
  new.contact_email = coalesce(nullif(btrim(new.contact_email), ''), nullif(new.payload->>'contact_email', ''), nullif(new.payload->>'email', ''));
  new.contact_zalo = coalesce(nullif(btrim(new.contact_zalo), ''), nullif(new.payload->>'contact_zalo', ''), nullif(new.payload->>'zalo', ''), nullif(new.payload->>'phone_or_zalo', ''));
  new.need_type = coalesce(nullif(btrim(new.need_type), ''), nullif(new.payload->>'need_type', ''), 'other');
  new.need_label = coalesce(nullif(btrim(new.need_label), ''), nullif(new.payload->>'need_label', ''), nullif(new.payload->>'need', ''), nullif(new.payload->>'service', ''));
  if new.need_type not in ('ai_mentoring', 'website_portfolio', 'pos_crm', 'automation', 'content_auto_post', 'other') then
    new.need_label = coalesce(new.need_label, new.need_type);
    new.need_type = 'other';
  end if;
  new.need_summary = coalesce(nullif(btrim(new.need_summary), ''), nullif(new.payload->>'need_summary', ''), nullif(new.payload->>'message', ''), nullif(new.payload->>'description', ''));
  new.page_url = coalesce(nullif(btrim(new.page_url), ''), nullif(new.payload->>'page_url', ''), nullif(new.payload->>'url', ''));
  new.referrer_url = coalesce(nullif(btrim(new.referrer_url), ''), nullif(new.payload->>'referrer_url', ''), nullif(new.payload->>'referrer', ''));
  new.utm_source = coalesce(nullif(btrim(new.utm_source), ''), nullif(new.payload->>'utm_source', ''));
  new.utm_medium = coalesce(nullif(btrim(new.utm_medium), ''), nullif(new.payload->>'utm_medium', ''));
  new.utm_campaign = coalesce(nullif(btrim(new.utm_campaign), ''), nullif(new.payload->>'utm_campaign', ''));
  return new;
end;
$$;

create or replace function private.process_crm_webhook_lead()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_source_id uuid;
  v_client_id uuid;
  v_deal_id uuid;
  v_title text;
begin
  if new.processing_status <> 'received' then
    return new;
  end if;

  select id into v_source_id
  from public.crm_lead_sources
  where slug = case when new.provider = 'website' then 'website' else new.provider end
  limit 1;

  if new.contact_phone is not null then
    select id into v_client_id
    from public.crm_clients
    where archived_at is null and phone = new.contact_phone
    order by created_at desc
    limit 1;
  end if;

  if v_client_id is null and new.contact_email is not null then
    select id into v_client_id
    from public.crm_clients
    where archived_at is null and email = new.contact_email
    order by created_at desc
    limit 1;
  end if;

  if v_client_id is null then
    insert into public.crm_clients (
      full_name, phone, email, zalo_handle, source_id, status, tags, notes, metadata
    )
    values (
      coalesce(new.lead_name, 'Website lead'),
      new.contact_phone,
      new.contact_email,
      new.contact_zalo,
      v_source_id,
      'lead',
      array['Website', 'Portfolio'],
      new.need_summary,
      jsonb_build_object(
        'webhook_lead_id', new.id,
        'form_slug', new.form_slug,
        'need_type', new.need_type,
        'page_url', new.page_url,
        'referrer_url', new.referrer_url,
        'utm_source', new.utm_source,
        'utm_medium', new.utm_medium,
        'utm_campaign', new.utm_campaign
      )
    )
    returning id into v_client_id;
  end if;

  v_title = coalesce(
    nullif(new.need_label, ''),
    case new.need_type
      when 'ai_mentoring' then 'AI 1-1 mentoring'
      when 'website_portfolio' then 'Website / portfolio'
      when 'pos_crm' then 'POS / CRM'
      when 'automation' then 'Automation workflow'
      when 'content_auto_post' then 'Content auto-post'
      else 'Website lead'
    end
  );

  insert into public.crm_deals (
    client_id, title, stage, value_amount, service_type, probability, follow_up_at, metadata
  )
  values (
    v_client_id,
    coalesce(new.lead_name || ' - ' || v_title, v_title),
    'new',
    0,
    private.crm_service_from_need_type(new.need_type),
    20,
    now() + interval '1 day',
    jsonb_build_object(
      'webhook_lead_id', new.id,
      'form_slug', new.form_slug,
      'need_type', new.need_type,
      'need_label', new.need_label,
      'page_url', new.page_url
    )
  )
  returning id into v_deal_id;

  insert into public.crm_interactions (
    client_id, deal_id, type, title, content, metadata
  )
  values (
    v_client_id,
    v_deal_id,
    'webhook',
    'Lead from ' || coalesce(new.page_url, new.provider),
    coalesce(new.need_summary, new.need_label, 'New lead from website form'),
    jsonb_build_object('webhook_lead_id', new.id, 'payload', new.payload)
  );

  new.client_id = v_client_id;
  new.deal_id = v_deal_id;
  new.processing_status = 'processed';
  new.processed_at = now();
  return new;
exception when others then
  new.processing_status = 'failed';
  new.error_message = sqlerrm;
  return new;
end;
$$;

drop trigger if exists crm_members_set_updated_at on public.crm_members;
create trigger crm_members_set_updated_at
  before update on public.crm_members
  for each row execute function private.set_updated_at();

drop trigger if exists crm_lead_sources_set_updated_at on public.crm_lead_sources;
create trigger crm_lead_sources_set_updated_at
  before update on public.crm_lead_sources
  for each row execute function private.set_updated_at();

drop trigger if exists crm_clients_set_updated_at on public.crm_clients;
create trigger crm_clients_set_updated_at
  before update on public.crm_clients
  for each row execute function private.set_updated_at();

drop trigger if exists crm_deals_set_updated_at on public.crm_deals;
create trigger crm_deals_set_updated_at
  before update on public.crm_deals
  for each row execute function private.set_updated_at();

drop trigger if exists crm_deals_sync_stage_timestamps on public.crm_deals;
create trigger crm_deals_sync_stage_timestamps
  before update on public.crm_deals
  for each row execute function private.sync_crm_deal_stage_timestamps();

drop trigger if exists crm_interactions_set_updated_at on public.crm_interactions;
create trigger crm_interactions_set_updated_at
  before update on public.crm_interactions
  for each row execute function private.set_updated_at();

drop trigger if exists crm_projects_set_updated_at on public.crm_projects;
create trigger crm_projects_set_updated_at
  before update on public.crm_projects
  for each row execute function private.set_updated_at();

drop trigger if exists crm_tasks_set_updated_at on public.crm_tasks;
create trigger crm_tasks_set_updated_at
  before update on public.crm_tasks
  for each row execute function private.set_updated_at();

drop trigger if exists crm_invoices_set_updated_at on public.crm_invoices;
create trigger crm_invoices_set_updated_at
  before update on public.crm_invoices
  for each row execute function private.set_updated_at();

drop trigger if exists crm_invoices_assign_code on public.crm_invoices;
create trigger crm_invoices_assign_code
  before insert on public.crm_invoices
  for each row execute function private.assign_crm_invoice_code();

drop trigger if exists crm_webhook_leads_set_updated_at on public.crm_webhook_leads;
create trigger crm_webhook_leads_set_updated_at
  before update on public.crm_webhook_leads
  for each row execute function private.set_updated_at();

drop trigger if exists crm_webhook_leads_normalize on public.crm_webhook_leads;
create trigger crm_webhook_leads_normalize
  before insert or update on public.crm_webhook_leads
  for each row execute function private.normalize_crm_webhook_lead();

drop trigger if exists crm_webhook_leads_process on public.crm_webhook_leads;
create trigger crm_webhook_leads_process
  before insert on public.crm_webhook_leads
  for each row execute function private.process_crm_webhook_lead();

create or replace function private.crm_role()
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select m.role
  from public.crm_members m
  where m.user_id = (select auth.uid())
    and m.is_active
  limit 1;
$$;

create or replace function private.can_crm_read()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select private.crm_role() in ('owner', 'admin', 'member', 'viewer');
$$;

create or replace function private.can_crm_write()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select private.crm_role() in ('owner', 'admin', 'member');
$$;

create or replace function private.can_crm_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select private.crm_role() in ('owner', 'admin');
$$;

alter table public.crm_members enable row level security;
alter table public.crm_lead_sources enable row level security;
alter table public.crm_clients enable row level security;
alter table public.crm_deals enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_projects enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_invoices enable row level security;
alter table public.crm_webhook_leads enable row level security;

drop policy if exists crm_members_read on public.crm_members;
create policy crm_members_read
  on public.crm_members for select
  to authenticated
  using ((select private.can_crm_read()));

drop policy if exists crm_members_admin_insert on public.crm_members;
create policy crm_members_admin_insert
  on public.crm_members for insert
  to authenticated
  with check ((select private.can_crm_admin()));

drop policy if exists crm_members_admin_update on public.crm_members;
create policy crm_members_admin_update
  on public.crm_members for update
  to authenticated
  using ((select private.can_crm_admin()))
  with check ((select private.can_crm_admin()));

drop policy if exists crm_members_admin_delete on public.crm_members;
create policy crm_members_admin_delete
  on public.crm_members for delete
  to authenticated
  using ((select private.can_crm_admin()));

drop policy if exists crm_lead_sources_read on public.crm_lead_sources;
create policy crm_lead_sources_read
  on public.crm_lead_sources for select
  to authenticated
  using ((select private.can_crm_read()));

drop policy if exists crm_lead_sources_write on public.crm_lead_sources;
create policy crm_lead_sources_write
  on public.crm_lead_sources for all
  to authenticated
  using ((select private.can_crm_admin()))
  with check ((select private.can_crm_admin()));

drop policy if exists crm_clients_read on public.crm_clients;
create policy crm_clients_read
  on public.crm_clients for select
  to authenticated
  using ((select private.can_crm_read()));

drop policy if exists crm_clients_write on public.crm_clients;
create policy crm_clients_write
  on public.crm_clients for all
  to authenticated
  using ((select private.can_crm_write()))
  with check ((select private.can_crm_write()));

drop policy if exists crm_deals_read on public.crm_deals;
create policy crm_deals_read
  on public.crm_deals for select
  to authenticated
  using ((select private.can_crm_read()));

drop policy if exists crm_deals_write on public.crm_deals;
create policy crm_deals_write
  on public.crm_deals for all
  to authenticated
  using ((select private.can_crm_write()))
  with check ((select private.can_crm_write()));

drop policy if exists crm_interactions_read on public.crm_interactions;
create policy crm_interactions_read
  on public.crm_interactions for select
  to authenticated
  using ((select private.can_crm_read()));

drop policy if exists crm_interactions_write on public.crm_interactions;
create policy crm_interactions_write
  on public.crm_interactions for all
  to authenticated
  using ((select private.can_crm_write()))
  with check ((select private.can_crm_write()));

drop policy if exists crm_projects_read on public.crm_projects;
create policy crm_projects_read
  on public.crm_projects for select
  to authenticated
  using ((select private.can_crm_read()));

drop policy if exists crm_projects_write on public.crm_projects;
create policy crm_projects_write
  on public.crm_projects for all
  to authenticated
  using ((select private.can_crm_write()))
  with check ((select private.can_crm_write()));

drop policy if exists crm_tasks_read on public.crm_tasks;
create policy crm_tasks_read
  on public.crm_tasks for select
  to authenticated
  using ((select private.can_crm_read()));

drop policy if exists crm_tasks_write on public.crm_tasks;
create policy crm_tasks_write
  on public.crm_tasks for all
  to authenticated
  using ((select private.can_crm_write()))
  with check ((select private.can_crm_write()));

drop policy if exists crm_invoices_read on public.crm_invoices;
create policy crm_invoices_read
  on public.crm_invoices for select
  to authenticated
  using ((select private.can_crm_read()));

drop policy if exists crm_invoices_write on public.crm_invoices;
create policy crm_invoices_write
  on public.crm_invoices for all
  to authenticated
  using ((select private.can_crm_write()))
  with check ((select private.can_crm_write()));

drop policy if exists crm_webhook_leads_read on public.crm_webhook_leads;
create policy crm_webhook_leads_read
  on public.crm_webhook_leads for select
  to authenticated
  using ((select private.can_crm_read()));

drop policy if exists crm_webhook_leads_write on public.crm_webhook_leads;
create policy crm_webhook_leads_write
  on public.crm_webhook_leads for all
  to authenticated
  using ((select private.can_crm_admin()))
  with check ((select private.can_crm_admin()));

create or replace view public.crm_pipeline_cards
with (security_invoker = true)
as
select
  d.id as deal_id,
  d.title,
  d.stage,
  d.value_amount,
  d.currency,
  d.service_type,
  d.probability,
  d.follow_up_at,
  d.expected_close_date,
  d.updated_at,
  c.id as client_id,
  c.full_name,
  c.company_name,
  c.phone,
  c.email,
  c.zalo_handle,
  c.tags,
  c.notes as detail,
  s.slug as source_slug,
  s.name as source_name,
  s.color as source_color
from public.crm_deals d
join public.crm_clients c on c.id = d.client_id
left join public.crm_lead_sources s on s.id = c.source_id
where c.archived_at is null
  and d.archived_at is null;

create or replace view public.crm_dashboard_summary
with (security_invoker = true)
as
select
  (select count(*) from public.crm_deals where stage = 'new' and archived_at is null) as new_leads,
  (select count(*) from public.crm_deals where follow_up_at <= now() and stage not in ('won', 'lost') and archived_at is null) as due_followups,
  (select coalesce(sum(value_amount), 0) from public.crm_deals where stage not in ('lost') and archived_at is null) as pipeline_value_amount,
  (select count(*) from public.crm_deals where stage = 'won' and archived_at is null) as won_count,
  (select count(*) from public.crm_deals where archived_at is null) as total_deals,
  (select coalesce(sum(amount), 0) from public.crm_invoices where status in ('sent', 'overdue')) as unpaid_invoice_amount,
  (select count(*) from public.crm_projects where deadline between current_date and current_date + 14 and status not in ('delivered', 'cancelled')) as upcoming_deadlines;

revoke all on public.crm_members from anon;
revoke all on public.crm_lead_sources from anon;
revoke all on public.crm_clients from anon;
revoke all on public.crm_deals from anon;
revoke all on public.crm_interactions from anon;
revoke all on public.crm_projects from anon;
revoke all on public.crm_tasks from anon;
revoke all on public.crm_invoices from anon;
revoke all on public.crm_webhook_leads from anon;
revoke all on public.crm_pipeline_cards from anon;
revoke all on public.crm_dashboard_summary from anon;

grant usage on schema private to authenticated;
grant execute on function private.crm_role() to authenticated;
grant execute on function private.can_crm_read() to authenticated;
grant execute on function private.can_crm_write() to authenticated;
grant execute on function private.can_crm_admin() to authenticated;

grant select on public.crm_members to authenticated;
grant select, insert, update, delete on public.crm_lead_sources to authenticated;
grant select, insert, update, delete on public.crm_clients to authenticated;
grant select, insert, update, delete on public.crm_deals to authenticated;
grant select, insert, update, delete on public.crm_interactions to authenticated;
grant select, insert, update, delete on public.crm_projects to authenticated;
grant select, insert, update, delete on public.crm_tasks to authenticated;
grant select, insert, update, delete on public.crm_invoices to authenticated;
grant select, insert, update, delete on public.crm_webhook_leads to authenticated;
grant select on public.crm_pipeline_cards to authenticated;
grant select on public.crm_dashboard_summary to authenticated;

do $$
declare
  table_name regclass;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'public.crm_clients'::regclass,
      'public.crm_deals'::regclass,
      'public.crm_interactions'::regclass,
      'public.crm_projects'::regclass,
      'public.crm_tasks'::regclass,
      'public.crm_invoices'::regclass
    ]
    loop
      begin
        execute format('alter publication supabase_realtime add table %s', table_name);
      exception
        when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

commit;
