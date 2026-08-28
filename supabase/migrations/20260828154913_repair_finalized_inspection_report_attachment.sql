begin;

-- Report publication happens after sign_inspection_atomic has committed the
-- immutable signing cycle. Keep the finalized-evidence guard intact while
-- allowing this signer-, revision-, hash-, and path-bound RPC to attach only
-- the generated report metadata for that completed cycle.
create or replace function public.attach_signed_inspection_pdf_atomic(
  p_inspection_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_expected_sync_revision bigint,
  p_pdf_storage_path text,
  p_pdf_sha256 text,
  p_pdf_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.inspections%rowtype;
  v_expected_path text;
  v_actor_profile_id uuid;
  v_auth_user_id uuid := auth.uid();
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
  v_previous_sign_transition text :=
    current_setting('profixiq.inspection_sign', true);
begin
  if v_auth_user_id is null
     and current_user <> 'service_role'
     and v_jwt_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_auth_user_id is not null and v_auth_user_id <> p_actor_user_id then
    raise exception using errcode = '42501', message = 'Actor identity mismatch';
  end if;

  select * into target
  from public.inspections
  where id = p_inspection_id
    and work_order_line_id = p_work_order_line_id
    and is_canonical
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Inspection not found';
  end if;

  select p.id into v_actor_profile_id
  from public.profiles p
  where (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
    and p.shop_id = target.shop_id
  order by case when p.user_id = p_actor_user_id then 0 else 1 end
  limit 1;
  if v_actor_profile_id is null then
    raise exception using errcode = '42501', message = 'Forbidden';
  end if;

  if target.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'Inspection is missing its work order';
  end if;
  if target.sync_revision <> p_expected_sync_revision then
    raise exception using errcode = 'P0001', message = 'Saved inspection revision changed';
  end if;
  if not target.completed or not target.locked or target.is_draft then
    raise exception using errcode = 'P0001', message = 'Inspection must be signed and complete';
  end if;
  if p_pdf_sha256 is null or p_pdf_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INSPECTION_REPORT_HASH_INVALID';
  end if;

  if not exists (
    select 1
    from public.inspection_signatures s
    where s.inspection_id = target.id
      and s.signing_cycle = coalesce(target.signing_cycle, 0)
      and s.signed_sync_revision = p_expected_sync_revision
      and s.signed_by = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'Signing actor does not own current inspection evidence';
  end if;

  v_expected_path :=
    'shops/' || target.shop_id::text ||
    '/work_orders/' || target.work_order_id::text ||
    '/inspections/' || target.id::text ||
    '/line_' || target.work_order_line_id::text ||
    '_r' || p_expected_sync_revision::text ||
    '_' || p_pdf_sha256 || '.pdf';

  if p_pdf_storage_path is distinct from v_expected_path then
    raise exception using errcode = 'P0001', message = 'INSPECTION_REPORT_PATH_MISMATCH';
  end if;
  if p_pdf_url is distinct from
     '/api/inspections/' || target.id::text || '/report/pdf' then
    raise exception using errcode = 'P0001', message = 'INSPECTION_REPORT_URL_MISMATCH';
  end if;

  if target.pdf_storage_path is not null then
    if target.pdf_storage_path is distinct from p_pdf_storage_path
       or target.pdf_sha256 is distinct from p_pdf_sha256
       or target.pdf_url is distinct from p_pdf_url then
      raise exception using
        errcode = 'P0001',
        message = 'Inspection already has different immutable report evidence';
    end if;
    return jsonb_build_object('inspection_id', target.id, 'reused', true);
  end if;

  perform set_config('profixiq.inspection_sign', 'on', true);
  begin
    update public.inspections
    set pdf_storage_path = p_pdf_storage_path,
        pdf_sha256 = p_pdf_sha256,
        pdf_url = p_pdf_url
    where id = target.id;
  exception
    when others then
      perform set_config(
        'profixiq.inspection_sign',
        coalesce(v_previous_sign_transition, ''),
        true
      );
      raise;
  end;
  perform set_config(
    'profixiq.inspection_sign',
    coalesce(v_previous_sign_transition, ''),
    true
  );

  return jsonb_build_object('inspection_id', target.id, 'reused', false);
end;
$$;

revoke all on function public.attach_signed_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) from public, anon;
grant execute on function public.attach_signed_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) to authenticated, service_role;

commit;
