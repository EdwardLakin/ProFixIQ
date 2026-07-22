-- Restore the canonical email-log fields required by SendGrid delivery event
-- processing. Existing databases are validated and left unchanged.

do $$
declare
  v_mode text;
  v_missing text[];
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    select array_agg(required_column order by required_column)
      into v_missing
    from unnest(array[
      'created_by',
      'error_text',
      'metadata',
      'provider',
      'provider_message_id',
      'sent_at',
      'shop_id',
      'status',
      'subject',
      'template_id',
      'template_key',
      'to_email'
    ]::text[]) as required(required_column)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'email_logs'
        and c.column_name = required_column
    );

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: email_logs delivery columns are missing: '
          || array_to_string(v_missing, ', ');
    end if;
    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

alter table public.email_logs
  add column if not exists shop_id uuid references public.shops(id) on delete cascade,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists to_email text not null default '',
  add column if not exists subject text,
  add column if not exists template_id text,
  add column if not exists template_key text not null default '',
  add column if not exists provider text not null default 'sendgrid',
  add column if not exists provider_message_id text,
  add column if not exists status text not null default 'queued',
  add column if not exists error_text text,
  add column if not exists sent_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists email_logs_shop_created_idx
  on public.email_logs(shop_id, created_at desc);

create index if not exists email_logs_provider_message_idx
  on public.email_logs(provider, provider_message_id)
  where provider_message_id is not null;
