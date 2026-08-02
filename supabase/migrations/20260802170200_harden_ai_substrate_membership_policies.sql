begin;

-- The restored AI substrate must derive tenant membership from the authenticated
-- user's persisted profile, not request-local shop context. PostgreSQL combines
-- permissive policies with OR, so replace every tenant policy on these tables.

drop policy if exists ai_evidence_snapshots_shop_select
  on public.ai_evidence_snapshots;
create policy ai_evidence_snapshots_shop_select
  on public.ai_evidence_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_evidence_snapshots.shop_id
    )
  );

drop policy if exists ai_evidence_snapshots_shop_insert
  on public.ai_evidence_snapshots;
create policy ai_evidence_snapshots_shop_insert
  on public.ai_evidence_snapshots
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_evidence_snapshots.shop_id
    )
  );

drop policy if exists ai_recommendations_shop_select
  on public.ai_recommendations;
create policy ai_recommendations_shop_select
  on public.ai_recommendations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_recommendations.shop_id
    )
  );

drop policy if exists ai_recommendations_shop_insert
  on public.ai_recommendations;
create policy ai_recommendations_shop_insert
  on public.ai_recommendations
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_recommendations.shop_id
    )
  );

drop policy if exists ai_recommendations_shop_update
  on public.ai_recommendations;
create policy ai_recommendations_shop_update
  on public.ai_recommendations
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_recommendations.shop_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_recommendations.shop_id
    )
  );

drop policy if exists ai_action_previews_shop_select
  on public.ai_action_previews;
create policy ai_action_previews_shop_select
  on public.ai_action_previews
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_previews.shop_id
    )
  );

drop policy if exists ai_action_previews_shop_insert
  on public.ai_action_previews;
create policy ai_action_previews_shop_insert
  on public.ai_action_previews
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_previews.shop_id
    )
  );

drop policy if exists ai_action_previews_shop_update
  on public.ai_action_previews;
create policy ai_action_previews_shop_update
  on public.ai_action_previews
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_previews.shop_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_previews.shop_id
    )
  );

drop policy if exists ai_action_approvals_shop_select
  on public.ai_action_approvals;
create policy ai_action_approvals_shop_select
  on public.ai_action_approvals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_approvals.shop_id
    )
  );

drop policy if exists ai_action_approvals_shop_insert
  on public.ai_action_approvals;
create policy ai_action_approvals_shop_insert
  on public.ai_action_approvals
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_approvals.shop_id
    )
  );

drop policy if exists ai_action_approvals_shop_update
  on public.ai_action_approvals;
create policy ai_action_approvals_shop_update
  on public.ai_action_approvals
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_approvals.shop_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_approvals.shop_id
    )
  );

drop policy if exists ai_action_events_shop_select
  on public.ai_action_events;
create policy ai_action_events_shop_select
  on public.ai_action_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_events.shop_id
    )
  );

drop policy if exists ai_action_events_shop_insert
  on public.ai_action_events;
create policy ai_action_events_shop_insert
  on public.ai_action_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
        and p.shop_id = ai_action_events.shop_id
    )
  );

commit;
