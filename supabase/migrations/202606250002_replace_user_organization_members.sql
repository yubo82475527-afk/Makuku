create or replace function public.replace_user_organization_members(
  p_app_user_id uuid,
  p_organization_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.organization_members
  where app_user_id = p_app_user_id;

  if coalesce(array_length(p_organization_ids, 1), 0) = 0 then
    return;
  end if;

  insert into public.organization_members (organization_id, app_user_id, active)
  select organization_id, p_app_user_id, true
  from unnest(p_organization_ids) as organization_id;
end;
$$;

grant execute on function public.replace_user_organization_members(uuid, uuid[]) to authenticated, service_role;
