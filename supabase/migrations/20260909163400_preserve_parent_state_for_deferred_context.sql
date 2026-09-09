-- Deferred carry-forward rows are passive context. Their own insert/update/delete
-- must not reconcile the operational parent shell. Active-line changes still use
-- the canonical tenant-bound reconciliation path.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '10min';

create or replace function public.refresh_work_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.work_order_id is not null then
    if not exists (
      select 1
      from public.work_orders parent
      where parent.id = new.work_order_id
        and parent.shop_id is not distinct from new.shop_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'WORK_ORDER_CHILD_TENANT_MISMATCH';
    end if;

    if lower(coalesce(new.status::text, '')) = 'deferred'
       or lower(coalesce(new.line_status::text, '')) = 'deferred' then
      return new;
    end if;

    perform private.reconcile_work_order_state(new.work_order_id);
  end if;
  return new;
end;
$function$;

create or replace function public.refresh_work_order_status_del()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_parent_shop_id uuid;
begin
  if old.work_order_id is not null then
    select parent.shop_id
      into v_parent_shop_id
    from public.work_orders parent
    where parent.id = old.work_order_id;

    if found then
      if v_parent_shop_id is distinct from old.shop_id then
        raise exception using
          errcode = '23514',
          message = 'WORK_ORDER_CHILD_TENANT_MISMATCH';
      end if;

      if lower(coalesce(old.status::text, '')) = 'deferred'
         or lower(coalesce(old.line_status::text, '')) = 'deferred' then
        return old;
      end if;

      perform private.reconcile_work_order_state(old.work_order_id);
    end if;
  end if;
  return old;
end;
$function$;

revoke all on function public.refresh_work_order_status()
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_work_order_status_del()
  from public, anon, authenticated, service_role;

commit;
