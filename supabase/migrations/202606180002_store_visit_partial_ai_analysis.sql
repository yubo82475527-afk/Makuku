alter table public.offline_visit_images
  add column if not exists analysis_error text;

alter table public.offline_store_visits
  drop constraint if exists offline_store_visits_analysis_status_check;

alter table public.offline_store_visits
  add constraint offline_store_visits_analysis_status_check
  check (analysis_status in ('pending', 'analyzing', 'completed', 'partial', 'failed'));

select pg_notify('pgrst', 'reload schema');
