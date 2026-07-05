alter table public.ai_price_candidates
  alter column ai_confidence drop not null,
  add column if not exists legacy_confidence_fallback boolean not null default false,
  add column if not exists price_evidence_status text,
  add column if not exists price_evidence_confidence numeric,
  add column if not exists price_evidence_detail jsonb,
  add column if not exists conflicts jsonb not null default '[]'::jsonb,
  add column if not exists review_decision text not null default 'NEED_REVIEW';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_price_candidates_price_evidence_status_check'
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_price_evidence_status_check
      check (
        price_evidence_status is null
        or price_evidence_status in ('CLEAR','LOW_CONFIDENCE','DERIVED','CONFLICT','REVIEW_REQUIRED')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_price_candidates_review_decision_check'
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_review_decision_check
      check (review_decision in ('AUTO_APPROVE','NEED_REVIEW'));
  end if;
end $$;
