alter table public.offline_visit_images
  add column if not exists replaces_image_id uuid references public.offline_visit_images(id) on delete set null,
  add column if not exists replaced_by_image_id uuid references public.offline_visit_images(id) on delete set null;

create index if not exists idx_offline_visit_images_replaces on public.offline_visit_images(replaces_image_id);
create index if not exists idx_offline_visit_images_replaced_by on public.offline_visit_images(replaced_by_image_id);

select pg_notify('pgrst', 'reload schema');
