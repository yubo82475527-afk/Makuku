alter table public.price_quality_gate_evaluations
  drop constraint if exists price_quality_gate_evaluations_candidate_id_fkey;

alter table public.price_quality_gate_evaluations
  add constraint price_quality_gate_evaluations_candidate_id_fkey
  foreign key (candidate_id)
  references public.ai_price_candidates(id)
  on delete cascade;

select pg_notify('pgrst', 'reload schema');
