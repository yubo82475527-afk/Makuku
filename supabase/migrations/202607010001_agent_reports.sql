create table if not exists public.agent_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  timezone text not null default 'Asia/Jakarta',
  scope_type text not null check (scope_type in ('global', 'organization', 'user')),
  scope_id uuid,
  scope_name text not null,
  metrics_json jsonb not null,
  content_json jsonb not null,
  feishu_card_json jsonb not null,
  status text not null default 'generated' check (status in ('draft', 'generated', 'sent', 'failed')),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists uniq_agent_reports_scope_period
  on public.agent_reports(
    report_type,
    period_start,
    period_end,
    scope_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_agent_reports_scope_lookup
  on public.agent_reports(scope_type, scope_id, period_end desc);

create table if not exists public.agent_report_recipients (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.agent_reports(id) on delete cascade,
  app_user_id uuid references public.app_users(id) on delete set null,
  feishu_user_id text,
  feishu_chat_id text,
  delivery_channel text not null check (delivery_channel in ('user', 'chat')),
  send_status text not null default 'pending' check (send_status in ('pending', 'sent', 'failed')),
  feishu_message_id text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_agent_report_recipients_report
  on public.agent_report_recipients(report_id);

create table if not exists public.agent_report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly')),
  scope_type text not null check (scope_type in ('global', 'organization', 'user')),
  scope_id uuid,
  recipient_type text not null check (recipient_type in ('user', 'chat')),
  recipient_id text not null,
  send_time_local time not null,
  timezone text not null default 'Asia/Jakarta',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists uniq_agent_report_subscriptions_target
  on public.agent_report_subscriptions(
    report_type,
    scope_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    recipient_type,
    recipient_id
  );

alter table public.agent_reports enable row level security;
alter table public.agent_report_recipients enable row level security;
alter table public.agent_report_subscriptions enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read agent_reports" on public.agent_reports';
  execute 'drop policy if exists "authenticated insert agent_reports" on public.agent_reports';
  execute 'drop policy if exists "authenticated update agent_reports" on public.agent_reports';
  execute 'drop policy if exists "authenticated read agent_report_recipients" on public.agent_report_recipients';
  execute 'drop policy if exists "authenticated insert agent_report_recipients" on public.agent_report_recipients';
  execute 'drop policy if exists "authenticated update agent_report_recipients" on public.agent_report_recipients';
  execute 'drop policy if exists "authenticated read agent_report_subscriptions" on public.agent_report_subscriptions';
  execute 'drop policy if exists "authenticated insert agent_report_subscriptions" on public.agent_report_subscriptions';
  execute 'drop policy if exists "authenticated update agent_report_subscriptions" on public.agent_report_subscriptions';

  execute 'create policy "authenticated read agent_reports" on public.agent_reports for select to authenticated using (true)';
  execute 'create policy "authenticated insert agent_reports" on public.agent_reports for insert to authenticated with check (true)';
  execute 'create policy "authenticated update agent_reports" on public.agent_reports for update to authenticated using (true) with check (true)';
  execute 'create policy "authenticated read agent_report_recipients" on public.agent_report_recipients for select to authenticated using (true)';
  execute 'create policy "authenticated insert agent_report_recipients" on public.agent_report_recipients for insert to authenticated with check (true)';
  execute 'create policy "authenticated update agent_report_recipients" on public.agent_report_recipients for update to authenticated using (true) with check (true)';
  execute 'create policy "authenticated read agent_report_subscriptions" on public.agent_report_subscriptions for select to authenticated using (true)';
  execute 'create policy "authenticated insert agent_report_subscriptions" on public.agent_report_subscriptions for insert to authenticated with check (true)';
  execute 'create policy "authenticated update agent_report_subscriptions" on public.agent_report_subscriptions for update to authenticated using (true) with check (true)';
end;
$$;
