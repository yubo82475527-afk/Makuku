alter table public.offline_visit_images
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_reason text;

create index if not exists idx_offline_visit_images_deleted_at
  on public.offline_visit_images(deleted_at)
  where deleted_at is not null;

alter table public.ai_price_candidates
  add column if not exists h5_lifecycle_status text,
  add column if not exists h5_lifecycle_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_h5_lifecycle_status_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_h5_lifecycle_status_check
      check (h5_lifecycle_status is null or h5_lifecycle_status in ('deleted', 'replaced', 'reanalyzed'));
  end if;
end;
$$;

create index if not exists idx_ai_price_candidates_h5_lifecycle_status
  on public.ai_price_candidates(h5_lifecycle_status)
  where h5_lifecycle_status is not null;

select pg_notify('pgrst', 'reload schema');
