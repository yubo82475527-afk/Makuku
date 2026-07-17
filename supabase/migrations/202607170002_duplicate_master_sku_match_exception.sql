altSQLer table public.ai_price_candidates
  drop constraint if exists ai_price_candidates_ai_match_method_check;

alter table public.ai_price_candidates
  add constraint ai_price_candidates_ai_match_method_check
  check (
    ai_match_method is null
    or ai_match_method in ('EXACT_CODE', 'FULL_SIGNATURE', 'UNIQUE_SIGNATURE', 'MASTER_DATA_DUPLICATE', 'UNMATCHED')
  );

update public.ai_price_candidates
set ai_match_method = 'MASTER_DATA_DUPLICATE'
where ai_match_method = 'UNMATCHED'
  and ai_match_evidence ->> 'reason' in ('EXACT_CODE_NOT_UNIQUE', 'AMBIGUOUS_CANDIDATES');
