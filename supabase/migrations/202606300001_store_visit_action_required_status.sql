alter table public.offline_store_visits
  drop constraint if exists offline_store_visits_analysis_status_check;

alter table public.offline_store_visits
  add constraint offline_store_visits_analysis_status_check
  check (analysis_status in ('pending', 'analyzing', 'completed', 'partial', 'action_required', 'failed'));

select pg_notify('pgrst', 'reload schema');
