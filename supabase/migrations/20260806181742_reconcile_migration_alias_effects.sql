begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Production config exposes the legacy onboarding_agent namespace. Its
-- production-owned objects are outside this public-schema reconciliation, but
-- the namespace must exist on clean databases or PostgREST cannot build its
-- schema cache. Keep the empty compatibility namespace service-role only.
create schema if not exists onboarding_agent;
revoke all on schema onboarding_agent from public, anon, authenticated;
grant usage on schema onboarding_agent to service_role;

-- The production copy of harden_invoice_ai_contracts predates the guarded
-- clean-replay version now in the repository. Its only additional schema
-- effect is the immutable invoice-version entity used by QuickBooks exports.
alter table public.quickbooks_sync_events
  drop constraint if exists quickbooks_sync_events_entity_type_check;

alter table public.quickbooks_sync_events
  add constraint quickbooks_sync_events_entity_type_check
  check (
    entity_type = any (
      array[
        'connection',
        'customer',
        'invoice',
        'invoice_version',
        'item',
        'token'
      ]::text[]
    )
  ) not valid;

alter table public.quickbooks_sync_events
  validate constraint quickbooks_sync_events_entity_type_check;

-- The bridge aliases were executed twice while the credential was moved into
-- integrations. Converge clean replay on production's narrower authenticated
-- policies and never recreate the retired plaintext credential table.
drop policy if exists integrations_select on public.integrations;
drop policy if exists integrations_insert on public.integrations;
drop policy if exists integrations_update on public.integrations;
drop policy if exists integrations_delete on public.integrations;
drop policy if exists integrations__shop_select on public.integrations;
drop policy if exists integrations__shop_insert on public.integrations;
drop policy if exists integrations__shop_update on public.integrations;
drop policy if exists integrations__shop_delete on public.integrations;

create policy integrations__shop_select
  on public.integrations
  for select
  to authenticated
  using (public.is_shop_member_v2(shop_id));

create policy integrations__shop_insert
  on public.integrations
  for insert
  to authenticated
  with check (public.is_shop_member_v2(shop_id));

create policy integrations__shop_update
  on public.integrations
  for update
  to authenticated
  using (public.is_shop_member_v2(shop_id))
  with check (public.is_shop_member_v2(shop_id));

create policy integrations__shop_delete
  on public.integrations
  for delete
  to authenticated
  using (public.is_shop_member_v2(shop_id));

-- A clean database has no bridge secret and therefore no bridge row. If a row
-- exists (as it does in production), require the canonical server-owned shape
-- without exposing or copying the secret.
do $migration$
begin
  if to_regclass('public.integrations') is null then
    raise exception using errcode = 'P0001',
      message = 'MIGRATION_RECONCILIATION_FAILED: public.integrations is missing';
  end if;

  if to_regclass('public.agent_bridge_credentials') is not null then
    raise exception using errcode = 'P0001',
      message = 'MIGRATION_RECONCILIATION_FAILED: legacy agent bridge credentials remain';
  end if;

  if exists (
    select 1
    from public.integrations i
    where i.id = '7c2da329-5117-48c0-a1ee-d51b5d63827d'::uuid
      and not (
        i.shop_id is null
        and i.provider = 'aftermarket_api'
        and i.status = 'enabled'
        and i.config ->> 'kind' = 'profixiq_agent_bridge'
        and nullif(i.config ->> 'secret', '') is not null
      )
  ) then
    raise exception using errcode = 'P0001',
      message = 'MIGRATION_RECONCILIATION_FAILED: canonical agent bridge integration is malformed';
  end if;

  if exists (
    select 1
    from public.integrations i
    where i.config ->> 'kind' = 'profixiq_agent_bridge'
      and i.id <> '7c2da329-5117-48c0-a1ee-d51b5d63827d'::uuid
  ) then
    raise exception using errcode = 'P0001',
      message = 'MIGRATION_RECONCILIATION_FAILED: noncanonical agent bridge integration remains';
  end if;
end;
$migration$;

commit;
