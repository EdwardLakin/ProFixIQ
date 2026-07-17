-- Workforce W1A: audited admin shift correction workflow.
-- Additive model: corrections preserve original shift/punch evidence and expose an
-- excluded_from_payroll flag for voided actual-work shifts.

alter table public.tech_shifts
  add column if not exists excluded_from_payroll boolean not null default false;

create table if not exists public.shift_corrections (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  shift_id uuid references public.tech_shifts(id) on delete set null,
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  correction_type text not null check (correction_type in ('create_missing_shift','adjust_start','adjust_end','adjust_start_and_end','void_shift')),
  reason text not null check (length(trim(reason)) > 0),
  original_data jsonb not null default '{}'::jsonb,
  corrected_data jsonb not null default '{}'::jsonb,
  status text not null default 'applied' check (status in ('applied')),
  payroll_rebuild_status text not null default 'not_required' check (payroll_rebuild_status in ('not_required','rebuild_required')),
  created_at timestamptz not null default now(),
  applied_at timestamptz not null default now()
);

create index if not exists idx_shift_corrections_shop_created on public.shift_corrections(shop_id, created_at desc);
create index if not exists idx_shift_corrections_shift on public.shift_corrections(shift_id);
create index if not exists idx_shift_corrections_target on public.shift_corrections(shop_id, target_user_id, created_at desc);

alter table public.shift_corrections enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='shift_corrections' and policyname='shift_corrections_shop_select') then
    create policy shift_corrections_shop_select on public.shift_corrections
      for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.shop_id = shift_corrections.shop_id));
  end if;
end $$;

create or replace function public.apply_shift_correction(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_target_user_id uuid,
  p_shift_id uuid,
  p_correction_type text,
  p_corrected_start_time timestamptz,
  p_corrected_end_time timestamptz,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_shift public.tech_shifts%rowtype;
  v_new_shift public.tech_shifts%rowtype;
  v_original jsonb := '{}'::jsonb;
  v_corrected jsonb := '{}'::jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_correction_id uuid;
  v_period public.payroll_pay_periods%rowtype;
  v_payroll_status text := 'not_required';
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Correction reason is required';
  end if;
   if p_correction_type not in ('create_missing_shift','adjust_start','adjust_end','adjust_start_and_end','void_shift') then
    raise exception 'Unsupported correction type';
  end if;

  select * into v_actor from public.profiles where id = p_actor_profile_id and shop_id = p_shop_id;
  if not found then raise exception 'Actor is not in shop'; end if;
  if coalesce(v_actor.role, '') not in ('owner','admin','manager') then raise exception 'Forbidden'; end if;
  if p_actor_profile_id = p_target_user_id and coalesce(v_actor.role, '') <> 'owner' then
    raise exception 'Only an owner can apply an audited correction to their own shift';
  end if;

  select * into v_target from public.profiles where id = p_target_user_id and shop_id = p_shop_id;
  if not found then raise exception 'Target user is not in shop'; end if;

  if p_correction_type = 'create_missing_shift' then
    v_start := p_corrected_start_time; v_end := p_corrected_end_time;
    if v_start is null or v_end is null or v_end <= v_start then raise exception 'Corrected shift interval is invalid'; end if;
    if exists (select 1 from public.tech_shifts s where s.shop_id=p_shop_id and s.user_id=p_target_user_id and coalesce(s.excluded_from_payroll,false)=false and tstzrange(s.start_time, coalesce(s.end_time, 'infinity'::timestamptz), '[)') && tstzrange(v_start, v_end, '[)')) then
      raise exception 'Corrected shift overlaps another non-voided shift';
    end if;
    insert into public.tech_shifts (shop_id, user_id, status, type, start_time, end_time, excluded_from_payroll)
      values (p_shop_id, p_target_user_id, 'completed', 'shift', v_start, v_end, false)
      returning * into v_new_shift;
    insert into public.punch_events (shift_id, user_id, profile_id, event_type, timestamp, note) values
      (v_new_shift.id, p_target_user_id, p_target_user_id, 'start_shift', v_start, 'Admin correction: missing shift start'),
      (v_new_shift.id, p_target_user_id, p_target_user_id, 'end_shift', v_end, 'Admin correction: missing shift end');
    p_shift_id := v_new_shift.id;
    v_corrected := jsonb_build_object('shift_id', p_shift_id, 'start_time', v_start, 'end_time', v_end, 'status', 'completed', 'excluded_from_payroll', false);
  else
    select * into v_shift from public.tech_shifts where id = p_shift_id and shop_id = p_shop_id and user_id = p_target_user_id for update;
    if not found then raise exception 'Shift not found for target user in shop'; end if;
    v_original := to_jsonb(v_shift);
    v_start := coalesce(p_corrected_start_time, v_shift.start_time);
    v_end := coalesce(p_corrected_end_time, v_shift.end_time);

    if p_correction_type = 'void_shift' then
      update public.tech_shifts set excluded_from_payroll = true where id = v_shift.id;
      v_corrected := jsonb_build_object('shift_id', v_shift.id, 'excluded_from_payroll', true, 'start_time', v_shift.start_time, 'end_time', v_shift.end_time);
    else
      if v_start is null or v_end is null or v_end <= v_start then raise exception 'Corrected shift interval is invalid'; end if;
      if exists (select 1 from public.tech_shifts s where s.shop_id=p_shop_id and s.user_id=p_target_user_id and s.id <> v_shift.id and coalesce(s.excluded_from_payroll,false)=false and tstzrange(s.start_time, coalesce(s.end_time, 'infinity'::timestamptz), '[)') && tstzrange(v_start, v_end, '[)')) then
        raise exception 'Corrected shift overlaps another non-voided shift';
      end if;
      update public.tech_shifts set start_time = v_start, end_time = v_end, status = 'completed', excluded_from_payroll = false where id = v_shift.id;
      insert into public.punch_events (shift_id, user_id, profile_id, event_type, timestamp, note) values
        (v_shift.id, p_target_user_id, p_target_user_id, 'start_shift', v_start, 'Admin correction: effective boundary start'),
        (v_shift.id, p_target_user_id, p_target_user_id, 'end_shift', v_end, 'Admin correction: effective boundary end');
      v_corrected := jsonb_build_object('shift_id', v_shift.id, 'start_time', v_start, 'end_time', v_end, 'status', 'completed', 'excluded_from_payroll', false);
    end if;
  end if;

  select * into v_period from public.payroll_pay_periods
    where shop_id = p_shop_id and v_start::date between period_start and period_end
    order by period_start desc limit 1;
  if found then
    if v_period.status in ('approved','exported') then raise exception 'Approved/exported payroll periods are locked; reopen before correcting attendance'; end if;
    update public.payroll_pay_periods set notes = concat_ws(E'\n', notes, 'Attendance correction applied; rebuild required.'), updated_at = now() where id = v_period.id;
    v_payroll_status := 'rebuild_required';
  end if;

  insert into public.shift_corrections (shop_id, shift_id, target_user_id, actor_profile_id, correction_type, reason, original_data, corrected_data, payroll_rebuild_status)
  values (p_shop_id, p_shift_id, p_target_user_id, p_actor_profile_id, p_correction_type, trim(p_reason), v_original, v_corrected, v_payroll_status)
  returning id into v_correction_id;

  insert into public.audit_logs (actor_id, action, target, metadata)
  values (p_actor_profile_id, 'shift_correction.applied', p_shift_id::text, jsonb_build_object('correction_id', v_correction_id, 'shop_id', p_shop_id, 'target_user_id', p_target_user_id, 'correction_type', p_correction_type, 'reason', trim(p_reason), 'payroll_rebuild_status', v_payroll_status));

  return jsonb_build_object('id', v_correction_id, 'shift_id', p_shift_id, 'correction_type', p_correction_type, 'corrected_by', p_actor_profile_id, 'corrected_at', now(), 'reason', trim(p_reason), 'payroll_rebuild_status', v_payroll_status);
end;
$$;

grant execute on function public.apply_shift_correction(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text) to service_role;
