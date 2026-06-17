-- Preserve the photo that produced each AI price review candidate.

alter table public.ai_price_candidates
  add column if not exists source_image_id uuid references public.offline_visit_images(id) on delete set null,
  add column if not exists source_image_path text;

update public.ai_price_candidates c
set source_image_path = i.image_path
from public.offline_visit_images i
where c.source_image_id = i.id
  and c.source_image_path is null;

create index if not exists idx_ai_price_candidates_source_image_id
  on public.ai_price_candidates(source_image_id)
  where source_image_id is not null;

select pg_notify('pgrst', 'reload schema');
