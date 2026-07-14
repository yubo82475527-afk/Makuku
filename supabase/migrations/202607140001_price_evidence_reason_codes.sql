alter table public.ai_price_candidates
  add column if not exists price_evidence_reason_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_price_candidates_price_evidence_reason_code_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_price_evidence_reason_code_check
      check (
        price_evidence_reason_code is null
        or price_evidence_reason_code in (
          'PRODUCT_PRICE_BINDING_UNCLEAR',
          'PRICE_TAG_UNCLEAR',
          'PIECE_COUNT_UNCLEAR',
          'PRICE_MATH_CONFLICT',
          'PRICE_DERIVED',
          'LEGACY_EVIDENCE_UNAVAILABLE'
        )
      );
  end if;
end;
$$;
