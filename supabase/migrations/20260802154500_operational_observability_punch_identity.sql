begin;

create or replace function private.capture_operational_punch_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_profile_id uuid;
  v_actor_user_id uuid;
  v_actor_role text;
  v_event_type text;
  v_idempotency_key text;
begin
  select p.shop_id, p.id, p.role
    into v_shop_id, v_profile_id, v_actor_role
  from public.profiles p
  where (new.profile_id is not null and p.id = new.profile_id)
     or (new.user_id is not null and p.user_id = new.user_id)
  order by (p.id = new.profile_id) desc
  limit 1;

  if v_shop_id is null then
    raise exception using
      errcode = '23502',
      message = 'Unable to resolve punch-event shop identity';
  end if;

  v_actor_user_id := coalesce(new.user_id, new.profile_id, auth.uid());
  v_event_type := 'workforce.punch.' || coalesce(
    private.operational_event_slug(new.event_type),
    'recorded'
  );
  v_idempotency_key := concat_ws(
    ':',
    'punch_events',
    new.id::text,
    v_event_type,
    coalesce(new.timestamp::text, new.created_at::text, transaction_timestamp()::text)
  );

  perform private.append_operational_event(
    v_shop_id,
    v_event_type,
    coalesce(new.timestamp, new.created_at, now()),
    v_actor_user_id,
    v_actor_role,
    'punch_event',
    new.id,
    'profile',
    v_profile_id,
    v_profile_id,
    null,
    v_idempotency_key,
    'database_trigger:punch_events',
    'info',
    jsonb_strip_nulls(jsonb_build_object(
      'operation', 'insert',
      'table', 'punch_events',
      'profile_id', v_profile_id,
      'auth_user_id', new.user_id,
      'shift_id', new.shift_id,
      'note_present', nullif(btrim(coalesce(new.note, '')), '') is not null,
      'schema_version', 1
    ))
  );

  perform private.resolve_operational_event_failure(
    v_shop_id,
    v_event_type,
    'punch_event',
    new.id,
    'punch_events'
  );

  return new;
exception
  when others then
    begin
      perform private.record_operational_event_failure(
        v_shop_id,
        v_event_type,
        'punch_event',
        new.id,
        'punch_events',
        sqlstate,
        sqlerrm,
        jsonb_strip_nulls(jsonb_build_object(
          'operation', 'insert',
          'profile_id', new.profile_id,
          'auth_user_id', new.user_id,
          'shift_id', new.shift_id
        ))
      );
    exception
      when others then
        null;
    end;
    return new;
end;
$$;

revoke all on function private.capture_operational_punch_event()
  from public, anon, authenticated;

drop trigger if exists trg_operational_event_punches on public.punch_events;
create trigger trg_operational_event_punches
after insert on public.punch_events
for each row execute function private.capture_operational_punch_event();

comment on function private.capture_operational_punch_event() is
  'Captures canonical workforce punch events while resolving either profile_id or auth user_id without mutating the punch record.';

commit;
