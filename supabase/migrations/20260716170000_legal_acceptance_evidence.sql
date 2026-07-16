begin;

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid not null,
  shop_id uuid references public.shops(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  document_type text not null check (document_type in (
    'terms_of_service',
    'privacy_policy',
    'data_processing_addendum',
    'acceptable_use_policy',
    'cookie_notice',
    'portal_terms',
    'repair_authorization',
    'retention_notice',
    'subprocessor_notice',
    'support_policy'
  )),
  document_version text not null check (char_length(document_version) between 1 and 120),
  document_url text not null,
  surface text not null check (surface in (
    'shop_signup',
    'portal_activation',
    'repair_approval',
    'account_settings',
    'support'
  )),
  idempotency_key text not null unique,
  accepted_at timestamptz not null default now(),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances(subject_user_id, accepted_at desc);
create index if not exists legal_acceptances_shop_idx
  on public.legal_acceptances(shop_id, accepted_at desc)
  where shop_id is not null;
create index if not exists legal_acceptances_customer_idx
  on public.legal_acceptances(customer_id, accepted_at desc)
  where customer_id is not null;

alter table public.legal_acceptances enable row level security;

revoke all on table public.legal_acceptances from anon, authenticated;
grant select on table public.legal_acceptances to authenticated;

drop policy if exists "legal acceptances subject or shop managers read" on public.legal_acceptances;
create policy "legal acceptances subject or shop managers read"
on public.legal_acceptances for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = legal_acceptances.shop_id
      and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
  )
);

create or replace function public.record_legal_acceptances_atomic(
  p_actor_user_id uuid,
  p_shop_id uuid,
  p_customer_id uuid,
  p_surface text,
  p_documents jsonb,
  p_operation_key text,
  p_context jsonb default '{}'::jsonb,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document jsonb;
  v_type text;
  v_version text;
  v_url text;
  v_key text;
  v_count integer := 0;
  v_at timestamptz := coalesce(p_at, now());
begin
  if p_actor_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authenticated legal actor is required.';
  end if;
  if p_surface is null
     or p_surface not in ('shop_signup', 'portal_activation', 'repair_approval', 'account_settings', 'support') then
    raise exception using errcode = 'P0001', message = 'Unsupported legal acceptance surface.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null or char_length(p_operation_key) > 500 then
    raise exception using errcode = 'P0001', message = 'A bounded legal acceptance operation key is required.';
  end if;
  if p_documents is null
     or jsonb_typeof(p_documents) <> 'array'
     or jsonb_array_length(p_documents) < 1
     or jsonb_array_length(p_documents) > 10 then
    raise exception using errcode = 'P0001', message = 'One to ten legal documents are required.';
  end if;
  if jsonb_typeof(coalesce(p_context, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_context, '{}'::jsonb)::text) > 50000 then
    raise exception using errcode = 'P0001', message = 'Legal acceptance context is invalid or too large.';
  end if;
  if p_shop_id is not null and not exists (select 1 from public.shops s where s.id = p_shop_id) then
    raise exception using errcode = 'P0001', message = 'Legal acceptance shop scope is invalid.';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id
      and (p_shop_id is null or c.shop_id = p_shop_id)
  ) then
    raise exception using errcode = 'P0001', message = 'Legal acceptance customer scope is invalid.';
  end if;

  for v_document in select value from jsonb_array_elements(p_documents)
  loop
    v_type := trim(coalesce(v_document->>'type', ''));
    v_version := trim(coalesce(v_document->>'version', ''));
    if v_version = '' or char_length(v_version) > 120 then
      raise exception using errcode = 'P0001', message = 'Legal document version is invalid.';
    end if;

    v_url := case v_type
      when 'terms_of_service' then '/legal/terms'
      when 'privacy_policy' then '/legal/privacy'
      when 'data_processing_addendum' then '/legal/data-processing-addendum'
      when 'acceptable_use_policy' then '/legal/acceptable-use'
      when 'cookie_notice' then '/legal/cookies'
      when 'portal_terms' then '/legal/portal-terms'
      when 'repair_authorization' then '/legal/repair-authorization'
      when 'retention_notice' then '/legal/retention'
      when 'subprocessor_notice' then '/legal/subprocessors'
      when 'support_policy' then '/legal/support'
      else null
    end;
    if v_url is null then
      raise exception using errcode = 'P0001', message = 'Unsupported legal document type.';
    end if;

    v_key := trim(p_operation_key) || ':' || v_type || ':' || v_version;
    insert into public.legal_acceptances(
      user_id,
      subject_user_id,
      shop_id,
      customer_id,
      document_type,
      document_version,
      document_url,
      surface,
      idempotency_key,
      accepted_at,
      context
    ) values (
      p_actor_user_id,
      p_actor_user_id,
      p_shop_id,
      p_customer_id,
      v_type,
      v_version,
      v_url,
      p_surface,
      v_key,
      v_at,
      coalesce(p_context, '{}'::jsonb)
    )
    on conflict (idempotency_key) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'recorded', v_count,
    'surface', p_surface,
    'accepted_at', v_at
  );
end;
$$;

revoke all on function public.record_legal_acceptances_atomic(uuid, uuid, uuid, text, jsonb, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.record_legal_acceptances_atomic(uuid, uuid, uuid, text, jsonb, text, jsonb, timestamptz) to service_role;

create or replace function public.capture_shop_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acceptance jsonb := new.raw_user_meta_data->'profixiq_legal_acceptance';
  v_version constant text := '2026-07-16-draft.1';
begin
  if coalesce(new.raw_user_meta_data->>'profixiq_account_kind', '') <> 'shop_owner_signup' then
    return new;
  end if;
  if coalesce((v_acceptance->>'accepted')::boolean, false) is not true
     or v_acceptance->>'surface' <> 'shop_signup'
     or jsonb_typeof(v_acceptance->'documents') <> 'array' then
    raise exception using errcode = 'P0001', message = 'Current shop signup legal documents must be accepted.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_acceptance->'documents') d
    where d->>'type' = 'terms_of_service' and d->>'version' = v_version
  ) or not exists (
    select 1 from jsonb_array_elements(v_acceptance->'documents') d
    where d->>'type' = 'privacy_policy' and d->>'version' = v_version
  ) or not exists (
    select 1 from jsonb_array_elements(v_acceptance->'documents') d
    where d->>'type' = 'data_processing_addendum' and d->>'version' = v_version
  ) then
    raise exception using errcode = 'P0001', message = 'Current shop signup legal document versions must be accepted.';
  end if;

  perform public.record_legal_acceptances_atomic(
    new.id,
    null,
    null,
    'shop_signup',
    jsonb_build_array(
      jsonb_build_object('type', 'terms_of_service', 'version', v_version),
      jsonb_build_object('type', 'privacy_policy', 'version', v_version),
      jsonb_build_object('type', 'data_processing_addendum', 'version', v_version)
    ),
    new.id::text || ':shop-signup:' || v_version,
    jsonb_build_object('source', 'auth_signup_metadata'),
    now()
  );
  return new;
end;
$$;

drop trigger if exists capture_shop_signup_legal_acceptance on auth.users;
create trigger capture_shop_signup_legal_acceptance
after insert on auth.users
for each row execute function public.capture_shop_signup_legal_acceptance();

create or replace function public.accept_customer_portal_invite_with_legal_atomic(
  p_invite_id uuid,
  p_actor_user_id uuid,
  p_actor_email text,
  p_operation_key text,
  p_portal_terms_version text,
  p_privacy_version text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_version constant text := '2026-07-16-draft.1';
begin
  if p_portal_terms_version <> v_version or p_privacy_version <> v_version then
    raise exception using errcode = 'P0001', message = 'Current portal legal documents must be accepted.';
  end if;

  v_result := public.accept_customer_portal_invite_atomic(
    p_invite_id,
    p_actor_user_id,
    p_actor_email,
    p_operation_key,
    p_at
  );

  perform public.record_legal_acceptances_atomic(
    p_actor_user_id,
    (v_result->>'shop_id')::uuid,
    (v_result->>'customer_id')::uuid,
    'portal_activation',
    jsonb_build_array(
      jsonb_build_object('type', 'portal_terms', 'version', p_portal_terms_version),
      jsonb_build_object('type', 'privacy_policy', 'version', p_privacy_version)
    ),
    p_operation_key || ':legal',
    jsonb_build_object('invite_id', p_invite_id, 'portal_type', 'customer'),
    p_at
  );

  return v_result || jsonb_build_object('legal_recorded', true);
end;
$$;

revoke all on function public.accept_customer_portal_invite_with_legal_atomic(uuid, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.accept_customer_portal_invite_with_legal_atomic(uuid, uuid, text, text, text, text, timestamptz) to service_role;

create or replace function public.accept_fleet_portal_invite_with_legal_atomic(
  p_token_hash text,
  p_actor_user_id uuid,
  p_actor_email text,
  p_portal_terms_version text,
  p_privacy_version text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_version constant text := '2026-07-16-draft.1';
begin
  if p_portal_terms_version <> v_version or p_privacy_version <> v_version then
    raise exception using errcode = 'P0001', message = 'Current portal legal documents must be accepted.';
  end if;

  v_result := public.accept_fleet_portal_invite_atomic(
    p_token_hash,
    p_actor_user_id,
    p_actor_email,
    p_at
  );

  perform public.record_legal_acceptances_atomic(
    p_actor_user_id,
    (v_result->>'shop_id')::uuid,
    null,
    'portal_activation',
    jsonb_build_array(
      jsonb_build_object('type', 'portal_terms', 'version', p_portal_terms_version),
      jsonb_build_object('type', 'privacy_policy', 'version', p_privacy_version)
    ),
    'fleet-portal-invite:' || p_actor_user_id::text || ':' || p_token_hash || ':legal',
    jsonb_build_object('invite_id', v_result->>'invite_id', 'fleet_id', v_result->>'fleet_id', 'portal_type', 'fleet'),
    p_at
  );

  return v_result || jsonb_build_object('legal_recorded', true);
end;
$$;

revoke all on function public.accept_fleet_portal_invite_with_legal_atomic(text, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.accept_fleet_portal_invite_with_legal_atomic(text, uuid, text, text, text, timestamptz) to service_role;

create or replace function public.accept_property_portal_invite_with_legal_atomic(
  p_raw_token text,
  p_portal_terms_version text,
  p_privacy_version text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_result jsonb;
  v_invite public.property_portal_invites%rowtype;
  v_version constant text := '2026-07-16-draft.1';
begin
  if v_actor_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authentication is required.';
  end if;
  if p_portal_terms_version <> v_version or p_privacy_version <> v_version then
    raise exception using errcode = 'P0001', message = 'Current portal legal documents must be accepted.';
  end if;

  v_result := public.accept_property_portal_invite(p_raw_token);
  if coalesce((v_result->>'success')::boolean, (v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

  select *
  into v_invite
  from public.property_portal_invites i
  where i.id = nullif(v_result->>'invite_id', '')::uuid;

  if v_invite.id is null then
    raise exception using errcode = 'P0001', message = 'Accepted property invitation could not be resolved.';
  end if;

  perform public.record_legal_acceptances_atomic(
    v_actor_user_id,
    v_invite.shop_id,
    null,
    'portal_activation',
    jsonb_build_array(
      jsonb_build_object('type', 'portal_terms', 'version', p_portal_terms_version),
      jsonb_build_object('type', 'privacy_policy', 'version', p_privacy_version)
    ),
    'property-portal-invite:' || v_invite.id::text || ':' || v_actor_user_id::text || ':legal',
    jsonb_build_object(
      'invite_id', v_invite.id,
      'portfolio_id', v_invite.portfolio_id,
      'property_id', v_invite.property_id,
      'unit_id', v_invite.unit_id,
      'portal_type', 'property'
    ),
    now()
  );

  return v_result || jsonb_build_object('legal_recorded', true);
end;
$$;

revoke all on function public.accept_property_portal_invite_with_legal_atomic(text, text, text) from public, anon;
grant execute on function public.accept_property_portal_invite_with_legal_atomic(text, text, text) to authenticated, service_role;

create or replace function public.apply_customer_quote_decision_with_legal_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[],
  p_decision text,
  p_decline_remaining boolean,
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz,
  p_repair_authorization_version text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_snapshot jsonb;
  v_authorized_total numeric := 0;
  v_currency text := 'CAD';
  v_version constant text := '2026-07-16-draft.1';
begin
  if lower(trim(coalesce(p_decision, ''))) <> 'approve' then
    raise exception using errcode = 'P0001', message = 'Repair authorization evidence applies only to approval decisions.';
  end if;
  if p_repair_authorization_version <> v_version then
    raise exception using errcode = 'P0001', message = 'Current electronic repair authorization terms must be accepted.';
  end if;

  v_result := public.apply_customer_quote_decision_atomic(
    p_shop_id,
    p_work_order_id,
    p_quote_line_ids,
    p_decision,
    p_decline_remaining,
    p_customer_id,
    p_actor_user_id,
    p_operation_key,
    p_at
  );

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'quote_line_id', q.id,
      'description', q.description,
      'labor_total', q.labor_total,
      'parts_total', q.parts_total,
      'subtotal', q.subtotal,
      'tax_total', q.tax_total,
      'grand_total', q.grand_total
    ) order by q.id), '[]'::jsonb),
    coalesce(sum(coalesce(q.grand_total, q.subtotal, coalesce(q.labor_total, 0) + coalesce(q.parts_total, 0))), 0)
  into v_snapshot, v_authorized_total
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.id = any(p_quote_line_ids);

  select upper(coalesce(nullif(s.stripe_default_currency, ''), 'CAD'))
  into v_currency
  from public.shops s
  where s.id = p_shop_id;

  perform public.record_legal_acceptances_atomic(
    p_actor_user_id,
    p_shop_id,
    p_customer_id,
    'repair_approval',
    jsonb_build_array(
      jsonb_build_object('type', 'repair_authorization', 'version', p_repair_authorization_version)
    ),
    p_operation_key || ':legal',
    jsonb_build_object(
      'work_order_id', p_work_order_id,
      'quote_line_ids', to_jsonb(p_quote_line_ids),
      'quote_snapshot', v_snapshot,
      'authorized_total', v_authorized_total,
      'currency', coalesce(v_currency, 'CAD'),
      'decline_remaining', coalesce(p_decline_remaining, false),
      'approval_result', v_result
    ),
    p_at
  );

  return v_result || jsonb_build_object('legal_recorded', true);
end;
$$;

revoke all on function public.apply_customer_quote_decision_with_legal_atomic(uuid, uuid, uuid[], text, boolean, uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_customer_quote_decision_with_legal_atomic(uuid, uuid, uuid[], text, boolean, uuid, uuid, text, timestamptz, text) to service_role;

notify pgrst, 'reload schema';

commit;
