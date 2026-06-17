-- Store visit readable batch code: STYYYYMMDDNNNN.
-- Candidate key makes repeated AI analysis idempotent per visit.

alter table public.offline_store_visits
  add column if not exists visit_code text;

with numbered as (
  select
    id,
    format(
      'ST%s%s',
      to_char(coalesce(visit_date, created_at::date), 'YYYYMMDD'),
      lpad(row_number() over (
        partition by coalesce(visit_date, created_at::date)
        order by created_at, id
      )::text, 4, '0')
    ) as generated_visit_code
  from public.offline_store_visits
  where visit_code is null
)
update public.offline_store_visits v
set visit_code = numbered.generated_visit_code
from numbered
where v.id = numbered.id;

create unique index if not exists idx_offline_store_visits_visit_code_unique
  on public.offline_store_visits(visit_code)
  where visit_code is not null;

create or replace function public.generate_offline_store_visit_code()
returns trigger
language plpgsql
as $$
declare
  code_date date;
  code_prefix text;
  next_sequence integer;
begin
  if new.visit_code is not null and btrim(new.visit_code) <> '' then
    new.visit_code := upper(btrim(new.visit_code));
    return new;
  end if;

  code_date := coalesce(new.visit_date, new.created_at::date, current_date);
  code_prefix := 'ST' || to_char(code_date, 'YYYYMMDD');

  select coalesce(max(substring(visit_code from 11 for 4)::integer), 0) + 1
    into next_sequence
  from public.offline_store_visits
  where visit_code like code_prefix || '____';

  new.visit_code := code_prefix || lpad(next_sequence::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_generate_offline_store_visit_code on public.offline_store_visits;
create trigger trg_generate_offline_store_visit_code
before insert on public.offline_store_visits
for each row
execute function public.generate_offline_store_visit_code();

alter table public.ai_price_candidates
  add column if not exists candidate_key text;

update public.ai_price_candidates
set candidate_key = concat_ws(
  '|',
  regexp_replace(lower(coalesce(raw_brand, '')), '[^a-z0-9]+', ' ', 'g'),
  regexp_replace(lower(coalesce(raw_product, '')), '[^a-z0-9]+', ' ', 'g'),
  regexp_replace(lower(coalesce(raw_price, '')), '[^a-z0-9]+', ' ', 'g'),
  coalesce(piece_count::text, ''),
  coalesce(candidate_type, '')
)
where candidate_key is null;

with duplicate_non_approved as (
  select id
  from (
    select
      id,
      row_number() over (
        partition by visit_id, candidate_key
        order by created_at desc, id desc
      ) as duplicate_rank
    from public.ai_price_candidates
    where candidate_key is not null
      and status <> 'approved'
  ) ranked
  where duplicate_rank > 1
)
delete from public.ai_price_candidates c
using duplicate_non_approved d
where c.id = d.id;

with duplicate_approved as (
  select id
  from (
    select
      id,
      row_number() over (
        partition by visit_id, candidate_key
        order by reviewed_at nulls last, created_at, id
      ) as duplicate_rank
    from public.ai_price_candidates
    where candidate_key is not null
      and status = 'approved'
  ) ranked
  where duplicate_rank > 1
)
delete from public.ai_price_candidates c
using duplicate_approved d
where c.id = d.id;

create unique index if not exists idx_ai_price_candidates_visit_candidate_key_active
  on public.ai_price_candidates(visit_id, candidate_key)
  where candidate_key is not null
    and status in ('pending', 'approved');

select pg_notify('pgrst', 'reload schema');
