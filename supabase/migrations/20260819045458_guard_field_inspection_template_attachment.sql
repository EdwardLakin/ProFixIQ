begin;

create schema if not exists private authorization postgres;

create or replace function private.guard_work_order_line_inspection_template_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_status text;
  v_target_template_id uuid;
  v_previous_template_id uuid;
  v_has_inspection boolean;
begin
  -- This function is only reached when one of the two template-link columns
  -- actually changes. Keep the commercial parent stable until the line update
  -- commits so closeout cannot race the attachment.
  select lower(coalesce(wo.status, ''))
    into v_parent_status
  from public.work_orders as wo
  where wo.id = new.work_order_id
    and wo.shop_id = new.shop_id
  for share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The work-order line parent is missing or outside its shop.';
  end if;

  if new.voided_at is not null then
    raise exception using
      errcode = '23514',
      message = 'Voided job lines cannot receive an inspection template.';
  end if;

  if lower(
    replace(replace(btrim(coalesce(new.status::text, '')), ' ', '_'), '-', '_')
  ) in (
    'completed',
    'ready_to_invoice',
    'invoiced',
    'declined',
    'deferred',
    'cancelled',
    'canceled',
    'closed',
    'void',
    'voided'
  ) or lower(
    replace(replace(btrim(coalesce(new.line_status::text, '')), ' ', '_'), '-', '_')
  ) in (
    'completed',
    'ready_to_invoice',
    'invoiced',
    'declined',
    'deferred',
    'cancelled',
    'canceled',
    'closed',
    'void',
    'voided'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Completed job lines cannot receive an inspection template.';
  end if;

  if lower(
    replace(replace(btrim(v_parent_status), ' ', '_'), '-', '_')
  ) in (
    'completed',
    'ready_to_invoice',
    'invoiced',
    'cancelled',
    'canceled',
    'closed',
    'paid',
    'void',
    'voided',
    'archived'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Closed work orders cannot receive an inspection template.';
  end if;

  if new.inspection_template_id is not null
     and new.template_id is not null
     and new.inspection_template_id is distinct from new.template_id then
    raise exception using
      errcode = '23514',
      message = 'Canonical and legacy inspection-template links must agree.';
  end if;

  v_target_template_id := coalesce(
    new.inspection_template_id,
    new.template_id
  );

  -- Hold a key-share lock on the same-shop template until the line update
  -- commits. A concurrent template DELETE must then wait and observe the new
  -- reference, while an already-running DELETE makes this update fail closed.
  if v_target_template_id is not null then
    perform 1
    from public.inspection_templates as inspection_template
    where inspection_template.id = v_target_template_id
      and (
        inspection_template.shop_id = new.shop_id
        or inspection_template.is_public is true
      )
    for key share;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'The inspection template is missing or outside the line shop.';
    end if;
  end if;

  select exists (
    select 1
    from public.inspections as inspection
    where inspection.work_order_line_id = new.id
  ) into v_has_inspection;

  if v_has_inspection then
    -- Legacy rows can have a canonical inspection but no line-level template
    -- identity. Do not guess which template that inspection used.
    if old.inspection_template_id is null and old.template_id is null then
      raise exception using
        errcode = '23514',
        message = 'An existing inspection prevents assigning a new template identity.';
    end if;

    if old.inspection_template_id is not null
       and old.template_id is not null
       and old.inspection_template_id is distinct from old.template_id then
      raise exception using
        errcode = '23514',
        message = 'The existing inspection-template identity is inconsistent.';
    end if;

    v_previous_template_id := coalesce(
      old.inspection_template_id,
      old.template_id
    );

    -- Once inspection progress exists, only mirroring a pre-existing identity
    -- into the other legacy/canonical column is allowed.
    if new.inspection_template_id is distinct from v_previous_template_id
       or new.template_id is distinct from v_previous_template_id
       or exists (
         select 1
         from public.inspections as inspection
         where inspection.work_order_line_id = new.id
           and inspection.template_id is not null
           and inspection.template_id is distinct from v_previous_template_id
       ) then
      raise exception using
        errcode = '23514',
        message = 'Inspection progress prevents changing the template identity.';
    end if;
  end if;

  return new;
end;
$$;

revoke all privileges
  on function private.guard_work_order_line_inspection_template_parent()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_work_order_line_inspection_template_parent
  on public.work_order_lines;

create trigger trg_guard_work_order_line_inspection_template_parent
before update of inspection_template_id, template_id
on public.work_order_lines
for each row
when (
  old.inspection_template_id is distinct from new.inspection_template_id
  or old.template_id is distinct from new.template_id
)
execute function private.guard_work_order_line_inspection_template_parent();

comment on function private.guard_work_order_line_inspection_template_parent() is
  'Prevents inspection-template linkage changes from racing closeout, template deletion, or existing inspection identity.';

create or replace function private.guard_inserted_work_order_line_inspection_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_template_id uuid;
begin
  if new.inspection_template_id is not null
     and new.template_id is not null
     and new.inspection_template_id is distinct from new.template_id then
    raise exception using
      errcode = '23514',
      message = 'Canonical and legacy inspection-template links must agree.';
  end if;

  v_target_template_id := coalesce(
    new.inspection_template_id,
    new.template_id
  );

  -- Serialize direct Shop and trusted-function line inserts with template
  -- deletion. Public templates remain valid global sources; private templates
  -- must belong to the line shop.
  perform 1
  from public.inspection_templates as inspection_template
  where inspection_template.id = v_target_template_id
    and (
      inspection_template.shop_id = new.shop_id
      or inspection_template.is_public is true
    )
  for key share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The inspection template is missing or outside the line shop.';
  end if;

  return new;
end;
$$;

revoke all privileges
  on function private.guard_inserted_work_order_line_inspection_template()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_inserted_work_order_line_inspection_template
  on public.work_order_lines;

create trigger trg_guard_inserted_work_order_line_inspection_template
before insert
on public.work_order_lines
for each row
when (
  new.inspection_template_id is not null
  or new.template_id is not null
)
execute function private.guard_inserted_work_order_line_inspection_template();

comment on function private.guard_inserted_work_order_line_inspection_template() is
  'Serializes linked work-order-line inserts with inspection-template deletion.';

create or replace function private.guard_inspection_template_delete_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.work_order_lines as work_order_line
    where work_order_line.inspection_template_id = old.id
       or work_order_line.template_id = old.id
  ) then
    raise exception using
      errcode = '23503',
      message = 'Inspection templates attached to work-order lines cannot be deleted.';
  end if;

  return old;
end;
$$;

revoke all privileges
  on function private.guard_inspection_template_delete_references()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_inspection_template_delete_references
  on public.inspection_templates;

create trigger trg_guard_inspection_template_delete_references
before delete
on public.inspection_templates
for each row
execute function private.guard_inspection_template_delete_references();

comment on function private.guard_inspection_template_delete_references() is
  'Prevents template deletion from orphaning canonical or legacy work-order-line links.';

commit;
