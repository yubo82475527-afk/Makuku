-- Repair price snapshot schema drift and ensure offline confirmed prices stay linked to stores.
-- This restores source tracking columns when older environments missed the prior migration
-- and backfills offline_store_id from the originating store visit.

alter table public.price_snapshots
  add column if not exists offline_store_id uuid references public.offline_stores(id) on delete set null,
  add column if not exists source_visit_id uuid references public.offline_store_visits(id) on delete set null,
  add column if not exists source_image_id uuid references public.offline_visit_images(id) on delete set null,
  add column if not exists source_matched_entity_type text,
  add column if not exists source_matched_entity_id text;

create index if not exists idx_price_snapshots_offline_store
  on public.price_snapshots(offline_store_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_snapshots_source_matched_entity_type_check'
      and conrelid = 'public.price_snapshots'::regclass
  ) then
    alter table public.price_snapshots
      add constraint price_snapshots_source_matched_entity_type_check
      check (
        source_matched_entity_type is null
        or source_matched_entity_type in ('material_master', 'competitor_product')
      );
  end if;
end;
$$;

with candidate_source as (
  select distinct on (c.price_snapshot_id)
    c.price_snapshot_id,
    c.visit_id,
    c.source_image_id,
    c.matched_entity_type,
    c.matched_entity_id,
    visit.store_id
  from public.ai_price_candidates c
  left join public.offline_store_visits visit
    on visit.id = c.visit_id
  where c.price_snapshot_id is not null
    and c.status = 'approved'
    and c.visit_id is not null
    and c.source_image_id is not null
    and c.matched_entity_type in ('material_master', 'competitor_product')
    and c.matched_entity_id is not null
  order by c.price_snapshot_id, c.reviewed_at desc nulls last, c.created_at desc
)
update public.price_snapshots ps
set
  source_visit_id = coalesce(ps.source_visit_id, candidate_source.visit_id),
  source_image_id = coalesce(ps.source_image_id, candidate_source.source_image_id),
  source_matched_entity_type = coalesce(ps.source_matched_entity_type, candidate_source.matched_entity_type),
  source_matched_entity_id = coalesce(ps.source_matched_entity_id, candidate_source.matched_entity_id),
  offline_store_id = coalesce(ps.offline_store_id, candidate_source.store_id)
from candidate_source
where ps.id = candidate_source.price_snapshot_id
  and ps.source = 'offline_ai_confirmed';

update public.price_snapshots ps
set offline_store_id = visit.store_id
from public.offline_store_visits visit
where ps.source = 'offline_ai_confirmed'
  and ps.offline_store_id is null
  and ps.source_visit_id = visit.id
  and visit.store_id is not null;

with duplicate_snapshots as (
  select
    id,
    first_value(id) over (
      partition by source_visit_id, source_image_id, source_matched_entity_type, source_matched_entity_id, net_price_idr
      order by created_at, id
    ) as keep_id,
    row_number() over (
      partition by source_visit_id, source_image_id, source_matched_entity_type, source_matched_entity_id, net_price_idr
      order by created_at, id
    ) as duplicate_rank
  from public.price_snapshots
  where source = 'offline_ai_confirmed'
    and source_visit_id is not null
    and source_image_id is not null
    and source_matched_entity_type is not null
    and source_matched_entity_id is not null
    and net_price_idr is not null
),
rewired_candidates as (
  update public.ai_price_candidates c
  set price_snapshot_id = d.keep_id
  from duplicate_snapshots d
  where c.price_snapshot_id = d.id
    and d.duplicate_rank > 1
  returning c.id
)
delete from public.price_snapshots ps
using duplicate_snapshots d
where ps.id = d.id
  and d.duplicate_rank > 1;

create unique index if not exists idx_price_snapshots_offline_ai_source_unique
  on public.price_snapshots(
    source_visit_id,
    source_image_id,
    source_matched_entity_type,
    source_matched_entity_id,
    net_price_idr
  )
  where source = 'offline_ai_confirmed'
    and source_visit_id is not null
    and source_image_id is not null
    and source_matched_entity_type is not null
    and source_matched_entity_id is not null
    and net_price_idr is not null;

create index if not exists idx_price_snapshots_source_visit_image
  on public.price_snapshots(source_visit_id, source_image_id)
  where source_visit_id is not null
    and source_image_id is not null;

select pg_notify('pgrst', 'reload schema');
