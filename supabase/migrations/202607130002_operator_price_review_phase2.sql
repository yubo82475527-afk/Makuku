alter table public.price_snapshots
  add column if not exists piece_count integer;

with resolved_piece_counts as (
  select
    snapshot.id,
    coalesce(product.piece_count, sku.piece_count, material.pack_count) as piece_count
  from public.price_snapshots snapshot
  left join public.competitor_products product
    on product.id = snapshot.competitor_product_id
  left join public.sku_master sku
    on sku.id = snapshot.sku_master_id
  left join public.material_master material
    on material.tenant_sku_code = coalesce(snapshot.material_sku_code, sku.material_sku_code)
)
update public.price_snapshots snapshot
set piece_count = resolved.piece_count
from resolved_piece_counts resolved
where snapshot.id = resolved.id
  and snapshot.piece_count is null
  and resolved.piece_count > 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'price_snapshots_piece_count_check'
      and conrelid = 'public.price_snapshots'::regclass
  ) then
    alter table public.price_snapshots
      add constraint price_snapshots_piece_count_check
      check (piece_count is null or piece_count > 0);
  end if;
end;
$$;

create or replace function public.normalize_price_snapshot()
returns trigger
language plpgsql
as $$
declare
  product_piece_count integer;
begin
  select coalesce(product.piece_count, sku.piece_count, material.pack_count)
    into product_piece_count
  from (select new.competitor_product_id, new.sku_master_id, new.material_sku_code) snapshot
  left join public.competitor_products product
    on product.id = snapshot.competitor_product_id
  left join public.sku_master sku
    on sku.id = snapshot.sku_master_id
  left join public.material_master material
    on material.tenant_sku_code = coalesce(snapshot.material_sku_code, sku.material_sku_code);

  new.package_price_idr := coalesce(new.package_price_idr, new.promo_price_idr, new.list_price_idr, new.net_price_idr, 0);
  new.promo_price_idr := coalesce(new.promo_price_idr, new.package_price_idr);
  new.net_price_idr := coalesce(
    new.net_price_idr,
    greatest(coalesce(new.package_price_idr, 0) - coalesce(new.voucher_value_idr, 0) - coalesce(new.shipping_subsidy_idr, 0), 0)
  );
  new.piece_count := coalesce(new.piece_count, product_piece_count);

  if new.price_per_piece is null and new.piece_count is not null and new.piece_count > 0 then
    new.price_per_piece := round(new.net_price_idr / new.piece_count, 4);
  end if;

  return new;
end;
$$;

create or replace function public.reject_ai_price_candidate_with_quality_gate(
  p_candidate_id uuid,
  p_review_token text,
  p_reason text,
  p_reviewer text,
  p_review_job_id uuid,
  p_review_method text,
  p_require_terminal_quality boolean,
  p_h5_lifecycle_status text
)
returns table (candidate_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.ai_price_candidates%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if p_review_method not in ('bulk_manual', 'manual') then
    raise exception 'invalid review method';
  end if;
  if v_reason = '' then
    raise exception 'Rejection reason is required';
  end if;
  if p_h5_lifecycle_status is not null and p_h5_lifecycle_status <> 'deleted' then
    raise exception 'Invalid H5 lifecycle status';
  end if;

  select candidate.*
  into v_candidate
  from public.ai_price_candidates candidate
  where candidate.id = p_candidate_id
  for update of candidate;

  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_candidate.status <> 'pending' then
    raise exception 'Only pending candidates can be rejected';
  end if;
  if v_candidate.candidate_type <> 'SKU' then
    raise exception 'Only SKU candidates can be reviewed';
  end if;
  if coalesce(v_candidate.h5_lifecycle_status, '') in ('deleted', 'replaced', 'reanalyzed') then
    raise exception 'Inactive candidates cannot be reviewed';
  end if;
  if nullif(p_review_token, '') is null
    or v_candidate.approval_input_fingerprint is distinct from p_review_token
  then
    raise exception 'Candidate inputs changed; reload before reviewing.';
  end if;
  if p_require_terminal_quality then
    if not (
      v_candidate.quality_gate_status in ('REVIEW_REQUIRED', 'INSUFFICIENT_BENCHMARK')
      or (
        v_candidate.quality_gate_status = 'FAILED'
        and v_candidate.quality_gate_attempt_count >= 3
      )
    ) then
      raise exception 'Candidate is not ready for operator review.';
    end if;
    if v_candidate.quality_gate_input_fingerprint is distinct from v_candidate.approval_input_fingerprint then
      raise exception 'Candidate quality result is stale; reload after re-evaluation.';
    end if;
  end if;
  update public.ai_price_candidates candidate
  set
    status = 'rejected',
    price_snapshot_id = null,
    rejection_reason = v_reason,
    reviewed_at = now(),
    reviewed_by = p_reviewer,
    review_job_id = p_review_job_id,
    review_method = p_review_method,
    h5_lifecycle_status = p_h5_lifecycle_status,
    h5_lifecycle_at = case when p_h5_lifecycle_status is not null then now() else null end,
    review_decision = 'NEED_REVIEW',
    quality_gate_worker_id = null,
    quality_gate_claimed_at = null,
    auto_approval_status = 'NOT_REQUIRED',
    auto_approval_worker_id = null,
    auto_approval_claimed_at = null,
    auto_approval_error = null
  where candidate.id = v_candidate.id;

  return query select v_candidate.id;
end;
$$;

create or replace function public.approve_ai_price_candidate_with_quality_gate(
  p_candidate_id uuid,
  p_review_token text,
  p_price_idr numeric,
  p_piece_count integer,
  p_promo_type text,
  p_matched_entity_type text,
  p_matched_entity_id text,
  p_matched_label text,
  p_reviewer text,
  p_review_job_id uuid,
  p_review_method text,
  p_auto_approval_worker_id text
)
returns table (candidate_id uuid, snapshot_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.ai_price_candidates%rowtype;
  v_material public.material_master%rowtype;
  v_offline_store_id uuid;
  v_visit_date date;
  v_competitor_product_id uuid;
  v_sku_master_id uuid;
  v_material_sku_code text;
  v_matched_entity_type text;
  v_matched_entity_id text;
  v_matched_label text;
  v_net_price numeric;
  v_list_price numeric;
  v_package_price numeric;
  v_piece_count integer;
  v_price_per_piece numeric;
  v_promo_type text;
  v_snapshot_id uuid;
  v_pack_type text;
  v_size text;
  v_segment text;
  v_target_price numeric;
  v_product_correction_allowed boolean;
  v_snapshot_piece_count integer;
  v_snapshot_price_per_piece numeric;
begin
  if p_review_method not in ('auto_rule', 'bulk_manual', 'manual') then
    raise exception 'invalid review method';
  end if;

  select candidate.*
  into v_candidate
  from public.ai_price_candidates candidate
  where candidate.id = p_candidate_id
  for update of candidate;

  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_candidate.status <> 'pending' then
    raise exception 'Only pending candidates can be approved';
  end if;
  if v_candidate.candidate_type <> 'SKU' then
    raise exception 'Only SKU candidates can be reviewed';
  end if;
  if coalesce(v_candidate.h5_lifecycle_status, '') in ('deleted', 'replaced', 'reanalyzed') then
    raise exception 'Inactive candidates cannot be reviewed';
  end if;
  if nullif(p_review_token, '') is null
    or v_candidate.approval_input_fingerprint is distinct from p_review_token
  then
    raise exception 'Candidate inputs changed; reload before reviewing.';
  end if;

  if p_review_method in ('auto_rule', 'bulk_manual') then
    if v_candidate.quality_gate_status <> 'PASSED'
      or v_candidate.quality_gate_input_fingerprint is distinct from v_candidate.approval_input_fingerprint
      or v_candidate.evidence_review_decision <> 'AUTO_APPROVE'
      or v_candidate.review_decision <> 'AUTO_APPROVE'
      or v_candidate.match_score < 0.9
      or v_candidate.matched_entity_id is null
      or v_candidate.matched_entity_type = 'unmatched'
      or coalesce(jsonb_array_length(v_candidate.warnings), 0) > 0
      or coalesce(jsonb_array_length(v_candidate.conflicts), 0) > 0
    then
      raise exception 'Historical price quality gate has not passed for the current inputs.';
    end if;
    if p_review_method = 'auto_rule'
      and (
        v_candidate.auto_approval_status <> 'PROCESSING'
        or v_candidate.auto_approval_worker_id is distinct from p_auto_approval_worker_id
      )
    then
      raise exception 'Automatic approval ownership lost.';
    end if;
  elsif p_review_method = 'manual' then
    if not (
      v_candidate.quality_gate_status in ('REVIEW_REQUIRED', 'INSUFFICIENT_BENCHMARK')
      or (
        v_candidate.quality_gate_status = 'FAILED'
        and v_candidate.quality_gate_attempt_count >= 3
      )
    ) then
      raise exception 'Candidate is not ready for operator review.';
    end if;
    if v_candidate.quality_gate_input_fingerprint is distinct from v_candidate.approval_input_fingerprint then
      raise exception 'Candidate quality result is stale; reload after re-evaluation.';
    end if;
  end if;

  if p_price_idr is null or p_price_idr <= 0 then
    raise exception 'Valid price is required';
  end if;
  if p_piece_count is null or p_piece_count <= 0 then
    raise exception 'Valid piece count is required';
  end if;

  if p_review_method in ('auto_rule', 'bulk_manual') then
    v_net_price := coalesce(v_candidate.net_price_idr, v_candidate.parsed_price_idr);
    v_piece_count := coalesce(v_candidate.reviewed_piece_count, v_candidate.piece_count);
    v_promo_type := nullif(trim(coalesce(v_candidate.promo_type, '')), '');
    v_matched_entity_type := v_candidate.matched_entity_type;
    v_matched_entity_id := v_candidate.matched_entity_id;
    v_matched_label := v_candidate.matched_label;
    v_price_per_piece := coalesce(
      nullif(v_candidate.visible_price_per_piece_idr, 0),
      nullif(v_candidate.reviewed_price_per_piece, 0),
      nullif(v_candidate.price_per_piece, 0),
      round(v_net_price / v_piece_count, 4)
    );

    if p_price_idr is distinct from v_net_price
      or p_piece_count is distinct from v_piece_count
      or nullif(trim(coalesce(p_promo_type, '')), '') is distinct from v_promo_type
      or p_matched_entity_type is distinct from v_matched_entity_type
      or p_matched_entity_id is distinct from v_matched_entity_id
    then
      raise exception 'Candidate inputs changed; reload before approving.';
    end if;
  elsif p_review_method = 'manual' then
    v_net_price := p_price_idr;
    v_piece_count := p_piece_count;
    v_promo_type := nullif(trim(coalesce(p_promo_type, '')), '');
    v_matched_entity_type := nullif(trim(coalesce(p_matched_entity_type, '')), '');
    v_matched_entity_id := nullif(trim(coalesce(p_matched_entity_id, '')), '');
    v_matched_label := nullif(trim(coalesce(p_matched_label, '')), '');
    v_price_per_piece := round(v_net_price / v_piece_count, 4);

    v_product_correction_allowed := v_candidate.matched_entity_type = 'unmatched'
      or v_candidate.matched_entity_id is null
      or v_candidate.match_score < 0.9
      or coalesce(v_candidate.quality_gate_reason_codes, '[]'::jsonb) ? 'SKU_MATCH_UNCERTAIN';
    if (
      v_matched_entity_type is distinct from v_candidate.matched_entity_type
      or v_matched_entity_id is distinct from v_candidate.matched_entity_id
    ) and not v_product_correction_allowed then
      raise exception 'Product match is already confident and cannot be changed from this review.';
    end if;
  end if;

  if v_matched_entity_type = 'material_master' then
    if v_matched_entity_id is null then
      raise exception 'Please match a product before approving this candidate';
    end if;

    select material.*
    into v_material
    from public.material_master material
    where material.tenant_sku_code = v_matched_entity_id;
    if not found then
      raise exception 'Makuku material SKU not found';
    end if;

    v_material_sku_code := v_material.tenant_sku_code;
    v_pack_type := case
      when lower(coalesce(v_material.type, '') || ' ' || coalesce(v_material.sub_category, '')) like '%pants%'
        or lower(coalesce(v_material.type, '') || ' ' || coalesce(v_material.sub_category, '')) like '%拉拉%'
        then 'pants'
      when lower(coalesce(v_material.type, '') || ' ' || coalesce(v_material.sub_category, '')) like '%tape%'
        or lower(coalesce(v_material.type, '') || ' ' || coalesce(v_material.sub_category, '')) like '%纸尿%'
        or lower(coalesce(v_material.type, '') || ' ' || coalesce(v_material.sub_category, '')) like '%diaper%'
        then 'tape'
      else 'unknown'
    end;
    v_size := coalesce(nullif(trim(v_material.sub_type), ''), 'unknown');
    v_segment := case
      when lower(coalesce(v_material.sub_brand, '') || ' ' || coalesce(v_material.tenant_sku_name, '') || ' '
        || coalesce(v_material.category, '') || ' ' || coalesce(v_material.sub_category, '') || ' ' || coalesce(v_material.type, '')) like '%adult%'
        then 'AD'
      when lower(coalesce(v_material.sub_brand, '') || ' ' || coalesce(v_material.tenant_sku_name, '')) similar to '%(eco|economy|value|basic)%'
        then 'BD Eco'
      when lower(coalesce(v_material.sub_brand, '') || ' ' || coalesce(v_material.tenant_sku_name, '')) similar to '%(mid|medium|comfort|premium|slim|air)%'
        then 'BD MID'
      else 'unknown'
    end;
    v_target_price := greatest(coalesce(v_material.pcs_price, 0), 1);

    select sku.id
    into v_sku_master_id
    from public.sku_master sku
    where sku.material_sku_code = v_material_sku_code
    limit 1
    for update of sku;

    if v_sku_master_id is null then
      select sku.id
      into v_sku_master_id
      from public.sku_master sku
      where sku.makuku_sku_name = v_material.tenant_sku_name
        and sku.pack_type = v_pack_type
        and sku.size = v_size
        and sku.piece_count = v_material.pack_count
      order by sku.created_at
      limit 1
      for update of sku;
    end if;

    if v_sku_master_id is null then
      insert into public.sku_master (
        material_sku_code,
        makuku_sku_name,
        pack_type,
        size,
        piece_count,
        segment,
        target_price_per_piece,
        floor_price_per_piece,
        gross_margin_rate,
        active
      ) values (
        v_material_sku_code,
        v_material.tenant_sku_name,
        v_pack_type,
        v_size,
        v_material.pack_count,
        v_segment,
        v_target_price,
        round(v_target_price * 0.9, 4),
        0.3,
        true
      )
      on conflict (material_sku_code) where material_sku_code is not null
      do update set
        makuku_sku_name = excluded.makuku_sku_name,
        pack_type = excluded.pack_type,
        size = excluded.size,
        piece_count = excluded.piece_count,
        segment = excluded.segment,
        target_price_per_piece = excluded.target_price_per_piece,
        floor_price_per_piece = excluded.floor_price_per_piece,
        active = true
      returning id into v_sku_master_id;
    else
      update public.sku_master sku
      set
        material_sku_code = v_material_sku_code,
        makuku_sku_name = v_material.tenant_sku_name,
        pack_type = v_pack_type,
        size = v_size,
        piece_count = v_material.pack_count,
        segment = v_segment,
        target_price_per_piece = v_target_price,
        floor_price_per_piece = round(v_target_price * 0.9, 4),
        active = true
      where sku.id = v_sku_master_id;
    end if;

    v_matched_label := coalesce(v_matched_label, v_material_sku_code || ' · ' || v_material.tenant_sku_name);
  elsif v_matched_entity_type = 'competitor_product' then
    begin
      v_competitor_product_id := v_matched_entity_id::uuid;
    exception when invalid_text_representation then
      raise exception 'Competitor product id is invalid';
    end;

    select coalesce(v_matched_label, product.normalized_name)
    into v_matched_label
    from public.competitor_products product
    where product.id = v_competitor_product_id;
    if not found then
      raise exception 'Competitor product not found';
    end if;
  else
    raise exception 'Please match a product before approving this candidate';
  end if;

  if (v_competitor_product_id is null) = (v_sku_master_id is null) then
    raise exception 'Exactly one product owner is required';
  end if;
  if v_candidate.source_image_id is null then
    raise exception 'AI price candidate is missing source_image_id and cannot create a price snapshot';
  end if;

  select visit.store_id, visit.visit_date
  into v_offline_store_id, v_visit_date
  from public.offline_store_visits visit
  where visit.id = v_candidate.visit_id;

  v_list_price := case when p_review_method = 'manual' then v_net_price else coalesce(v_candidate.list_price_idr, v_net_price) end;
  v_package_price := case when p_review_method = 'manual' then v_net_price else coalesce(v_candidate.package_price_idr, v_net_price) end;

  select snapshot.id
  into v_snapshot_id
  from public.price_snapshots snapshot
  where snapshot.source = 'offline_ai_confirmed'
    and snapshot.source_visit_id = v_candidate.visit_id
    and snapshot.source_image_id = v_candidate.source_image_id
    and snapshot.source_matched_entity_type = v_matched_entity_type
    and snapshot.source_matched_entity_id = v_matched_entity_id
    and snapshot.net_price_idr = v_net_price
  limit 1;

  if v_snapshot_id is null then
    insert into public.price_snapshots (
      competitor_product_id,
      sku_master_id,
      material_sku_code,
      offline_store_id,
      channel,
      list_price_idr,
      package_price_idr,
      promo_price_idr,
      voucher_value_idr,
      shipping_subsidy_idr,
      net_price_idr,
      piece_count,
      price_per_piece,
      promo_type,
      captured_at,
      source,
      source_visit_id,
      source_image_id,
      source_matched_entity_type,
      source_matched_entity_id,
      evidence_url
    ) values (
      v_competitor_product_id,
      v_sku_master_id,
      v_material_sku_code,
      v_offline_store_id,
      'offline',
      v_list_price,
      v_package_price,
      v_package_price,
      0,
      0,
      v_net_price,
      v_piece_count,
      v_price_per_piece,
      case
        when v_promo_type is null or lower(v_promo_type) in ('none', 'no activity', 'no promo', 'normal')
          then 'offline_ai_confirmed'
        else v_promo_type
      end,
      case
        when v_visit_date is not null then v_visit_date::timestamp at time zone 'Asia/Jakarta'
        else now()
      end,
      'offline_ai_confirmed',
      v_candidate.visit_id,
      v_candidate.source_image_id,
      v_matched_entity_type,
      v_matched_entity_id,
      null
    )
    on conflict do nothing
    returning id into v_snapshot_id;

    if v_snapshot_id is null then
      select snapshot.id
      into v_snapshot_id
      from public.price_snapshots snapshot
      where snapshot.source = 'offline_ai_confirmed'
        and snapshot.source_visit_id = v_candidate.visit_id
        and snapshot.source_image_id = v_candidate.source_image_id
        and snapshot.source_matched_entity_type = v_matched_entity_type
        and snapshot.source_matched_entity_id = v_matched_entity_id
        and snapshot.net_price_idr = v_net_price
      limit 1;
    end if;
  end if;

  if v_snapshot_id is null then
    raise exception 'Failed to create or resolve price snapshot';
  end if;

  select snapshot.piece_count, snapshot.price_per_piece
  into v_snapshot_piece_count, v_snapshot_price_per_piece
  from public.price_snapshots snapshot
  where snapshot.id = v_snapshot_id
  for update of snapshot;

  if v_snapshot_piece_count is distinct from v_piece_count
    or v_snapshot_price_per_piece is distinct from v_price_per_piece
  then
    raise exception 'Existing price snapshot facts differ from this review.';
  end if;

  update public.price_snapshots snapshot
  set offline_store_id = coalesce(snapshot.offline_store_id, v_offline_store_id)
  where snapshot.id = v_snapshot_id;

  update public.ai_price_candidates candidate
  set
    status = 'approved',
    parsed_price_idr = v_net_price,
    list_price_idr = v_list_price,
    package_price_idr = v_package_price,
    net_price_idr = v_net_price,
    promo_type = v_promo_type,
    piece_count = v_piece_count,
    price_per_piece = v_price_per_piece,
    reviewed_piece_count = v_piece_count,
    reviewed_price_per_piece = v_price_per_piece,
    matched_entity_type = v_matched_entity_type,
    matched_entity_id = v_matched_entity_id,
    matched_label = v_matched_label,
    match_score = 1,
    price_snapshot_id = v_snapshot_id,
    reviewed_at = now(),
    reviewed_by = p_reviewer,
    review_job_id = p_review_job_id,
    review_method = p_review_method,
    rejection_reason = null,
    auto_approval_status = case when p_review_method = 'auto_rule' then 'COMPLETED' else 'NOT_REQUIRED' end,
    auto_approval_worker_id = null,
    auto_approval_claimed_at = null,
    auto_approval_error = null
  where candidate.id = v_candidate.id;

  return query select v_candidate.id, v_snapshot_id;
end;
$$;

revoke all on function public.approve_ai_price_candidate_with_quality_gate(
  uuid, text, numeric, integer, text, text, text, text, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.reject_ai_price_candidate_with_quality_gate(
  uuid, text, text, text, uuid, text, boolean, text
) from public, anon, authenticated;

grant execute on function public.approve_ai_price_candidate_with_quality_gate(
  uuid, text, numeric, integer, text, text, text, text, text, uuid, text, text
) to service_role;
grant execute on function public.reject_ai_price_candidate_with_quality_gate(
  uuid, text, text, text, uuid, text, boolean, text
) to service_role;

drop function if exists public.approve_ai_price_candidate_with_quality_gate(
  uuid, text, numeric, integer, text, uuid, uuid, text, text, uuid, text, text
);
drop function if exists public.reject_ai_price_candidate_with_quality_gate(
  uuid, text, text, text, uuid, text, boolean
);
drop function if exists public.reject_ai_price_candidate_with_quality_gate(
  uuid, text, text, text, uuid, text
);
drop function if exists public.reject_ai_price_candidate_with_quality_gate(
  uuid, text, text, uuid, text
);

notify pgrst, 'reload schema';
