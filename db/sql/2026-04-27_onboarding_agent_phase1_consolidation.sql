-- Phase 1 onboarding-agent consolidation.
-- Production-safe status contract alignment and staged artifact dedupe before uniqueness enforcement.

begin;

alter table public.onboarding_sessions
  drop constraint if exists onboarding_sessions_status_check;

alter table public.onboarding_sessions
  add constraint onboarding_sessions_status_check
  check (status in (
    'draft',
    'files_uploaded',
    'uploaded',
    'analyzing',
    'analyzing_started',
    'clearing_previous_analysis',
    'applying_analysis',
    'analysis_ready',
    'review_required',
    'ready_for_dry_run',
    'ready_for_activation',
    'activation_ready',
    'activating',
    'activated',
    'blocked',
    'cancelled',
    'deleted',
    'analysis_failed'
  ));

with ranked as (
  select
    ctid,
    row_number() over (
      partition by shop_id, session_id, domain, issue_type, severity, md5(coalesce(details::text, ''))
      order by created_at asc nulls last, id asc
    ) as rn
  from public.onboarding_review_items
)
delete from public.onboarding_review_items t
using ranked r
where t.ctid = r.ctid
  and r.rn > 1;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by shop_id, session_id, link_type, from_entity_id, to_entity_id
      order by created_at asc nulls last, id asc
    ) as rn
  from public.onboarding_entity_links
)
delete from public.onboarding_entity_links t
using ranked r
where t.ctid = r.ctid
  and r.rn > 1;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by shop_id, session_id, source_file_id, source_row_index, entity_type
      order by created_at asc nulls last, id asc
    ) as rn
  from public.onboarding_entities
  where source_file_id is not null
    and source_row_index is not null
)
delete from public.onboarding_entities t
using ranked r
where t.ctid = r.ctid
  and r.rn > 1;

drop index if exists public.onboarding_review_items_shop_session_issue_scope_uidx;
create unique index onboarding_review_items_shop_session_issue_scope_uidx
  on public.onboarding_review_items(shop_id, session_id, domain, issue_type, severity, md5(coalesce(details::text, '')));

drop index if exists public.onboarding_entity_links_shop_session_edge_type_uidx;
create unique index onboarding_entity_links_shop_session_edge_type_uidx
  on public.onboarding_entity_links(shop_id, session_id, link_type, from_entity_id, to_entity_id);

drop index if exists public.onboarding_entities_shop_session_source_row_entity_type_uidx;
create unique index onboarding_entities_shop_session_source_row_entity_type_uidx
  on public.onboarding_entities(shop_id, session_id, source_file_id, source_row_index, entity_type)
  where source_file_id is not null and source_row_index is not null;

commit;
