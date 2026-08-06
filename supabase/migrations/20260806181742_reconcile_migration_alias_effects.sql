begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

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
-- integrations. Assert the final repository-owned effect before repairing the
-- ledger; never recreate the retired plaintext credential table.
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

  if not exists (
    select 1
    from public.integrations i
    where i.id = '7c2da329-5117-48c0-a1ee-d51b5d63827d'::uuid
      and i.shop_id is null
      and i.provider = 'aftermarket_api'
      and i.status = 'enabled'
      and i.config ->> 'kind' = 'profixiq_agent_bridge'
      and nullif(i.config ->> 'secret', '') is not null
  ) then
    raise exception using errcode = 'P0001',
      message = 'MIGRATION_RECONCILIATION_FAILED: canonical agent bridge integration is missing';
  end if;
end;
$migration$;

commit;
