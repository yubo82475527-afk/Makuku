alter table public.sku_master
  add column if not exists material_sku_code text;

alter table public.price_snapshots
  add column if not exists sku_master_id uuid references public.sku_master(id) on delete set null;

create index if not exists idx_sku_master_material_sku_code
  on public.sku_master(material_sku_code);

create index if not exists idx_price_snapshots_sku_master
  on public.price_snapshots(sku_master_id);

update public.sku_master sku
set material_sku_code = material.tenant_sku_code
from public.material_master material
where sku.material_sku_code is null
  and lower(trim(sku.makuku_sku_name)) = lower(trim(material.tenant_sku_name))
  and lower(trim(sku.size)) = lower(trim(coalesce(material.sub_type, 'unknown')))
  and sku.piece_count = material.pack_count;

update public.sku_master sku
set material_sku_code = material.tenant_sku_code
from public.material_master material
where sku.material_sku_code is null
  and lower(trim(sku.makuku_sku_name)) = lower(trim(material.tenant_sku_name))
  and sku.piece_count = material.pack_count;

with ranked_matches as (
  select distinct on (competitor_product_id)
    competitor_product_id,
    sku_master_id
  from public.sku_matches
  order by competitor_product_id, reviewed desc, created_at desc
)
update public.price_snapshots snapshot
set sku_master_id = ranked_matches.sku_master_id
from ranked_matches
where snapshot.sku_master_id is null
  and snapshot.competitor_product_id = ranked_matches.competitor_product_id;

with approved_material_candidates as (
  select
    candidate.price_snapshot_id,
    sku.id as sku_master_id
  from public.ai_price_candidates candidate
  join public.sku_master sku
    on sku.material_sku_code = candidate.matched_entity_id
  where candidate.status = 'approved'
    and candidate.matched_entity_type = 'material_master'
    and candidate.price_snapshot_id is not null
    and candidate.matched_entity_id is not null
)
update public.price_snapshots snapshot
set sku_master_id = approved_material_candidates.sku_master_id
from approved_material_candidates
where snapshot.id = approved_material_candidates.price_snapshot_id
  and snapshot.sku_master_id is null;
