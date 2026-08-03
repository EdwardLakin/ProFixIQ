-- Complete profile fields referenced by inspection signature hardening before its
-- explicit authenticated-column grant and authorization guard are installed.

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
      'avatar_url',
      'must_change_password',
      'username',
      'tech_signature_hash',
      'tech_signature_path',
      'tech_signature_updated_at',
      'organization_id',
      'agent_role'
    ]::text[]) as required(required_column)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'profiles'
        and c.column_name = required.required_column
    );

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: profile self-service/authorization columns are missing: '
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

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists username text,
  add column if not exists tech_signature_hash text,
  add column if not exists tech_signature_path text,
  add column if not exists tech_signature_updated_at timestamptz,
  add column if not exists organization_id uuid,
  add column if not exists agent_role text;

create unique index if not exists profiles_username_uidx
  on public.profiles(lower(username))
  where username is not null and btrim(username) <> '';
