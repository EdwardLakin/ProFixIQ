-- Keep the private completion-learning receipt table free of avoidable advisor
-- debt. This is separate from the hotfix migration because Supabase preview
-- branches apply only newly added migration files after their first deploy.

create index if not exists completed_repair_learning_receipts_line_idx
  on copilot.completed_repair_learning_receipts (work_order_line_id);
create index if not exists completed_repair_learning_receipts_actor_idx
  on copilot.completed_repair_learning_receipts (actor_user_id);

drop policy if exists completed_repair_learning_receipts_deny_direct_access
  on copilot.completed_repair_learning_receipts;
create policy completed_repair_learning_receipts_deny_direct_access
  on copilot.completed_repair_learning_receipts
  for all
  to public
  using (false)
  with check (false);

do $$
begin
  if to_regclass(
    'copilot.completed_repair_learning_receipts_line_idx'
  ) is null then
    raise exception
      'completion learning receipt line foreign-key index is missing';
  end if;

  if to_regclass(
    'copilot.completed_repair_learning_receipts_actor_idx'
  ) is null then
    raise exception
      'completion learning receipt actor foreign-key index is missing';
  end if;

  if not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'copilot'
      and policy.tablename = 'completed_repair_learning_receipts'
      and policy.policyname =
        'completed_repair_learning_receipts_deny_direct_access'
  ) then
    raise exception
      'completion learning receipt deny-direct-access policy is missing';
  end if;
end;
$$;
