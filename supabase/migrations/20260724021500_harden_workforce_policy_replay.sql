-- Forward hardening for the workforce rollout.
--
-- The initial workforce migration can be applied cleanly once, but PostgreSQL
-- does not support CREATE POLICY IF NOT EXISTS. Replacing the policies here
-- makes the final schema deterministic after a recovered/partial rollout
-- without rewriting the original migration.

drop policy if exists shop_payroll_settings_manager_select
  on public.shop_payroll_settings;
drop policy if exists shop_payroll_settings_owner_write
  on public.shop_payroll_settings;
drop policy if exists payroll_pay_periods_manager_select
  on public.payroll_pay_periods;
drop policy if exists payroll_time_entries_scoped_select
  on public.payroll_time_entries;
drop policy if exists payroll_time_exceptions_scoped_select
  on public.payroll_time_exceptions;
drop policy if exists payroll_export_batches_owner_select
  on public.payroll_export_batches;
drop policy if exists payroll_export_rows_owner_select
  on public.payroll_export_rows;
drop policy if exists payroll_employee_mappings_owner_all
  on public.payroll_employee_mappings;

create policy shop_payroll_settings_manager_select
  on public.shop_payroll_settings
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and public.profixiq_can_manage_workforce()
  );

create policy shop_payroll_settings_owner_write
  on public.shop_payroll_settings
  for all to authenticated
  using (
    shop_id = public.current_shop_id()
    and public.profixiq_can_finalize_workforce()
  )
  with check (
    shop_id = public.current_shop_id()
    and public.profixiq_can_finalize_workforce()
  );

create policy payroll_pay_periods_manager_select
  on public.payroll_pay_periods
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and public.profixiq_can_manage_workforce()
  );

create policy payroll_time_entries_scoped_select
  on public.payroll_time_entries
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (
      user_id = auth.uid()
      or public.profixiq_can_manage_workforce()
    )
  );

create policy payroll_time_exceptions_scoped_select
  on public.payroll_time_exceptions
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (
      user_id = auth.uid()
      or public.profixiq_can_manage_workforce()
    )
  );

create policy payroll_export_batches_owner_select
  on public.payroll_export_batches
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and public.profixiq_can_finalize_workforce()
  );

create policy payroll_export_rows_owner_select
  on public.payroll_export_rows
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and public.profixiq_can_finalize_workforce()
  );

create policy payroll_employee_mappings_owner_all
  on public.payroll_employee_mappings
  for all to authenticated
  using (
    shop_id = public.current_shop_id()
    and public.profixiq_can_finalize_workforce()
  )
  with check (
    shop_id = public.current_shop_id()
    and public.profixiq_can_finalize_workforce()
  );

drop policy if exists flat_rate_credits_scoped_select
  on public.work_order_line_flat_rate_credits;
create policy flat_rate_credits_scoped_select
  on public.work_order_line_flat_rate_credits
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (
      technician_id = auth.uid()
      or public.profixiq_can_manage_workforce()
    )
  );

drop policy if exists labor_segment_corrections_scoped_select
  on public.work_order_line_labor_segment_corrections;
create policy labor_segment_corrections_scoped_select
  on public.work_order_line_labor_segment_corrections
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and public.profixiq_can_manage_workforce()
  );

-- All mutations use authenticated API routes or the audited SECURITY DEFINER
-- functions. Removing direct table writes prevents callers from bypassing the
-- atomic transition, availability-block, and schedule-replacement behavior.
drop policy if exists staff_schedule_templates_shop_write
  on public.staff_schedule_templates;
drop policy if exists staff_schedule_overrides_shop_write
  on public.staff_schedule_overrides;
drop policy if exists staff_time_off_requests_manager_update
  on public.staff_time_off_requests;
drop policy if exists staff_availability_blocks_shop_write
  on public.staff_availability_blocks;

-- This is an internal trigger/backfill helper. It has no caller authorization
-- of its own, so it must never inherit PostgreSQL's default PUBLIC execute grant.
revoke all on function public.sync_work_order_line_flat_rate_credits(uuid)
  from public;
revoke all on function public.sync_work_order_line_flat_rate_credits(uuid)
  from authenticated;
revoke all on function public.sync_work_order_line_flat_rate_credits(uuid)
  from anon;
grant execute on function public.sync_work_order_line_flat_rate_credits(uuid)
  to service_role;
