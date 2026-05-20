-- Step 24A: Manual SQL draft for property inspection signatures/acknowledgements.
-- IMPORTANT:
-- - Manual draft only; do not auto-apply.
-- - No public unauthenticated signing in this step.
-- - No vendor signing in this step.
-- - No signature image upload bucket in this step.
-- - signature_image_path is reserved for a later phase.
-- - typed/acknowledged signatures are the first implementation path.

create table if not exists public.property_inspection_signatures (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  inspection_id uuid not null references public.property_inspections(id) on delete cascade,
  signer_profile_id uuid references public.profiles(id) on delete set null,
  signer_name text not null,
  signer_email text,
  signer_role text not null,
  signature_type text not null default 'typed',
  signature_text text,
  signature_image_path text,
  signed_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint property_inspection_signatures_signer_role_check
    check (signer_role in ('tenant', 'property_manager', 'owner', 'internal', 'witness')),
  constraint property_inspection_signatures_signature_type_check
    check (signature_type in ('typed', 'drawn', 'uploaded', 'acknowledged')),
  constraint property_inspection_signatures_payload_check
    check (
      signature_type = 'acknowledged'
      or nullif(btrim(coalesce(signature_text, '')), '') is not null
      or nullif(btrim(coalesce(signature_image_path, '')), '') is not null
    )
);

create index if not exists property_inspection_signatures_shop_id_idx
  on public.property_inspection_signatures (shop_id);

create index if not exists property_inspection_signatures_inspection_id_idx
  on public.property_inspection_signatures (inspection_id);

create index if not exists property_inspection_signatures_signer_profile_id_idx
  on public.property_inspection_signatures (signer_profile_id);

create index if not exists property_inspection_signatures_signer_role_idx
  on public.property_inspection_signatures (signer_role);

create index if not exists property_inspection_signatures_signed_at_idx
  on public.property_inspection_signatures (signed_at desc);

create or replace function public.enforce_property_inspection_signature_shop_id()
returns trigger
language plpgsql
as $$
declare
  inspection_shop_id uuid;
begin
  select pi.shop_id
  into inspection_shop_id
  from public.property_inspections pi
  where pi.id = new.inspection_id;

  if inspection_shop_id is null then
    raise exception 'property_inspection % not found', new.inspection_id;
  end if;

  if new.shop_id is distinct from inspection_shop_id then
    raise exception using
      message = format(
        'shop_id mismatch for property inspection signature: signature.shop_id=%s inspection.shop_id=%s',
        new.shop_id,
        inspection_shop_id
      ),
      errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_inspection_signatures_shop_id
  on public.property_inspection_signatures;

create trigger trg_property_inspection_signatures_shop_id
before insert or update on public.property_inspection_signatures
for each row
execute function public.enforce_property_inspection_signature_shop_id();

alter table public.property_inspection_signatures enable row level security;

drop policy if exists "Internal staff can select property inspection signatures"
  on public.property_inspection_signatures;
create policy "Internal staff can select property inspection signatures"
on public.property_inspection_signatures
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_inspection_signatures.shop_id
  )
);

drop policy if exists "Internal staff can insert property inspection signatures"
  on public.property_inspection_signatures;
create policy "Internal staff can insert property inspection signatures"
on public.property_inspection_signatures
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_inspection_signatures.shop_id
  )
);

drop policy if exists "Internal staff can update property inspection signatures"
  on public.property_inspection_signatures;
create policy "Internal staff can update property inspection signatures"
on public.property_inspection_signatures
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_inspection_signatures.shop_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_inspection_signatures.shop_id
  )
);

drop policy if exists "Internal staff can delete property inspection signatures"
  on public.property_inspection_signatures;
create policy "Internal staff can delete property inspection signatures"
on public.property_inspection_signatures
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_inspection_signatures.shop_id
  )
);

drop policy if exists "Property members can select scoped property inspection signatures"
  on public.property_inspection_signatures;
create policy "Property members can select scoped property inspection signatures"
on public.property_inspection_signatures
for select
to authenticated
using (
  exists (
    select 1
    from public.property_member_units pmu
    join public.property_inspections pi
      on pi.id = property_inspection_signatures.inspection_id
     and pi.shop_id = property_inspection_signatures.shop_id
    where pmu.profile_id = auth.uid()
      and pmu.shop_id = property_inspection_signatures.shop_id
      and (
        pmu.unit_id = pi.unit_id
        or pmu.property_id = pi.property_id
      )
  )
);

drop policy if exists "Property members can insert own scoped property inspection signatures"
  on public.property_inspection_signatures;
create policy "Property members can insert own scoped property inspection signatures"
on public.property_inspection_signatures
for insert
to authenticated
with check (
  signer_profile_id = auth.uid()
  and exists (
    select 1
    from public.property_member_units pmu
    join public.property_inspections pi
      on pi.id = property_inspection_signatures.inspection_id
     and pi.shop_id = property_inspection_signatures.shop_id
    where pmu.profile_id = auth.uid()
      and pmu.shop_id = property_inspection_signatures.shop_id
      and (
        pmu.unit_id = pi.unit_id
        or pmu.property_id = pi.property_id
      )
  )
);
