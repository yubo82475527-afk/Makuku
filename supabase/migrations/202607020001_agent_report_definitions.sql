alter table public.agent_reports
  add column if not exists report_definition_code text,
  add column if not exists report_family text,
  add column if not exists definition_name text,
  add column if not exists template_version integer not null default 1;

update public.agent_reports
set report_definition_code = case
  when report_type = 'daily' and scope_type = 'organization' then 'daily_price_organization'
  when report_type = 'daily' then 'daily_price_country'
  when report_type = 'weekly' and scope_type = 'organization' then 'weekly_price_organization'
  when report_type = 'weekly' then 'weekly_price_management'
  when report_type = 'monthly' then 'monthly_price_country_summary'
  else report_definition_code
end
where report_definition_code is null;

update public.agent_reports
set report_family = coalesce(report_family, report_type)
where report_family is null;

alter table public.agent_report_subscriptions
  add column if not exists report_definition_code text,
  add column if not exists report_family text;

update public.agent_report_subscriptions
set report_definition_code = case
  when report_type = 'daily' and scope_type = 'organization' then 'daily_price_organization'
  when report_type = 'daily' then 'daily_price_country'
  when report_type = 'weekly' and scope_type = 'organization' then 'weekly_price_organization'
  when report_type = 'weekly' then 'weekly_price_management'
  when report_type = 'monthly' then 'monthly_price_country_summary'
  else report_definition_code
end
where report_definition_code is null;

update public.agent_report_subscriptions
set report_family = coalesce(report_family, report_type)
where report_family is null;
