alter table public.agent_report_subscriptions
  add column if not exists app_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists feishu_user_id text,
  add column if not exists feishu_chat_id text,
  add column if not exists send_weekday smallint,
  add column if not exists send_day_of_month smallint;

update public.agent_report_subscriptions
set
  feishu_user_id = case when recipient_type = 'user' then recipient_id else null end,
  feishu_chat_id = case when recipient_type = 'chat' then recipient_id else null end
where recipient_id is not null
  and (feishu_user_id is null or feishu_chat_id is null);

drop index if exists uniq_agent_report_subscriptions_target;

alter table public.agent_report_subscriptions
  drop constraint if exists agent_report_subscriptions_schedule_check;

alter table public.agent_report_subscriptions
  add constraint agent_report_subscriptions_schedule_check
  check (
    timezone = 'Asia/Jakarta'
    and (
      (
        report_type = 'daily'
        and send_weekday is null
        and send_day_of_month is null
      )
      or (
        report_type = 'weekly'
        and send_weekday >= 1 and send_weekday <= 7
        and send_day_of_month is null
      )
      or (
        report_type = 'monthly'
        and send_weekday is null
        and send_day_of_month >= 1 and send_day_of_month <= 28
      )
    )
  );

alter table public.agent_report_subscriptions
  drop constraint if exists agent_report_subscriptions_recipient_check;

alter table public.agent_report_subscriptions
  add constraint agent_report_subscriptions_recipient_check
  check (
    (
      recipient_type = 'user'
      and feishu_user_id is not null
      and feishu_chat_id is null
    )
    or (
      recipient_type = 'chat'
      and feishu_chat_id is not null
      and feishu_user_id is null
      and app_user_id is null
    )
  );

alter table public.agent_report_subscriptions
  drop constraint if exists agent_report_subscriptions_scope_check;

alter table public.agent_report_subscriptions
  add constraint agent_report_subscriptions_scope_check
  check (
    (
      scope_type = 'global'
      and scope_id is null
    )
    or (
      scope_type in ('organization', 'user')
      and scope_id is not null
    )
  );

create unique index if not exists uniq_agent_report_subscriptions_target_v2
  on public.agent_report_subscriptions(
    report_type,
    scope_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    recipient_type,
    coalesce(app_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(feishu_user_id, ''),
    coalesce(feishu_chat_id, ''),
    send_time_local,
    coalesce(send_weekday, 0),
    coalesce(send_day_of_month, 0)
  );

alter table public.agent_report_subscriptions
  drop column if exists recipient_id;
