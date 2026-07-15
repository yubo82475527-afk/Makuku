alter table public.ai_price_candidates
  add column if not exists ai_match_rule_version text,
  add column if not exists ai_match_method text,
  add column if not exists ai_match_evidence jsonb not null default '{}'::jsonb;

alter table public.ai_price_candidates
  drop constraint if exists ai_price_candidates_ai_match_method_check;

alter table public.ai_price_candidates
  add constraint ai_price_candidates_ai_match_method_check
  check (
    ai_match_method is null
    or ai_match_method in ('EXACT_CODE', 'FULL_SIGNATURE', 'UNIQUE_SIGNATURE', 'UNMATCHED')
  );

