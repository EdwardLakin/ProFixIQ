begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Canonical identity and lifecycle metadata. Existing customer rows remain the
-- source of truth; archived and merged rows are retained permanently.
alter table public.customers
  add column if not exists identity_name text,
  add column if not exists identity_email text,
  add column if not exists identity_phone text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists merged_into_customer_id uuid references public.customers(id) on delete restrict,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references auth.users(id) on delete set null,
  add column if not exists merge_reason text;

alter table public.customers
  drop constraint if exists customers_archive_shape_check;
alter table public.customers
  add constraint customers_archive_shape_check check (
    (active and archived_at is null and archived_by is null and archive_reason is null)
    or (
      not active
      and archived_at is not null
      and length(btrim(coalesce(archive_reason, ''))) >= 3
    )
  ) not valid;

update public.customers
set archived_at = coalesce(updated_at, created_at, now()),
    archive_reason = coalesce(
      nullif(btrim(archive_reason), ''),
      'Legacy inactive customer account.'
    )
where not active
  and merged_into_customer_id is null;

alter table public.customers validate constraint customers_archive_shape_check;

alter table public.customers
  drop constraint if exists customers_merge_shape_check;
alter table public.customers
  add constraint customers_merge_shape_check check (
    (merged_into_customer_id is null and merged_at is null and merged_by is null and merge_reason is null)
    or (
      merged_into_customer_id is not null
      and merged_into_customer_id <> id
      and merged_at is not null
      and length(btrim(coalesce(merge_reason, ''))) >= 3
      and not active
    )
  ) not valid;
alter table public.customers validate constraint customers_merge_shape_check;

create or replace function private.normalize_customer_identity_text(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select nullif(lower(regexp_replace(btrim(p_value), '\s+', ' ', 'g')), '');
$$;

create or replace function private.normalize_customer_identity_phone(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select nullif(regexp_replace(p_value, '[^0-9]', '', 'g'), '');
$$;

revoke all on function private.normalize_customer_identity_text(text)
  from public, anon, authenticated, service_role;
revoke all on function private.normalize_customer_identity_phone(text)
  from public, anon, authenticated, service_role;

create or replace function private.set_customer_identity_keys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.identity_name := private.normalize_customer_identity_text(
    coalesce(
      nullif(new.business_name, ''),
      nullif(new.name, ''),
      nullif(concat_ws(' ', new.first_name, new.last_name), '')
    )
  );
  new.identity_email := private.normalize_customer_identity_text(new.email);
  new.identity_phone := private.normalize_customer_identity_phone(
    coalesce(nullif(new.phone, ''), new.phone_number)
  );
  return new;
end;
$$;

revoke all on function private.set_customer_identity_keys()
  from public, anon, authenticated, service_role;

update public.customers customer
set identity_name = private.normalize_customer_identity_text(
      coalesce(
        nullif(customer.business_name, ''),
        nullif(customer.name, ''),
        nullif(concat_ws(' ', customer.first_name, customer.last_name), '')
      )
    ),
    identity_email = private.normalize_customer_identity_text(customer.email),
    identity_phone = private.normalize_customer_identity_phone(
      coalesce(nullif(customer.phone, ''), customer.phone_number)
    );

drop trigger if exists set_customer_identity_keys_trigger on public.customers;
create trigger set_customer_identity_keys_trigger
before insert or update of
  name, business_name, first_name, last_name, email, phone, phone_number
on public.customers
for each row execute function private.set_customer_identity_keys();

create index if not exists customers_identity_name_idx
  on public.customers (shop_id, identity_name)
  where active and merged_into_customer_id is null and identity_name is not null;
create index if not exists customers_identity_email_idx
  on public.customers (shop_id, identity_email)
  where active and merged_into_customer_id is null and identity_email is not null;
create index if not exists customers_identity_phone_idx
  on public.customers (shop_id, identity_phone)
  where active and merged_into_customer_id is null and identity_phone is not null;
create index if not exists customers_merged_target_idx
  on public.customers (merged_into_customer_id)
  where merged_into_customer_id is not null;
create index if not exists vehicles_shop_normalized_vin_idx
  on public.vehicles (shop_id, upper(regexp_replace(vin, '[^A-Za-z0-9]', '', 'g')))
  where vin is not null;

create or replace function private.ensure_customer_settings_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shop_id is not null then
    insert into public.customer_settings(customer_id, shop_id, updated_at)
    values (new.id, new.shop_id, now())
    on conflict (customer_id) do update
    set shop_id = excluded.shop_id,
        updated_at = case
          when public.customer_settings.shop_id is distinct from excluded.shop_id
          then excluded.updated_at
          else public.customer_settings.updated_at
        end;
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_customer_settings_row()
  from public, anon, authenticated, service_role;

drop trigger if exists ensure_customer_settings_row_trigger on public.customers;
create trigger ensure_customer_settings_row_trigger
after insert or update of shop_id on public.customers
for each row execute function private.ensure_customer_settings_row();

-- Commercial controls extend the established one-to-one customer settings row.
alter table public.customer_settings
  add column if not exists shop_id uuid references public.shops(id) on delete cascade,
  add column if not exists primary_billing_contact_id uuid references public.customer_contacts(id) on delete set null,
  add column if not exists primary_approval_contact_id uuid references public.customer_contacts(id) on delete set null,
  add column if not exists po_required boolean not null default false,
  add column if not exists payment_terms text not null default 'due_on_receipt',
  add column if not exists payment_terms_days integer not null default 0,
  add column if not exists tax_exempt boolean not null default false,
  add column if not exists tax_exemption_reference text,
  add column if not exists account_status text not null default 'good_standing',
  add column if not exists account_hold_reason text,
  add column if not exists billing_notes text,
  add column if not exists customer_reference text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

update public.customer_settings settings
set shop_id = customer.shop_id
from public.customers customer
where customer.id = settings.customer_id
  and settings.shop_id is distinct from customer.shop_id;

alter table public.customer_settings
  drop constraint if exists customer_settings_payment_terms_check;
alter table public.customer_settings
  add constraint customer_settings_payment_terms_check check (
    payment_terms in (
      'due_on_receipt', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60', 'custom'
    )
  ) not valid;
alter table public.customer_settings
  drop constraint if exists customer_settings_payment_terms_days_check;
alter table public.customer_settings
  add constraint customer_settings_payment_terms_days_check check (
    payment_terms_days between 0 and 365
  ) not valid;
alter table public.customer_settings
  drop constraint if exists customer_settings_account_status_check;
alter table public.customer_settings
  add constraint customer_settings_account_status_check check (
    account_status in ('good_standing', 'credit_hold', 'account_hold')
  ) not valid;
alter table public.customer_settings
  drop constraint if exists customer_settings_hold_reason_check;
alter table public.customer_settings
  add constraint customer_settings_hold_reason_check check (
    account_status = 'good_standing'
    or length(btrim(coalesce(account_hold_reason, ''))) >= 3
  ) not valid;
alter table public.customer_settings
  drop constraint if exists customer_settings_tax_exemption_check;
alter table public.customer_settings
  add constraint customer_settings_tax_exemption_check check (
    not tax_exempt
    or length(btrim(coalesce(tax_exemption_reference, ''))) >= 2
  ) not valid;

alter table public.customer_settings validate constraint customer_settings_payment_terms_check;
alter table public.customer_settings validate constraint customer_settings_payment_terms_days_check;
alter table public.customer_settings validate constraint customer_settings_account_status_check;
alter table public.customer_settings validate constraint customer_settings_hold_reason_check;
alter table public.customer_settings validate constraint customer_settings_tax_exemption_check;

create index if not exists customer_settings_shop_customer_idx
  on public.customer_settings (shop_id, customer_id)
  where shop_id is not null;

create or replace function private.enforce_customer_settings_boundary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_shop_id uuid;
begin
  select customer.shop_id
    into v_customer_shop_id
  from public.customers customer
  where customer.id = new.customer_id;

  if not found then
    raise exception using errcode = '23503', message = 'Customer account not found.';
  end if;

  if new.shop_id is null then
    new.shop_id := v_customer_shop_id;
  elsif new.shop_id is distinct from v_customer_shop_id then
    raise exception using errcode = '23514', message = 'Customer settings must belong to the customer Shop.';
  end if;

  if new.primary_billing_contact_id is not null and not exists (
    select 1
    from public.customer_contacts contact
    where contact.id = new.primary_billing_contact_id
      and contact.customer_id = new.customer_id
      and contact.shop_id = new.shop_id
      and contact.active
  ) then
    raise exception using errcode = '23514', message = 'Billing contact must belong to this customer account.';
  end if;

  if new.primary_approval_contact_id is not null and not exists (
    select 1
    from public.customer_contacts contact
    where contact.id = new.primary_approval_contact_id
      and contact.customer_id = new.customer_id
      and contact.shop_id = new.shop_id
      and contact.active
  ) then
    raise exception using errcode = '23514', message = 'Approval contact must belong to this customer account.';
  end if;

  if new.account_status = 'good_standing' then
    new.account_hold_reason := null;
  end if;
  if not new.tax_exempt then
    new.tax_exemption_reference := null;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_customer_settings_boundary()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_customer_settings_boundary_trigger
  on public.customer_settings;
create trigger enforce_customer_settings_boundary_trigger
before insert or update of
  customer_id, shop_id, primary_billing_contact_id,
  primary_approval_contact_id, account_status, tax_exempt
on public.customer_settings
for each row execute function private.enforce_customer_settings_boundary();

-- Give every existing Shop customer the same canonical account-settings anchor.
-- Existing portal preferences are preserved; only the tenant key is reconciled.
insert into public.customer_settings(customer_id, shop_id, updated_at)
select customer.id, customer.shop_id, coalesce(customer.updated_at, customer.created_at, now())
from public.customers customer
where customer.shop_id is not null
on conflict (customer_id) do update
set shop_id = excluded.shop_id
where public.customer_settings.shop_id is distinct from excluded.shop_id;

create policy customer_settings_staff_select
on public.customer_settings for select to authenticated
using (shop_id is not null and public.is_staff_for_shop(shop_id));
create policy customer_settings_staff_insert
on public.customer_settings for insert to authenticated
with check (shop_id is not null and public.is_staff_for_shop(shop_id));
create policy customer_settings_staff_update
on public.customer_settings for update to authenticated
using (shop_id is not null and public.is_staff_for_shop(shop_id))
with check (shop_id is not null and public.is_staff_for_shop(shop_id));

-- Append-only merge history and private idempotency ledger.
create table if not exists public.customer_account_merges (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  source_customer_id uuid not null references public.customers(id) on delete restrict,
  target_customer_id uuid not null references public.customers(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  merged_by uuid not null references auth.users(id) on delete restrict,
  operation_key text not null check (length(btrim(operation_key)) between 1 and 200),
  moved_record_counts jsonb not null default '{}'::jsonb check (
    jsonb_typeof(moved_record_counts) = 'object'
  ),
  source_snapshot jsonb not null default '{}'::jsonb check (
    jsonb_typeof(source_snapshot) = 'object'
  ),
  target_snapshot jsonb not null default '{}'::jsonb check (
    jsonb_typeof(target_snapshot) = 'object'
  ),
  created_at timestamptz not null default now(),
  constraint customer_account_merges_distinct_accounts_check
    check (source_customer_id <> target_customer_id),
  unique (shop_id, operation_key),
  unique (source_customer_id)
);

create index if not exists customer_account_merges_target_idx
  on public.customer_account_merges (shop_id, target_customer_id, created_at desc);

alter table public.customer_account_merges enable row level security;
create policy customer_account_merges_staff_select
on public.customer_account_merges for select to authenticated
using (public.is_staff_for_shop(shop_id));
revoke all on table public.customer_account_merges
  from public, anon, authenticated;
grant select on table public.customer_account_merges to authenticated;
grant all on table public.customer_account_merges to service_role;

drop policy if exists "staff can delete customers in shop" on public.customers;
revoke delete on table public.customers from authenticated;

create table if not exists private.customer_account_operations (
  shop_id uuid not null references public.shops(id) on delete cascade,
  operation_key text not null,
  operation_type text not null check (
    operation_type in ('create', 'update_controls', 'archive', 'merge')
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (shop_id, operation_key)
);

revoke all on table private.customer_account_operations
  from public, anon, authenticated, service_role;

create or replace function private.customer_account_actor_role(
  p_shop_id uuid,
  p_actor_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.canonical_shop_membership_role(profile.role::text)
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
  order by case when profile.user_id = p_actor_user_id then 0 else 1 end
  limit 1;
$$;

revoke all on function private.customer_account_actor_role(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.find_customer_account_duplicates(
  p_shop_id uuid,
  p_name text default null,
  p_business_name text default null,
  p_email text default null,
  p_phone text default null,
  p_vin text default null,
  p_exclude_customer_id uuid default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := coalesce(p_actor_user_id, (select auth.uid()));
  v_role text;
  v_name text := private.normalize_customer_identity_text(
    coalesce(nullif(p_business_name, ''), p_name)
  );
  v_email text := private.normalize_customer_identity_text(p_email);
  v_phone text := private.normalize_customer_identity_phone(p_phone);
  v_vin text := nullif(upper(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from v_actor_user_id) then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_ACTOR_MISMATCH';
  end if;

  v_role := private.customer_account_actor_role(p_shop_id, v_actor_user_id);
  if coalesce(v_role, '') not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'foreman',
    'mechanic', 'lead_hand', 'parts'
  ) then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_STAFF_ROLE_REQUIRED';
  end if;

  select coalesce(jsonb_agg(candidate order by score desc, display_name, id), '[]'::jsonb)
    into v_result
  from (
    select
      customer.id,
      coalesce(
        nullif(customer.business_name, ''),
        nullif(customer.name, ''),
        nullif(concat_ws(' ', customer.first_name, customer.last_name), ''),
        customer.email,
        customer.phone,
        'Customer'
      ) as display_name,
      customer.account_type,
      customer.email,
      coalesce(customer.phone, customer.phone_number) as phone,
      customer.active,
      array_remove(array[
        case when v_email is not null and customer.identity_email = v_email then 'email' end,
        case when v_phone is not null and customer.identity_phone = v_phone then 'phone' end,
        case when v_name is not null and customer.identity_name = v_name then 'name' end,
        case when v_vin is not null and exists (
          select 1
          from public.vehicles vehicle
          where vehicle.shop_id = p_shop_id
            and vehicle.customer_id = customer.id
            and upper(regexp_replace(coalesce(vehicle.vin, ''), '[^A-Za-z0-9]', '', 'g')) = v_vin
        ) then 'vin' end
      ], null) as reasons,
      (
        case when v_email is not null and customer.identity_email = v_email then 100 else 0 end
        + case when v_phone is not null and customer.identity_phone = v_phone then 90 else 0 end
        + case when v_vin is not null and exists (
            select 1
            from public.vehicles vehicle
            where vehicle.shop_id = p_shop_id
              and vehicle.customer_id = customer.id
              and upper(regexp_replace(coalesce(vehicle.vin, ''), '[^A-Za-z0-9]', '', 'g')) = v_vin
          ) then 120 else 0 end
        + case when v_name is not null and customer.identity_name = v_name then 40 else 0 end
      ) as score
    from public.customers customer
    where customer.shop_id = p_shop_id
      and customer.id is distinct from p_exclude_customer_id
      and customer.active
      and customer.merged_into_customer_id is null
      and (
        (v_email is not null and customer.identity_email = v_email)
        or (v_phone is not null and customer.identity_phone = v_phone)
        or (v_name is not null and customer.identity_name = v_name)
        or (
          v_vin is not null
          and exists (
            select 1
            from public.vehicles vehicle
            where vehicle.shop_id = p_shop_id
              and vehicle.customer_id = customer.id
              and upper(regexp_replace(coalesce(vehicle.vin, ''), '[^A-Za-z0-9]', '', 'g')) = v_vin
          )
        )
      )
    limit 25
  ) candidate;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.find_customer_account_duplicates(
  uuid, text, text, text, text, text, uuid, uuid
) from public, anon;
grant execute on function public.find_customer_account_duplicates(
  uuid, text, text, text, text, text, uuid, uuid
) to authenticated, service_role;

create or replace function public.create_customer_account_atomic(
  p_shop_id uuid,
  p_account_type text,
  p_name text,
  p_business_name text default null,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_city text default null,
  p_province text default null,
  p_postal_code text default null,
  p_notes text default null,
  p_vin text default null,
  p_match_existing boolean default false,
  p_allow_duplicate boolean default false,
  p_actor_user_id uuid default null,
  p_operation_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := coalesce(p_actor_user_id, (select auth.uid()));
  v_role text;
  v_account_type text := lower(btrim(coalesce(p_account_type, 'individual')));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_business_name text := nullif(btrim(coalesce(p_business_name, '')), '');
  v_email text := private.normalize_customer_identity_text(p_email);
  v_phone text := private.normalize_customer_identity_phone(p_phone);
  v_operation_key text := nullif(btrim(coalesce(p_operation_key, '')), '');
  v_existing_operation private.customer_account_operations%rowtype;
  v_exact_ids uuid[] := '{}'::uuid[];
  v_exact_customer public.customers%rowtype;
  v_duplicates jsonb := '[]'::jsonb;
  v_customer public.customers%rowtype;
  v_first_name text;
  v_last_name text;
  v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from v_actor_user_id) then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_ACTOR_MISMATCH';
  end if;

  v_role := private.customer_account_actor_role(p_shop_id, v_actor_user_id);
  if coalesce(v_role, '') not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'foreman',
    'mechanic', 'lead_hand', 'parts'
  ) then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_STAFF_ROLE_REQUIRED';
  end if;
  if v_account_type not in ('individual', 'business', 'fleet', 'enterprise') then
    raise exception using errcode = '22023', message = 'Unsupported customer account type.';
  end if;
  if v_name is null and v_business_name is null then
    raise exception using errcode = '22023', message = 'Customer or business name is required.';
  end if;
  if v_operation_key is null or length(v_operation_key) > 200 then
    raise exception using errcode = '22023', message = 'A valid customer operation key is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':' || coalesce(v_email, '') || ':' || coalesce(v_phone, '') || ':' || coalesce(v_name, v_business_name, ''),
    0
  ));

  select operation.*
    into v_existing_operation
  from private.customer_account_operations operation
  where operation.shop_id = p_shop_id
    and operation.operation_key = v_operation_key;
  if found then
    if v_existing_operation.operation_type <> 'create' then
      raise exception using errcode = '22023', message = 'CUSTOMER_ACCOUNT_OPERATION_KEY_CONFLICT';
    end if;
    return v_existing_operation.result || jsonb_build_object('idempotent', true);
  end if;

  select coalesce(array_agg(distinct customer.id), '{}'::uuid[])
    into v_exact_ids
  from public.customers customer
  where customer.shop_id = p_shop_id
    and customer.active
    and customer.merged_into_customer_id is null
    and (
      (v_email is not null and customer.identity_email = v_email)
      or (v_phone is not null and customer.identity_phone = v_phone)
      or (
        nullif(upper(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g')), '') is not null
        and exists (
          select 1
          from public.vehicles vehicle
          where vehicle.shop_id = p_shop_id
            and vehicle.customer_id = customer.id
            and upper(regexp_replace(coalesce(vehicle.vin, ''), '[^A-Za-z0-9]', '', 'g'))
              = upper(regexp_replace(p_vin, '[^A-Za-z0-9]', '', 'g'))
        )
      )
    );

  if p_match_existing and cardinality(v_exact_ids) = 1 then
    select * into v_exact_customer
    from public.customers customer
    where customer.id = v_exact_ids[1]
      and customer.shop_id = p_shop_id;

    v_result := jsonb_build_object(
      'ok', true,
      'idempotent', false,
      'matched_existing', true,
      'customer', to_jsonb(v_exact_customer),
      'duplicate_candidates', '[]'::jsonb
    );
    insert into private.customer_account_operations(
      shop_id, operation_key, operation_type, actor_user_id, customer_id, result
    ) values (
      p_shop_id, v_operation_key, 'create', v_actor_user_id, v_exact_customer.id, v_result
    );
    return v_result;
  end if;

  v_duplicates := public.find_customer_account_duplicates(
    p_shop_id,
    v_name,
    v_business_name,
    v_email,
    v_phone,
    p_vin,
    null,
    v_actor_user_id
  );

  if jsonb_array_length(v_duplicates) > 0 and not p_allow_duplicate then
    return jsonb_build_object(
      'ok', false,
      'code', 'CUSTOMER_DUPLICATE_REVIEW_REQUIRED',
      'duplicate_candidates', v_duplicates
    );
  end if;

  if v_account_type = 'individual' then
    v_first_name := nullif(split_part(coalesce(v_name, ''), ' ', 1), '');
    v_last_name := nullif(btrim(substr(coalesce(v_name, ''), length(coalesce(v_first_name, '')) + 1)), '');
  else
    v_first_name := nullif(split_part(coalesce(v_name, ''), ' ', 1), '');
    v_last_name := nullif(btrim(substr(coalesce(v_name, ''), length(coalesce(v_first_name, '')) + 1)), '');
  end if;

  insert into public.customers (
    shop_id, user_id, created_by, account_type, is_fleet, name,
    business_name, first_name, last_name, phone, phone_number, email,
    address, city, province, postal_code, notes, active, updated_at
  ) values (
    p_shop_id, null, v_actor_user_id, v_account_type, v_account_type = 'fleet',
    coalesce(v_business_name, v_name),
    case when v_account_type = 'individual' then null else coalesce(v_business_name, v_name) end,
    v_first_name, v_last_name, v_phone, v_phone, v_email,
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_province, '')), ''),
    nullif(btrim(coalesce(p_postal_code, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''), true, now()
  ) returning * into v_customer;

  if v_name is not null or v_email is not null or v_phone is not null then
    insert into public.customer_contacts (
      shop_id, customer_id, display_name, email, phone, role,
      is_primary, can_approve, can_view_billing, created_by
    ) values (
      p_shop_id, v_customer.id, coalesce(v_name, v_business_name), v_email, v_phone,
      'primary', true, v_account_type <> 'individual', v_account_type <> 'individual',
      v_actor_user_id
    );
  end if;

  if nullif(btrim(coalesce(p_address, '')), '') is not null then
    insert into public.customer_locations (
      shop_id, customer_id, name, location_type, address, city,
      province, postal_code, is_primary, created_by
    ) values (
      p_shop_id, v_customer.id, 'Primary location', 'service', btrim(p_address),
      nullif(btrim(coalesce(p_city, '')), ''),
      nullif(btrim(coalesce(p_province, '')), ''),
      nullif(btrim(coalesce(p_postal_code, '')), ''), true, v_actor_user_id
    );
  end if;

  insert into public.customer_settings(customer_id, shop_id, updated_by)
  values (v_customer.id, p_shop_id, v_actor_user_id)
  on conflict (customer_id) do nothing;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'matched_existing', false,
    'customer', to_jsonb(v_customer),
    'duplicate_candidates', v_duplicates
  );

  insert into private.customer_account_operations(
    shop_id, operation_key, operation_type, actor_user_id, customer_id, result
  ) values (
    p_shop_id, v_operation_key, 'create', v_actor_user_id, v_customer.id, v_result
  );

  insert into public.operational_events (
    shop_id, event_type, actor_user_id, actor_role, entity_type,
    entity_id, source, idempotency_key, metadata
  ) values (
    p_shop_id, 'customer_account.created', v_actor_user_id, v_role,
    'customer', v_customer.id, 'customer_account_center',
    'customer-account-create:' || v_operation_key,
    jsonb_build_object(
      'account_type', v_account_type,
      'duplicate_override', p_allow_duplicate,
      'duplicate_candidate_count', jsonb_array_length(v_duplicates)
    )
  ) on conflict (shop_id, idempotency_key) where idempotency_key is not null
  do nothing;

  return v_result;
end;
$$;

revoke all on function public.create_customer_account_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, uuid, text
) from public, anon;
grant execute on function public.create_customer_account_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, uuid, text
) to authenticated, service_role;

create or replace function public.get_customer_account_center(
  p_shop_id uuid,
  p_customer_id uuid,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := coalesce(p_actor_user_id, (select auth.uid()));
  v_role text;
  v_customer public.customers%rowtype;
  v_settings public.customer_settings%rowtype;
  v_fleet jsonb;
  v_latest_invite jsonb;
  v_counts jsonb;
  v_invoice_summary jsonb;
begin
  if auth.role() <> 'service_role'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from v_actor_user_id) then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_ACTOR_MISMATCH';
  end if;
  v_role := private.customer_account_actor_role(p_shop_id, v_actor_user_id);
  if coalesce(v_role, '') = '' then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_STAFF_ROLE_REQUIRED';
  end if;

  select * into v_customer
  from public.customers customer
  where customer.id = p_customer_id and customer.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Customer account not found for Shop.';
  end if;

  select * into v_settings
  from public.customer_settings settings
  where settings.customer_id = p_customer_id;

  select to_jsonb(fleet_row) into v_fleet
  from (
    select fleet.id, fleet.name, fleet.active, fleet.created_at,
      case
        when not fleet.active then 'inactive'
        when exists (
          select 1 from public.fleet_members membership
          where membership.fleet_id = fleet.id
        ) then 'connected'
        else 'not_connected'
      end as link_status
    from public.fleets fleet
    where fleet.shop_id = p_shop_id and fleet.customer_id = p_customer_id
    order by fleet.active desc, fleet.created_at desc
    limit 1
  ) fleet_row;

  if v_fleet is not null then
    select to_jsonb(invite_row) into v_latest_invite
    from (
      select invite.id, invite.email, invite.role, invite.created_at,
        invite.expires_at, invite.accepted_at, invite.revoked_at,
        case
          when invite.accepted_at is not null then 'accepted'
          when invite.revoked_at is not null then 'revoked'
          when invite.expires_at <= now() then 'expired'
          else 'pending'
        end as status
      from public.fleet_portal_invites invite
      where invite.shop_id = p_shop_id
        and invite.fleet_id = (v_fleet ->> 'id')::uuid
      order by invite.created_at desc
      limit 1
    ) invite_row;
  end if;

  select jsonb_build_object(
    'contacts', (select count(*) from public.customer_contacts contact where contact.customer_id = p_customer_id and contact.active),
    'locations', (select count(*) from public.customer_locations location where location.customer_id = p_customer_id and location.active),
    'vehicles', (select count(*) from public.vehicles vehicle where vehicle.customer_id = p_customer_id),
    'work_orders', (select count(*) from public.work_orders work_order where work_order.customer_id = p_customer_id),
    'invoices', (select count(*) from public.invoices invoice where invoice.customer_id = p_customer_id),
    'merged_sources', (select count(*) from public.customer_account_merges merge_record where merge_record.target_customer_id = p_customer_id)
  ) into v_counts;

  select jsonb_build_object(
    'total_billed', coalesce(sum(invoice.total), 0),
    'outstanding', coalesce(sum(invoice.outstanding_total), 0),
    'last_invoice_at', max(coalesce(invoice.issued_at, invoice.created_at))
  ) into v_invoice_summary
  from public.invoices invoice
  where invoice.shop_id = p_shop_id and invoice.customer_id = p_customer_id;

  return jsonb_build_object(
    'ok', true,
    'customer', to_jsonb(v_customer),
    'settings', coalesce(to_jsonb(v_settings), jsonb_build_object(
      'customer_id', p_customer_id,
      'shop_id', p_shop_id,
      'po_required', false,
      'payment_terms', 'due_on_receipt',
      'payment_terms_days', 0,
      'tax_exempt', false,
      'account_status', 'good_standing'
    )),
    'fleet', v_fleet,
    'fleet_invite', v_latest_invite,
    'counts', v_counts,
    'invoice_summary', v_invoice_summary,
    'can_manage_commercial', v_role in ('owner', 'admin', 'manager'),
    'can_merge_or_archive', v_role in ('owner', 'admin', 'manager')
  );
end;
$$;

revoke all on function public.get_customer_account_center(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.get_customer_account_center(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function public.update_customer_commercial_controls_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_primary_billing_contact_id uuid,
  p_primary_approval_contact_id uuid,
  p_po_required boolean,
  p_payment_terms text,
  p_payment_terms_days integer,
  p_tax_exempt boolean,
  p_tax_exemption_reference text,
  p_account_status text,
  p_account_hold_reason text,
  p_billing_notes text,
  p_customer_reference text,
  p_actor_user_id uuid,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_operation private.customer_account_operations%rowtype;
  v_settings public.customer_settings%rowtype;
  v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_actor_user_id) then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_ACTOR_MISMATCH';
  end if;
  v_role := private.customer_account_actor_role(p_shop_id, p_actor_user_id);
  if coalesce(v_role, '') not in ('owner', 'admin', 'manager') then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_MANAGER_ROLE_REQUIRED';
  end if;
  if not exists (
    select 1 from public.customers customer
    where customer.id = p_customer_id and customer.shop_id = p_shop_id
      and customer.active and customer.merged_into_customer_id is null
  ) then
    raise exception using errcode = 'P0002', message = 'Active customer account not found for Shop.';
  end if;
  if length(btrim(coalesce(p_operation_key, ''))) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'A valid customer operation key is required.';
  end if;

  select * into v_operation
  from private.customer_account_operations operation
  where operation.shop_id = p_shop_id and operation.operation_key = btrim(p_operation_key);
  if found then
    if v_operation.operation_type <> 'update_controls' or v_operation.customer_id <> p_customer_id then
      raise exception using errcode = '22023', message = 'CUSTOMER_ACCOUNT_OPERATION_KEY_CONFLICT';
    end if;
    return v_operation.result || jsonb_build_object('idempotent', true);
  end if;

  insert into public.customer_settings (
    customer_id, shop_id, primary_billing_contact_id, primary_approval_contact_id,
    po_required, payment_terms, payment_terms_days, tax_exempt,
    tax_exemption_reference, account_status, account_hold_reason,
    billing_notes, customer_reference, updated_by, updated_at
  ) values (
    p_customer_id, p_shop_id, p_primary_billing_contact_id, p_primary_approval_contact_id,
    coalesce(p_po_required, false), lower(btrim(coalesce(p_payment_terms, 'due_on_receipt'))),
    coalesce(p_payment_terms_days, 0), coalesce(p_tax_exempt, false),
    nullif(btrim(coalesce(p_tax_exemption_reference, '')), ''),
    lower(btrim(coalesce(p_account_status, 'good_standing'))),
    nullif(btrim(coalesce(p_account_hold_reason, '')), ''),
    nullif(btrim(coalesce(p_billing_notes, '')), ''),
    nullif(btrim(coalesce(p_customer_reference, '')), ''),
    p_actor_user_id, now()
  )
  on conflict (customer_id) do update set
    shop_id = excluded.shop_id,
    primary_billing_contact_id = excluded.primary_billing_contact_id,
    primary_approval_contact_id = excluded.primary_approval_contact_id,
    po_required = excluded.po_required,
    payment_terms = excluded.payment_terms,
    payment_terms_days = excluded.payment_terms_days,
    tax_exempt = excluded.tax_exempt,
    tax_exemption_reference = excluded.tax_exemption_reference,
    account_status = excluded.account_status,
    account_hold_reason = excluded.account_hold_reason,
    billing_notes = excluded.billing_notes,
    customer_reference = excluded.customer_reference,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_settings;

  v_result := jsonb_build_object('ok', true, 'idempotent', false, 'settings', to_jsonb(v_settings));
  insert into private.customer_account_operations(
    shop_id, operation_key, operation_type, actor_user_id, customer_id, result
  ) values (
    p_shop_id, btrim(p_operation_key), 'update_controls', p_actor_user_id, p_customer_id, v_result
  );

  insert into public.operational_events (
    shop_id, event_type, actor_user_id, actor_role, entity_type,
    entity_id, source, idempotency_key, metadata
  ) values (
    p_shop_id, 'customer_account.commercial_controls_updated', p_actor_user_id,
    v_role, 'customer', p_customer_id, 'customer_account_center',
    'customer-controls:' || btrim(p_operation_key),
    jsonb_build_object(
      'po_required', p_po_required,
      'payment_terms', p_payment_terms,
      'tax_exempt', p_tax_exempt,
      'account_status', p_account_status
    )
  ) on conflict (shop_id, idempotency_key) where idempotency_key is not null
  do nothing;

  return v_result;
end;
$$;

revoke all on function public.update_customer_commercial_controls_atomic(
  uuid, uuid, uuid, uuid, boolean, text, integer, boolean, text,
  text, text, text, text, uuid, text
) from public, anon;
grant execute on function public.update_customer_commercial_controls_atomic(
  uuid, uuid, uuid, uuid, boolean, text, integer, boolean, text,
  text, text, text, text, uuid, text
) to authenticated, service_role;

create or replace function public.archive_customer_account_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_reason text,
  p_actor_user_id uuid,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_operation private.customer_account_operations%rowtype;
  v_customer public.customers%rowtype;
  v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_actor_user_id) then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_ACTOR_MISMATCH';
  end if;
  v_role := private.customer_account_actor_role(p_shop_id, p_actor_user_id);
  if coalesce(v_role, '') not in ('owner', 'admin', 'manager') then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_MANAGER_ROLE_REQUIRED';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'Archive reason must be between 3 and 500 characters.';
  end if;
  if length(btrim(coalesce(p_operation_key, ''))) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'A valid customer operation key is required.';
  end if;

  select * into v_operation
  from private.customer_account_operations operation
  where operation.shop_id = p_shop_id
    and operation.operation_key = btrim(p_operation_key);
  if found then
    if v_operation.operation_type <> 'archive'
       or v_operation.customer_id <> p_customer_id then
      raise exception using errcode = '22023', message = 'CUSTOMER_ACCOUNT_OPERATION_KEY_CONFLICT';
    end if;
    return v_operation.result || jsonb_build_object('idempotent', true);
  end if;

  if exists (
    select 1 from public.fleets fleet
    where fleet.shop_id = p_shop_id and fleet.customer_id = p_customer_id and fleet.active
  ) then
    raise exception using errcode = '23514', message = 'Disconnect or deactivate the Fleet workspace before archiving this account.';
  end if;

  update public.customers customer
  set active = false,
      archived_at = coalesce(customer.archived_at, now()),
      archived_by = coalesce(customer.archived_by, p_actor_user_id),
      archive_reason = coalesce(customer.archive_reason, btrim(p_reason)),
      updated_at = now()
  where customer.id = p_customer_id and customer.shop_id = p_shop_id
    and customer.merged_into_customer_id is null
  returning * into v_customer;
  if not found then
    raise exception using errcode = 'P0002', message = 'Customer account not found for Shop.';
  end if;

  v_result := jsonb_build_object('ok', true, 'customer', to_jsonb(v_customer));
  insert into private.customer_account_operations(
    shop_id, operation_key, operation_type, actor_user_id, customer_id, result
  ) values (
    p_shop_id, btrim(p_operation_key), 'archive', p_actor_user_id, p_customer_id, v_result
  );

  insert into public.operational_events (
    shop_id, event_type, actor_user_id, actor_role, entity_type,
    entity_id, source, idempotency_key, metadata
  ) values (
    p_shop_id, 'customer_account.archived', p_actor_user_id, v_role,
    'customer', p_customer_id, 'customer_account_center',
    'customer-archive:' || btrim(p_operation_key),
    jsonb_build_object('reason', btrim(p_reason))
  ) on conflict (shop_id, idempotency_key) where idempotency_key is not null
  do nothing;

  return v_result;
end;
$$;

revoke all on function public.archive_customer_account_atomic(uuid, uuid, text, uuid, text)
  from public, anon;
grant execute on function public.archive_customer_account_atomic(uuid, uuid, text, uuid, text)
  to authenticated, service_role;

create or replace function public.merge_customer_accounts_atomic(
  p_shop_id uuid,
  p_source_customer_id uuid,
  p_target_customer_id uuid,
  p_reason text,
  p_actor_user_id uuid,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_operation private.customer_account_operations%rowtype;
  v_source public.customers%rowtype;
  v_target public.customers%rowtype;
  v_existing_merge public.customer_account_merges%rowtype;
  v_counts jsonb := '{}'::jsonb;
  v_count integer;
  v_merge_id uuid;
  v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_actor_user_id) then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_ACTOR_MISMATCH';
  end if;
  v_role := private.customer_account_actor_role(p_shop_id, p_actor_user_id);
  if coalesce(v_role, '') not in ('owner', 'admin', 'manager') then
    raise exception using errcode = '42501', message = 'CUSTOMER_ACCOUNT_MANAGER_ROLE_REQUIRED';
  end if;
  if p_source_customer_id = p_target_customer_id then
    raise exception using errcode = '22023', message = 'Source and target customer accounts must be different.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'Merge reason must be between 3 and 500 characters.';
  end if;
  if length(btrim(coalesce(p_operation_key, ''))) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'A valid customer operation key is required.';
  end if;

  select * into v_operation
  from private.customer_account_operations operation
  where operation.shop_id = p_shop_id
    and operation.operation_key = btrim(p_operation_key);
  if found then
    if v_operation.operation_type <> 'merge'
       or (v_operation.result ->> 'source_customer_id')::uuid <> p_source_customer_id
       or (v_operation.result ->> 'target_customer_id')::uuid <> p_target_customer_id then
      raise exception using errcode = '22023', message = 'CUSTOMER_ACCOUNT_OPERATION_KEY_CONFLICT';
    end if;
    return v_operation.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_existing_merge
  from public.customer_account_merges merge_record
  where merge_record.shop_id = p_shop_id and merge_record.operation_key = btrim(p_operation_key);
  if found then
    if v_existing_merge.source_customer_id <> p_source_customer_id
       or v_existing_merge.target_customer_id <> p_target_customer_id then
      raise exception using errcode = '22023', message = 'CUSTOMER_ACCOUNT_OPERATION_KEY_CONFLICT';
    end if;
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'merge', to_jsonb(v_existing_merge),
      'redirect_customer_id', v_existing_merge.target_customer_id
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':' || least(p_source_customer_id, p_target_customer_id)::text
      || ':' || greatest(p_source_customer_id, p_target_customer_id)::text,
    0
  ));

  select * into v_source
  from public.customers customer
  where customer.id = p_source_customer_id and customer.shop_id = p_shop_id
  for update;
  select * into v_target
  from public.customers customer
  where customer.id = p_target_customer_id and customer.shop_id = p_shop_id
  for update;

  if v_source.id is null or v_target.id is null then
    raise exception using errcode = 'P0002', message = 'Both customer accounts must belong to the same Shop.';
  end if;
  if not v_source.active or v_source.merged_into_customer_id is not null then
    raise exception using errcode = '23514', message = 'Source customer account is already archived or merged.';
  end if;
  if not v_target.active or v_target.merged_into_customer_id is not null then
    raise exception using errcode = '23514', message = 'Target customer account must be active.';
  end if;
  if v_source.user_id is not null and v_target.user_id is not null
     and v_source.user_id <> v_target.user_id then
    raise exception using errcode = '23514', message = 'Customer portal identities conflict; resolve portal access before merging.';
  end if;
  if exists (
    select 1 from public.fleets fleet
    where fleet.shop_id = p_shop_id and fleet.customer_id = p_source_customer_id and fleet.active
  ) and exists (
    select 1 from public.fleets fleet
    where fleet.shop_id = p_shop_id and fleet.customer_id = p_target_customer_id and fleet.active
  ) then
    raise exception using errcode = '23514', message = 'Both accounts have active Fleet workspaces; resolve Fleet ownership before merging.';
  end if;
  if exists (
    select 1
    from public.customer_pricing_agreements agreement
    where agreement.shop_id = p_shop_id
      and agreement.customer_id = p_source_customer_id
      and agreement.status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Retire or recreate the source account pricing agreement on the canonical target before merging.';
  end if;
  if exists (
    select 1 from public.quickbooks_customer_links link
    where link.shop_id = p_shop_id and link.customer_id = p_source_customer_id
  ) and exists (
    select 1 from public.quickbooks_customer_links link
    where link.shop_id = p_shop_id and link.customer_id = p_target_customer_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Both accounts have QuickBooks customer links; resolve the accounting identity before merging.';
  end if;

  update public.customer_contacts contact
  set is_primary = false
  where contact.customer_id = p_source_customer_id
    and contact.is_primary
    and exists (
      select 1 from public.customer_contacts target_contact
      where target_contact.customer_id = p_target_customer_id
        and target_contact.is_primary and target_contact.active
    );
  update public.customer_contacts
  set customer_id = p_target_customer_id, updated_at = now()
  where customer_id = p_source_customer_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('contacts', v_count);

  update public.customer_locations location
  set is_primary = false
  where location.customer_id = p_source_customer_id
    and location.is_primary
    and exists (
      select 1 from public.customer_locations target_location
      where target_location.customer_id = p_target_customer_id
        and target_location.is_primary and target_location.active
    );
  update public.customer_locations
  set customer_id = p_target_customer_id, updated_at = now()
  where customer_id = p_source_customer_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('locations', v_count);

  update public.vehicles set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('vehicles', v_count);

  update public.work_orders set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('work_orders', v_count);

  update public.invoices set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('invoices', v_count);

  update public.history set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('history', v_count);

  update public.bookings set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.content_events set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.conversation_participants set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.conversations set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.followups set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.inspection_sessions set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.mobile_service_followups set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.customer_portal_invites set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.portal_lifecycle_operation_keys set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.portal_notifications set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.quickbooks_customer_links set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.service_addresses set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.shop_ratings set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id
    and not exists (
      select 1 from public.shop_ratings target_rating
      where target_rating.shop_id = p_shop_id
        and target_rating.customer_id = p_target_customer_id
    );
  update public.shop_reviews set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.warranties set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.work_order_intelligence set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;

  update public.fleets set customer_id = p_target_customer_id, updated_at = now()
  where customer_id = p_source_customer_id;

  insert into public.customer_settings (
    customer_id, shop_id, comm_email_enabled, comm_sms_enabled, marketing_opt_in,
    preferred_contact, units, language, timezone, primary_billing_contact_id,
    primary_approval_contact_id, po_required, payment_terms, payment_terms_days,
    tax_exempt, tax_exemption_reference, account_status, account_hold_reason,
    billing_notes, customer_reference, updated_by, updated_at
  )
  select
    p_target_customer_id, p_shop_id, settings.comm_email_enabled,
    settings.comm_sms_enabled, settings.marketing_opt_in, settings.preferred_contact,
    settings.units, settings.language, settings.timezone,
    settings.primary_billing_contact_id, settings.primary_approval_contact_id,
    settings.po_required, settings.payment_terms, settings.payment_terms_days,
    settings.tax_exempt, settings.tax_exemption_reference, settings.account_status,
    settings.account_hold_reason, settings.billing_notes, settings.customer_reference,
    p_actor_user_id, now()
  from public.customer_settings settings
  where settings.customer_id = p_source_customer_id
    and not exists (
      select 1 from public.customer_settings target_settings
      where target_settings.customer_id = p_target_customer_id
    );

  update public.customer_settings
  set primary_billing_contact_id = null,
      primary_approval_contact_id = null,
      updated_by = p_actor_user_id,
      updated_at = now()
  where customer_id = p_source_customer_id;

  update public.customers customer
  set parent_customer_id = p_target_customer_id
  where customer.parent_customer_id = p_source_customer_id
    and customer.id <> p_target_customer_id;

  update public.customers customer
  set merged_into_customer_id = p_target_customer_id,
      updated_at = now()
  where customer.shop_id = p_shop_id
    and customer.merged_into_customer_id = p_source_customer_id;
  update public.customer_account_merges merge_record
  set target_customer_id = p_target_customer_id
  where merge_record.shop_id = p_shop_id
    and merge_record.target_customer_id = p_source_customer_id;
  update public.customers customer
  set default_bill_to_customer_id = p_target_customer_id
  where customer.default_bill_to_customer_id = p_source_customer_id
    and customer.id <> p_target_customer_id;

  -- Transfer the portal identity and a missing canonical email without
  -- violating the same-Shop email uniqueness constraint. The complete
  -- pre-merge source row is retained in the append-only merge audit below.
  update public.customers source
  set user_id = null,
      email = case
        when nullif(v_target.email, '') is null then null
        else source.email
      end,
      updated_at = now()
  where source.id = p_source_customer_id and source.shop_id = p_shop_id;

  update public.customers target
  set user_id = coalesce(target.user_id, v_source.user_id),
      name = coalesce(nullif(target.name, ''), v_source.name),
      business_name = coalesce(nullif(target.business_name, ''), v_source.business_name),
      first_name = coalesce(nullif(target.first_name, ''), v_source.first_name),
      last_name = coalesce(nullif(target.last_name, ''), v_source.last_name),
      email = coalesce(nullif(target.email, ''), v_source.email),
      phone = coalesce(nullif(target.phone, ''), v_source.phone),
      phone_number = coalesce(nullif(target.phone_number, ''), v_source.phone_number),
      address = coalesce(nullif(target.address, ''), v_source.address),
      city = coalesce(nullif(target.city, ''), v_source.city),
      province = coalesce(nullif(target.province, ''), v_source.province),
      postal_code = coalesce(nullif(target.postal_code, ''), v_source.postal_code),
      updated_at = now()
  where target.id = p_target_customer_id and target.shop_id = p_shop_id;

  update public.customers source
  set active = false,
      archived_at = now(),
      archived_by = p_actor_user_id,
      archive_reason = 'Merged into canonical customer account.',
      merged_into_customer_id = p_target_customer_id,
      merged_at = now(),
      merged_by = p_actor_user_id,
      merge_reason = btrim(p_reason),
      updated_at = now()
  where source.id = p_source_customer_id and source.shop_id = p_shop_id;

  insert into public.customer_account_merges (
    shop_id, source_customer_id, target_customer_id, reason,
    merged_by, operation_key, moved_record_counts, source_snapshot, target_snapshot
  ) values (
    p_shop_id, p_source_customer_id, p_target_customer_id, btrim(p_reason),
    p_actor_user_id, btrim(p_operation_key), v_counts,
    to_jsonb(v_source), to_jsonb(v_target)
  ) returning id into v_merge_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'merge_id', v_merge_id,
    'source_customer_id', p_source_customer_id,
    'target_customer_id', p_target_customer_id,
    'redirect_customer_id', p_target_customer_id,
    'moved_record_counts', v_counts
  );

  insert into private.customer_account_operations(
    shop_id, operation_key, operation_type, actor_user_id, customer_id, result
  ) values (
    p_shop_id, btrim(p_operation_key), 'merge', p_actor_user_id, p_target_customer_id, v_result
  );

  insert into public.operational_events (
    shop_id, event_type, actor_user_id, actor_role, entity_type,
    entity_id, source, idempotency_key, metadata
  ) values (
    p_shop_id, 'customer_account.merged', p_actor_user_id, v_role,
    'customer', p_target_customer_id, 'customer_account_center',
    'customer-merge:' || btrim(p_operation_key),
    jsonb_build_object(
      'source_customer_id', p_source_customer_id,
      'target_customer_id', p_target_customer_id,
      'reason', btrim(p_reason),
      'moved_record_counts', v_counts
    )
  ) on conflict (shop_id, idempotency_key) where idempotency_key is not null
  do nothing;

  return v_result;
end;
$$;

revoke all on function public.merge_customer_accounts_atomic(
  uuid, uuid, uuid, text, uuid, text
) from public, anon;
grant execute on function public.merge_customer_accounts_atomic(
  uuid, uuid, uuid, text, uuid, text
) to authenticated, service_role;

-- Keep the confirmed Shop Assistant mutation on the same canonical account
-- command while preserving the assistant action ledger and response contract.
create or replace function public.shop_assistant_create_customer_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_account_result jsonb;
  v_customer jsonb;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'create_customer'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner','admin','manager','advisor','service','lead_hand','leadhand','foreman') then
    raise exception using errcode = '42501', message = 'Your role cannot create customers.';
  end if;

  v_account_result := public.create_customer_account_atomic(
    p_shop_id,
    'individual',
    p_name,
    null,
    p_email,
    p_phone,
    null,
    null,
    null,
    null,
    'Created through the confirmed Shop Assistant action.',
    null,
    true,
    false,
    p_actor_user_id,
    'shop-assistant:' || p_action_id::text
  );

  if not coalesce((v_account_result ->> 'ok')::boolean, false) then
    raise exception using
      errcode = '23505',
      message = 'Possible duplicate customer requires review in the Customer Account Center.';
  end if;

  v_customer := v_account_result -> 'customer';
  v_result := jsonb_build_object(
    'ok', true,
    'customer', jsonb_build_object(
      'id', v_customer ->> 'id',
      'name', coalesce(v_customer ->> 'name', btrim(p_name)),
      'email', v_customer ->> 'email',
      'phone', v_customer ->> 'phone',
      'href', '/customers/' || (v_customer ->> 'id')
    ),
    'summary', case
      when coalesce((v_account_result ->> 'matched_existing')::boolean, false)
      then coalesce(v_customer ->> 'name', btrim(p_name)) || ' matched the existing canonical customer account.'
      else coalesce(v_customer ->> 'name', btrim(p_name)) || ' was created as a shop customer.'
    end
  );

  update public.shop_assistant_actions
  set status = 'succeeded',
      result = v_result,
      error = null,
      execution_finished_at = now(),
      updated_at = now()
  where id = p_action_id
    and shop_id = p_shop_id
    and status = 'executing';

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    'shop_assistant_customer_created',
    p_actor_user_id,
    now(),
    'customer',
    (v_customer ->> 'id')::uuid,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'matched_existing', coalesce((v_account_result ->> 'matched_existing')::boolean, false)
    )
  );

  return v_result;
end;
$$;

revoke all on function public.shop_assistant_create_customer_atomic(
  uuid, uuid, uuid, text, text, text
) from public, anon;
grant execute on function public.shop_assistant_create_customer_atomic(
  uuid, uuid, uuid, text, text, text
) to authenticated, service_role;

comment on function public.create_customer_account_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, uuid, text
) is 'Canonical same-Shop customer create/resolve command with duplicate review and idempotency.';
comment on function public.merge_customer_accounts_atomic(
  uuid, uuid, uuid, text, uuid, text
) is 'Non-destructively merges operational history into a canonical customer and archives the source.';

commit;
