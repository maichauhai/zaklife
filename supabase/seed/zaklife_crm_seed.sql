begin;

insert into public.crm_lead_sources (id, slug, name, color)
values
  ('00000000-0000-0000-0000-000000000101', 'zalo', 'Zalo', '#3b82f6'),
  ('00000000-0000-0000-0000-000000000102', 'facebook', 'Facebook', '#2563eb'),
  ('00000000-0000-0000-0000-000000000103', 'website', 'Website', '#10b981'),
  ('00000000-0000-0000-0000-000000000104', 'referral', 'Referral', '#f59e0b')
on conflict (slug) do update
set name = excluded.name,
    color = excluded.color,
    is_active = true,
    updated_at = now();

insert into public.crm_clients (id, full_name, company_name, phone, source_id, status, tags, notes)
values
  ('00000000-0000-0000-0000-000000001001', 'Anh Minh', 'Quan cafe', '0989123456', '00000000-0000-0000-0000-000000000101', 'prospect', array['F&B','POS','Automation'], 'Can POS mini va tu dong hoa fanpage.'),
  ('00000000-0000-0000-0000-000000001002', 'Spa Linh', 'Spa Linh', null, '00000000-0000-0000-0000-000000000102', 'lead', array['Booking','CRM'], 'Hoi booking CRM.'),
  ('00000000-0000-0000-0000-000000001003', 'Salon Tuan Anh', 'Salon Tuan Anh', null, '00000000-0000-0000-0000-000000000101', 'prospect', array['POS','CRM'], 'Can POS va CRM nho gon.'),
  ('00000000-0000-0000-0000-000000001004', 'Nha hang Tre Viet', 'Nha hang Tre Viet', null, '00000000-0000-0000-0000-000000000103', 'active', array['POS','Inventory'], 'Da chot du an POS va kho.'),
  ('00000000-0000-0000-0000-000000001005', 'Agency Nova', 'Agency Nova', null, '00000000-0000-0000-0000-000000000103', 'prospect', array['Website','SEO'], 'Dang thuong luong goi website.')
on conflict (id) do update
set full_name = excluded.full_name,
    company_name = excluded.company_name,
    phone = excluded.phone,
    source_id = excluded.source_id,
    status = excluded.status,
    tags = excluded.tags,
    notes = excluded.notes,
    updated_at = now();

insert into public.crm_deals (id, client_id, title, stage, value_amount, service_type, probability, follow_up_at, expected_close_date)
values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001001', 'Anh Minh - Quan cafe', 'quoted', 18000000, 'automation', 55, now() + interval '5 hours', current_date + 20),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000001002', 'Spa Linh Booking CRM', 'new', 12000000, 'crm', 25, now() + interval '1 day', current_date + 14),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000001003', 'Salon POS + CRM', 'contacted', 15000000, 'pos', 35, now() + interval '2 days', current_date + 18),
  ('00000000-0000-0000-0000-000000002004', '00000000-0000-0000-0000-000000001004', 'Nha hang Tre Viet POS + Inventory', 'won', 24000000, 'pos', 100, null, current_date + 7),
  ('00000000-0000-0000-0000-000000002005', '00000000-0000-0000-0000-000000001005', 'Agency Nova Website + SEO', 'negotiating', 30000000, 'website', 60, now() + interval '3 days', current_date + 10)
on conflict (id) do update
set title = excluded.title,
    stage = excluded.stage,
    value_amount = excluded.value_amount,
    service_type = excluded.service_type,
    probability = excluded.probability,
    follow_up_at = excluded.follow_up_at,
    expected_close_date = excluded.expected_close_date,
    updated_at = now();

insert into public.crm_interactions (id, client_id, deal_id, type, title, content, occurred_at)
values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000002001', 'zalo', 'Da nhan tin Zalo', 'Khach quan tam goi POS mini va auto content.', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000002001', 'note', 'Gui bao gia', 'Da gui bao gia POS mini, hen call luc 20:00.', now() - interval '1 hour')
on conflict (id) do update
set title = excluded.title,
    content = excluded.content,
    occurred_at = excluded.occurred_at,
    updated_at = now();

insert into public.crm_projects (id, client_id, deal_id, name, status, start_date, deadline, budget_amount, tech_stack, notes)
values
  ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000002004', 'Nha hang Tre Viet - POS va kho', 'in_progress', current_date - 4, current_date + 7, 24000000, array['Supabase','Vercel','n8n'], 'Du an da chot, dang build MVP.')
on conflict (id) do update
set status = excluded.status,
    deadline = excluded.deadline,
    budget_amount = excluded.budget_amount,
    tech_stack = excluded.tech_stack,
    notes = excluded.notes,
    updated_at = now();

insert into public.crm_tasks (id, client_id, deal_id, title, status, priority, due_at)
values
  ('00000000-0000-0000-0000-000000006001', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000002001', 'Hen call 20:00 voi Anh Minh', 'todo', 'high', now() + interval '5 hours'),
  ('00000000-0000-0000-0000-000000006002', '00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000002005', 'Gui outline landing page cho Agency Nova', 'todo', 'medium', now() + interval '1 day')
on conflict (id) do update
set title = excluded.title,
    status = excluded.status,
    priority = excluded.priority,
    due_at = excluded.due_at,
    updated_at = now();

insert into public.crm_invoices (id, client_id, project_id, deal_id, code, amount, status, issued_date, due_date)
values
  ('00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000002004', 'INV-DEMO-001', 7500000, 'sent', current_date - 5, current_date + 2)
on conflict (id) do update
set amount = excluded.amount,
    status = excluded.status,
    due_date = excluded.due_date,
    updated_at = now();

commit;
