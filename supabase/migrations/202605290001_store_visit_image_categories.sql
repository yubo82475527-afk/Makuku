alter table public.offline_store_visits
  add column if not exists image_categories jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
