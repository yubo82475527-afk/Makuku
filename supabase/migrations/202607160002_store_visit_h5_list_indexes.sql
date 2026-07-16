create index concurrently if not exists idx_offline_store_visits_h5_uploader_created
  on public.offline_store_visits (uploader_user_id, created_at desc)
  where uploader_user_id is not null
    and visit_status <> 'draft';

create index concurrently if not exists idx_offline_store_visits_h5_uploader_visit_date
  on public.offline_store_visits (uploader_user_id, visit_date)
  where uploader_user_id is not null
    and visit_status <> 'draft';

create index concurrently if not exists idx_offline_visit_images_visit_id
  on public.offline_visit_images (visit_id);
