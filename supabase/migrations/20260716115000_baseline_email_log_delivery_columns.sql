-- Complete the historical email log shape before SendGrid delivery hardening.
-- Existing databases fail closed when the canonical delivery columns are absent.

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
      'metadata',
      'error_text',
      'provider_message_id'
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
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists error_text text,
  add column if not exists provider_message_id text;

update public.email_logs
set error_text = coalesce(error_text, error)
where error_text is null
  and error is not null;

create index if not exists email_logs_provider_message_idx
  on public.email_logs(provider_message_id)
  where provider_message_id is not null;
