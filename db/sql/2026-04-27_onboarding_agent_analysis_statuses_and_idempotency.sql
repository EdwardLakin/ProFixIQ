-- Expand onboarding session analysis statuses for explicit staged analysis phases.
-- Add deterministic-id uniqueness helpers for rerunnable staged artifacts.

begin;

alter table public.onboarding_sessions
  drop constraint if exists onboarding_sessions_status_check;

alter table public.onboarding_sessions
  add constraint onboarding_sessions_status_check
  check (status in (
    'draft','files_uploaded','analyzing_started','clearing_previous_analysis','applying_analysis','analyzing','analysis_failed','analysis_ready','review_required','activation_ready','activating','activated','blocked','cancelled'
  ));

create unique index if not exists onboarding_entities_shop_session_source_row_entity_type_uidx
  on public.onboarding_entities(shop_id, session_id, source_file_id, source_row_index, entity_type)
  where source_file_id is not null and source_row_index is not null;

create unique index if not exists onboarding_entity_links_shop_session_edge_type_uidx
  on public.onboarding_entity_links(shop_id, session_id, link_type, from_entity_id, to_entity_id);

create unique index if not exists onboarding_review_items_shop_session_issue_scope_uidx
  on public.onboarding_review_items(shop_id, session_id, domain, issue_type, severity, md5(coalesce(details::text, '')));

commit;
