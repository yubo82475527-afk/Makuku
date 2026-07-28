-- AI usage assistant: published knowledge versions + Q&A audit turns.
-- Client roles have no policies; only service_role (bypasses RLS) may read/write.

create table if not exists public.usage_assistant_knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  content_hash text not null,
  facts jsonb not null,
  howto_zh text not null default '',
  howto_en text not null default '',
  facts_source_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  note text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_usage_assistant_knowledge_one_published
  on public.usage_assistant_knowledge_versions ((status))
  where status = 'published';

create index if not exists idx_usage_assistant_knowledge_created
  on public.usage_assistant_knowledge_versions (created_at desc);

create table if not exists public.usage_assistant_turns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.app_users(id) on delete set null,
  user_display_name text,
  user_role text,
  locale text,
  ui_locale text,
  current_path text,
  question text not null,
  answer text not null default '',
  grounding text not null check (grounding in ('grounded', 'fallback', 'refuse')),
  related_menus jsonb,
  knowledge_version text,
  knowledge_content_hash text,
  model text,
  provider_request_id text,
  latency_ms integer,
  error text
);

create index if not exists idx_usage_assistant_turns_created
  on public.usage_assistant_turns (created_at desc);

create index if not exists idx_usage_assistant_turns_grounding
  on public.usage_assistant_turns (grounding, created_at desc);

alter table public.usage_assistant_knowledge_versions enable row level security;
alter table public.usage_assistant_turns enable row level security;
