-- Restore the multi-technician assignment join table required by role-gated
-- work-order access and the canonical workforce assignment commands.

do $$
declare
  v_mode text;
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    if to_regclass('public.work_order_line_technicians') is null then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: work_order_line_technicians is required before role-gated work-order migrations.';
    end if;
    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

create table if not exists public.work_order_line_technicians (
  work_order_line_id uuid not null references public.work_order_lines(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (work_order_line_id, technician_id)
);

create index if not exists work_order_line_technicians_technician_line_idx
  on public.work_order_line_technicians(technician_id, work_order_line_id);

alter table public.work_order_line_technicians enable row level security;

drop policy if exists work_order_line_technicians_shop_select
  on public.work_order_line_technicians;
create policy work_order_line_technicians_shop_select
  on public.work_order_line_technicians
  for select to authenticated
  using (
    exists (
      select 1
      from public.work_order_lines wol
      where wol.id = work_order_line_technicians.work_order_line_id
        and wol.shop_id = public.current_shop_id()
    )
  );

drop policy if exists work_order_line_technicians_shop_insert
  on public.work_order_line_technicians;
create policy work_order_line_technicians_shop_insert
  on public.work_order_line_technicians
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.work_order_lines wol
      where wol.id = work_order_line_technicians.work_order_line_id
        and wol.shop_id = public.current_shop_id()
    )
    and exists (
      select 1
      from public.profiles p
      where p.id = work_order_line_technicians.technician_id
        and p.shop_id = public.current_shop_id()
    )
  );

drop policy if exists work_order_line_technicians_shop_delete
  on public.work_order_line_technicians;
create policy work_order_line_technicians_shop_delete
  on public.work_order_line_technicians
  for delete to authenticated
  using (
    exists (
      select 1
      from public.work_order_lines wol
      where wol.id = work_order_line_technicians.work_order_line_id
        and wol.shop_id = public.current_shop_id()
    )
  );
