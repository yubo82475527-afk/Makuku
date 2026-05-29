alter table public.ai_price_candidates
  add column if not exists piece_count integer,
  add column if not exists price_per_piece numeric,
  add column if not exists reviewed_piece_count integer,
  add column if not exists reviewed_price_per_piece numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_piece_count_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_piece_count_check
      check (piece_count is null or piece_count > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_price_per_piece_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_price_per_piece_check
      check (price_per_piece is null or price_per_piece >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_reviewed_piece_count_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_reviewed_piece_count_check
      check (reviewed_piece_count is null or reviewed_piece_count > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_reviewed_price_per_piece_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_reviewed_price_per_piece_check
      check (reviewed_price_per_piece is null or reviewed_price_per_piece >= 0);
  end if;
end;
$$;

create index if not exists idx_ai_price_candidates_price_per_piece
  on public.ai_price_candidates(price_per_piece);

notify pgrst, 'reload schema';
