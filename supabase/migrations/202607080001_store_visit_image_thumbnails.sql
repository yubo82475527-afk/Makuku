alter table public.offline_visit_images
  add column if not exists thumbnail_path text;

alter table public.offline_store_visits
  add column if not exists image_thumbnail_paths text[];
