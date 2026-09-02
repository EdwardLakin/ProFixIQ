begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Fleet and Customer Portal profiles are stored in the same profile relation as
-- Shop staff.  Keep the canonical staff predicate role-aware so the financial
-- read boundary treats those durable relationship actors as non-staff rather
-- than requiring an unrelated Shop financial capability.
create or replace function public.workspace_actor_is_staff_for_shop(
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
      and private.workspace_is_shop_staff_role(profile.role::text)
  );
$function$;

-- fleet_members.user_id is the canonical profile id. Imported accounts can
-- have profiles.id <> auth.uid(), so both product resolvers must map the auth
-- subject through profiles before testing Fleet membership.
create or replace function public.profixiq_shop_has_product_access(
  p_shop_id uuid,
  p_capability text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select case
      when shop.billing_entitlement_override in ('active', 'internal_demo') then true
      when shop.billing_entitlement_override in ('read_only', 'suspended') then false
      when not (
        lower(coalesce(shop.stripe_subscription_status, '')) in (
          'trialing', 'active', 'past_due'
        )
        or coalesce(shop.billing_grace_until > now(), false)
      ) then false
      when shop.subscription_package is null
        and shop.stripe_pricing_model <> 'product_packages_v1' then true
      when p_capability = 'shop' then
        shop.subscription_package in ('shop_operations', 'complete_operations')
      when p_capability = 'field_service' then
        shop.subscription_package in ('field_service', 'complete_operations')
      when p_capability = 'fleet_maintenance' then
        shop.subscription_package in ('fleet_maintenance', 'complete_operations')
      else false
    end
    from public.shops shop
    where shop.id = p_shop_id
      and (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.profiles profile
          where profile.shop_id = shop.id
            and (profile.id = auth.uid() or profile.user_id = auth.uid())
        )
        or exists (
          select 1
          from public.fleet_members member
          join public.profiles profile
            on profile.id = member.user_id
          where member.shop_id = shop.id
            and (profile.id = auth.uid() or profile.user_id = auth.uid())
        )
      )
  ), false);
$function$;

create or replace function public.profixiq_fleet_has_product_access(
  p_fleet_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select
      public.profixiq_shop_has_product_access(
        fleet.shop_id,
        'fleet_maintenance'
      )
      and (
        shop.subscription_package is distinct from 'complete_operations'
        or (
          select count(*)
          from public.fleet_vehicles fleet_vehicle
          where fleet_vehicle.fleet_id = fleet.id
            and fleet_vehicle.active
        ) <= 10
      )
    from public.fleets fleet
    join public.shops shop on shop.id = fleet.shop_id
    where fleet.id = p_fleet_id
      and fleet.active
      and (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.fleet_members member
          join public.profiles profile
            on profile.id = member.user_id
          where member.fleet_id = fleet.id
            and (profile.id = auth.uid() or profile.user_id = auth.uid())
        )
      )
  ), false);
$function$;

revoke all on function public.workspace_actor_is_staff_for_shop(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.workspace_actor_is_staff_for_shop(uuid)
  to authenticated, service_role;
revoke all on function public.profixiq_shop_has_product_access(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.profixiq_shop_has_product_access(uuid, text)
  to authenticated, service_role;
revoke all on function public.profixiq_fleet_has_product_access(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.profixiq_fleet_has_product_access(uuid)
  to authenticated, service_role;

-- Product entitlement is a database authorization boundary, not only a
-- navigation decision.  This helper binds the current authenticated actor to
-- an established Shop staff profile before delegating package/status/grace
-- semantics to the canonical entitlement function.
create or replace function public.profixiq_current_actor_has_shop_product_access(
  p_shop_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth.uid() is not null
    and public.workspace_actor_is_staff_for_shop(p_shop_id)
    and public.profixiq_shop_has_product_access(p_shop_id, 'shop');
$function$;

create or replace function private.profixiq_current_actor_has_field_work_order_access(
  p_shop_id uuid,
  p_work_order_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth.uid() is not null
    and public.profixiq_shop_has_product_access(
      p_shop_id,
      'field_service'
    )
    and public.mobile_actor_has_field_service_access(p_shop_id, auth.uid())
    and exists (
      select 1
      from public.service_visits visit
      where visit.shop_id = p_shop_id
        and visit.work_order_id = p_work_order_id
        and visit.mode = 'mobile'
        and (
          public.dispatch_can_manage(p_shop_id, auth.uid())
          or visit.assigned_user_id = public.dispatch_actor_profile_id(
            p_shop_id,
            auth.uid()
          )
        )
    );
$function$;

create or replace function private.profixiq_current_actor_has_fleet_work_order_access(
  p_shop_id uuid,
  p_work_order_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.fleet_service_requests service_request
      join public.fleets fleet
        on fleet.id = service_request.fleet_id
       and fleet.shop_id = service_request.shop_id
      join public.fleet_members member
        on member.fleet_id = fleet.id
       and member.shop_id = service_request.shop_id
      join public.profiles profile
        on profile.id = member.user_id
       and profile.shop_id = member.shop_id
      where service_request.shop_id = p_shop_id
        and (profile.id = auth.uid() or profile.user_id = auth.uid())
        and public.profixiq_fleet_has_product_access(
          fleet.id
        )
        and (
          service_request.work_order_id = p_work_order_id
          or exists (
            select 1
            from public.work_orders work_order
            where work_order.id = p_work_order_id
              and work_order.shop_id = p_shop_id
              and work_order.source_fleet_service_request_id = service_request.id
          )
        )
    );
$function$;

-- Mutation authority is intentionally narrower than read authority. Fleet and
-- Portal relationships can read their linked Work Orders, but only entitled
-- Shop staff or an assigned/manager Field actor may enter privileged Work
-- Order mutation cores.
create or replace function private.profixiq_current_actor_can_mutate_work_order_product(
  p_shop_id uuid,
  p_work_order_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    public.profixiq_current_actor_has_shop_product_access(p_shop_id)
    or private.profixiq_current_actor_has_field_work_order_access(
      p_shop_id,
      p_work_order_id
    );
$function$;

-- Work Orders are shared records, but product access is contextual:
--   * Shop staff require the Shop entitlement;
--   * Field operators can read only mobile visits they manage or own;
--   * Fleet members can read only Work Orders linked to their Fleet request;
--   * Portal customers retain their existing own-customer read contract.
-- This function is actor-bound and returns no row payload, so exposing EXECUTE
-- does not create an identifier-enumeration oracle beyond the caller's own
-- established relationship.
create or replace function public.profixiq_current_actor_can_read_work_order_product(
  p_shop_id uuid,
  p_work_order_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select
      public.profixiq_current_actor_has_shop_product_access(work_order.shop_id)
      or (
        work_order.customer_id is not null
        and public.profixiq_is_portal_customer_for(
          work_order.customer_id,
          work_order.shop_id
        )
      )
      or private.profixiq_current_actor_has_field_work_order_access(
        work_order.shop_id,
        work_order.id
      )
      or private.profixiq_current_actor_has_fleet_work_order_access(
        work_order.shop_id,
        work_order.id
      )
    from public.work_orders work_order
    where work_order.id = p_work_order_id
      and work_order.shop_id = p_shop_id
  ), false);
$function$;

create or replace function public.profixiq_current_actor_can_read_work_order_line_product(
  p_work_order_line_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select public.profixiq_current_actor_can_read_work_order_product(
      line.shop_id,
      line.work_order_id
    )
    from public.work_order_lines line
    where line.id = p_work_order_line_id
  ), false);
$function$;

create or replace function public.profixiq_current_actor_has_shop_product_for_line(
  p_work_order_line_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select public.profixiq_current_actor_has_shop_product_access(line.shop_id)
    from public.work_order_lines line
    where line.id = p_work_order_line_id
  ), false);
$function$;

revoke all on function public.profixiq_current_actor_has_shop_product_access(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.profixiq_current_actor_has_field_work_order_access(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.profixiq_current_actor_has_fleet_work_order_access(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.profixiq_current_actor_can_mutate_work_order_product(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.profixiq_current_actor_can_read_work_order_product(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.profixiq_current_actor_can_read_work_order_line_product(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.profixiq_current_actor_has_shop_product_for_line(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.profixiq_current_actor_has_shop_product_access(uuid)
  to authenticated, service_role;
grant execute on function private.profixiq_current_actor_has_field_work_order_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.profixiq_current_actor_has_fleet_work_order_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.profixiq_current_actor_can_read_work_order_product(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.profixiq_current_actor_can_read_work_order_line_product(uuid)
  to authenticated, service_role;
grant execute on function public.profixiq_current_actor_has_shop_product_for_line(uuid)
  to authenticated, service_role;

-- Restrictive policies compose with every existing role, capability,
-- estimate, financial, Portal, and assignment policy.  They grant nothing by
-- themselves; they only prevent a same-shop staff role from becoming a Shop
-- product entitlement.
drop policy if exists work_orders_product_select_boundary
  on public.work_orders;
create policy work_orders_product_select_boundary
on public.work_orders
as restrictive
for select
to authenticated
using (
  public.profixiq_current_actor_can_read_work_order_product(shop_id, id)
);

drop policy if exists work_orders_product_insert_boundary
  on public.work_orders;
create policy work_orders_product_insert_boundary
on public.work_orders
as restrictive
for insert
to authenticated
with check (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
);

drop policy if exists work_orders_product_update_boundary
  on public.work_orders;
create policy work_orders_product_update_boundary
on public.work_orders
as restrictive
for update
to authenticated
using (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
)
with check (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
);

drop policy if exists work_orders_product_delete_boundary
  on public.work_orders;
create policy work_orders_product_delete_boundary
on public.work_orders
as restrictive
for delete
to authenticated
using (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
);

drop policy if exists work_order_lines_product_select_boundary
  on public.work_order_lines;
create policy work_order_lines_product_select_boundary
on public.work_order_lines
as restrictive
for select
to authenticated
using (
  public.profixiq_current_actor_can_read_work_order_product(
    shop_id,
    work_order_id
  )
);

drop policy if exists work_order_lines_product_insert_boundary
  on public.work_order_lines;
create policy work_order_lines_product_insert_boundary
on public.work_order_lines
as restrictive
for insert
to authenticated
with check (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
);

drop policy if exists work_order_lines_product_update_boundary
  on public.work_order_lines;
create policy work_order_lines_product_update_boundary
on public.work_order_lines
as restrictive
for update
to authenticated
using (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
)
with check (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
);

drop policy if exists work_order_lines_product_delete_boundary
  on public.work_order_lines;
create policy work_order_lines_product_delete_boundary
on public.work_order_lines
as restrictive
for delete
to authenticated
using (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
);

drop policy if exists work_order_quote_lines_product_select_boundary
  on public.work_order_quote_lines;
create policy work_order_quote_lines_product_select_boundary
on public.work_order_quote_lines
as restrictive
for select
to authenticated
using (
  public.profixiq_current_actor_can_read_work_order_product(
    shop_id,
    work_order_id
  )
);

drop policy if exists work_order_quote_lines_product_insert_boundary
  on public.work_order_quote_lines;
create policy work_order_quote_lines_product_insert_boundary
on public.work_order_quote_lines
as restrictive
for insert
to authenticated
with check (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
);

drop policy if exists work_order_quote_lines_product_update_boundary
  on public.work_order_quote_lines;
create policy work_order_quote_lines_product_update_boundary
on public.work_order_quote_lines
as restrictive
for update
to authenticated
using (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
)
with check (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
);

drop policy if exists work_order_quote_lines_product_delete_boundary
  on public.work_order_quote_lines;
create policy work_order_quote_lines_product_delete_boundary
on public.work_order_quote_lines
as restrictive
for delete
to authenticated
using (
  public.profixiq_current_actor_has_shop_product_access(shop_id)
);

drop policy if exists work_order_line_technicians_product_select_boundary
  on public.work_order_line_technicians;
create policy work_order_line_technicians_product_select_boundary
on public.work_order_line_technicians
as restrictive
for select
to authenticated
using (
  public.profixiq_current_actor_can_read_work_order_line_product(
    work_order_line_id
  )
);

drop policy if exists work_order_line_technicians_product_insert_boundary
  on public.work_order_line_technicians;
create policy work_order_line_technicians_product_insert_boundary
on public.work_order_line_technicians
as restrictive
for insert
to authenticated
with check (
  public.profixiq_current_actor_has_shop_product_for_line(work_order_line_id)
);

drop policy if exists work_order_line_technicians_product_update_boundary
  on public.work_order_line_technicians;
create policy work_order_line_technicians_product_update_boundary
on public.work_order_line_technicians
as restrictive
for update
to authenticated
using (
  public.profixiq_current_actor_has_shop_product_for_line(work_order_line_id)
)
with check (
  public.profixiq_current_actor_has_shop_product_for_line(work_order_line_id)
);

drop policy if exists work_order_line_technicians_product_delete_boundary
  on public.work_order_line_technicians;
create policy work_order_line_technicians_product_delete_boundary
on public.work_order_line_technicians
as restrictive
for delete
to authenticated
using (
  public.profixiq_current_actor_has_shop_product_for_line(work_order_line_id)
);

-- Restrictive product policies cannot grant a row on their own.  These
-- permissive policies supply only the established Field/Fleet relationship;
-- the restrictive product, financial, and tenant policies still apply.
drop policy if exists work_orders_product_relationship_select
  on public.work_orders;
create policy work_orders_product_relationship_select
on public.work_orders
for select
to authenticated
using (
  private.profixiq_current_actor_has_field_work_order_access(shop_id, id)
  or private.profixiq_current_actor_has_fleet_work_order_access(shop_id, id)
);

drop policy if exists work_order_lines_product_relationship_select
  on public.work_order_lines;
create policy work_order_lines_product_relationship_select
on public.work_order_lines
for select
to authenticated
using (
  private.profixiq_current_actor_has_field_work_order_access(
    shop_id,
    work_order_id
  )
  or private.profixiq_current_actor_has_fleet_work_order_access(
    shop_id,
    work_order_id
  )
);

drop policy if exists work_order_quote_lines_product_relationship_select
  on public.work_order_quote_lines;
create policy work_order_quote_lines_product_relationship_select
on public.work_order_quote_lines
for select
to authenticated
using (
  private.profixiq_current_actor_has_field_work_order_access(
    shop_id,
    work_order_id
  )
  or private.profixiq_current_actor_has_fleet_work_order_access(
    shop_id,
    work_order_id
  )
);

drop policy if exists work_order_line_technicians_product_relationship_select
  on public.work_order_line_technicians;
create policy work_order_line_technicians_product_relationship_select
on public.work_order_line_technicians
for select
to authenticated
using (
  exists (
    select 1
    from public.work_order_lines line
    where line.id = work_order_line_technicians.work_order_line_id
      and (
        private.profixiq_current_actor_has_field_work_order_access(
          line.shop_id,
          line.work_order_id
        )
        or private.profixiq_current_actor_has_fleet_work_order_access(
          line.shop_id,
          line.work_order_id
        )
      )
  )
);

-- Evidence rows inherit the same product relationship as their canonical Work
-- Order.  Existing #1559 role/assignment policies remain the permissive write
-- authority; these restrictive policies add no write grant.
drop policy if exists work_order_media_product_select_boundary
  on public.work_order_media;
create policy work_order_media_product_select_boundary
on public.work_order_media
as restrictive
for select
to authenticated
using (
  public.profixiq_current_actor_can_read_work_order_product(
    shop_id,
    work_order_id
  )
);

drop policy if exists work_order_media_product_insert_boundary
  on public.work_order_media;
create policy work_order_media_product_insert_boundary
on public.work_order_media
as restrictive
for insert
to authenticated
with check (
  public.profixiq_current_actor_can_read_work_order_product(
    shop_id,
    work_order_id
  )
);

drop policy if exists work_order_media_product_update_boundary
  on public.work_order_media;
create policy work_order_media_product_update_boundary
on public.work_order_media
as restrictive
for update
to authenticated
using (
  public.profixiq_current_actor_can_read_work_order_product(
    shop_id,
    work_order_id
  )
)
with check (
  public.profixiq_current_actor_can_read_work_order_product(
    shop_id,
    work_order_id
  )
);

drop policy if exists work_order_media_product_delete_boundary
  on public.work_order_media;
create policy work_order_media_product_delete_boundary
on public.work_order_media
as restrictive
for delete
to authenticated
using (
  public.profixiq_current_actor_can_read_work_order_product(
    shop_id,
    work_order_id
  )
);

drop policy if exists work_order_media_product_relationship_select
  on public.work_order_media;
create policy work_order_media_product_relationship_select
on public.work_order_media
for select
to authenticated
using (
  private.profixiq_current_actor_has_field_work_order_access(
    shop_id,
    work_order_id
  )
  or (
    visibility = 'customer'
    and private.profixiq_current_actor_has_fleet_work_order_access(
      shop_id,
      work_order_id
    )
  )
);

-- Annotation rows are a second evidence read surface. Bind their direct table
-- reads to the canonical parent media/Work Order product relationship as well;
-- saves remain RPC-only and are product-gated below.
create or replace function private.work_order_media_annotation_has_product_access(
  p_media_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select public.profixiq_current_actor_can_read_work_order_product(
      media.shop_id,
      media.work_order_id
    )
    from public.work_order_media media
    where media.id = p_media_id
  ), false);
$function$;

revoke all on function private.work_order_media_annotation_has_product_access(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.work_order_media_annotation_has_product_access(uuid)
  to authenticated, service_role;

drop policy if exists work_order_media_annotations_product_select_boundary
  on public.work_order_media_annotations;
create policy work_order_media_annotations_product_select_boundary
on public.work_order_media_annotations
as restrictive
for select
to authenticated
using (
  private.work_order_media_annotation_has_product_access(media_id)
);

drop policy if exists work_order_media_annotations_product_relationship_select
  on public.work_order_media_annotations;
create policy work_order_media_annotations_product_relationship_select
on public.work_order_media_annotations
for select
to authenticated
using (
  exists (
    select 1
    from public.work_order_media media
    where media.id = work_order_media_annotations.media_id
      and media.shop_id = work_order_media_annotations.shop_id
      and (
        private.profixiq_current_actor_has_field_work_order_access(
          media.shop_id,
          media.work_order_id
        )
        or (
          media.visibility = 'customer'
          and work_order_media_annotations.visibility = 'customer'
          and private.profixiq_current_actor_has_fleet_work_order_access(
            media.shop_id,
            media.work_order_id
          )
        )
      )
  )
);

-- Storage policies cannot join a path to its Work Order without a controlled
-- definer lookup because Storage and Work Order RLS otherwise recurse through
-- one another.  These helpers return only an actor-bound decision.
create or replace function private.job_photo_object_has_product_access(
  p_name text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_match text[];
  v_work_order_id uuid;
  v_work_order_line_id uuid;
  v_shop_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_match := regexp_match(
    coalesce(p_name, ''),
    '^wo/([0-9a-fA-F-]{36})/lines/([0-9a-fA-F-]{36})/([^/]+)$'
  );
  if v_match is null then
    return false;
  end if;

  begin
    v_work_order_id := v_match[1]::uuid;
    v_work_order_line_id := v_match[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  select work_order.shop_id
    into v_shop_id
  from public.work_orders work_order
  join public.work_order_lines line
    on line.id = v_work_order_line_id
   and line.work_order_id = work_order.id
   and line.shop_id = work_order.shop_id
  where work_order.id = v_work_order_id;

  return v_shop_id is not null
    and public.profixiq_current_actor_can_read_work_order_product(
      v_shop_id,
      v_work_order_id
    );
end;
$function$;

create or replace function private.job_photo_object_relationship_read_access(
  p_name text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_match text[];
  v_work_order_id uuid;
  v_work_order_line_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_match := regexp_match(
    coalesce(p_name, ''),
    '^wo/([0-9a-fA-F-]{36})/lines/([0-9a-fA-F-]{36})/([^/]+)$'
  );
  if v_match is null then
    return false;
  end if;

  begin
    v_work_order_id := v_match[1]::uuid;
    v_work_order_line_id := v_match[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.work_orders work_order
    join public.work_order_lines line
      on line.id = v_work_order_line_id
     and line.work_order_id = work_order.id
     and line.shop_id = work_order.shop_id
    join public.work_order_media media
      on media.work_order_id = work_order.id
     and media.work_order_line_id = line.id
     and media.shop_id = work_order.shop_id
     and media.storage_bucket = 'job-photos'
     and media.storage_path = p_name
    where work_order.id = v_work_order_id
      and (
        private.profixiq_current_actor_has_field_work_order_access(
          work_order.shop_id,
          work_order.id
        )
        or (
          media.visibility = 'customer'
          and private.profixiq_current_actor_has_fleet_work_order_access(
            work_order.shop_id,
            work_order.id
          )
        )
      )
  );
end;
$function$;

create or replace function private.job_photo_object_has_mutation_access(
  p_name text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_match text[];
  v_work_order_id uuid;
  v_work_order_line_id uuid;
  v_shop_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_match := regexp_match(
    coalesce(p_name, ''),
    '^wo/([0-9a-fA-F-]{36})/lines/([0-9a-fA-F-]{36})/([^/]+)$'
  );
  if v_match is null then
    return false;
  end if;

  begin
    v_work_order_id := v_match[1]::uuid;
    v_work_order_line_id := v_match[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  select work_order.shop_id
    into v_shop_id
  from public.work_orders work_order
  join public.work_order_lines line
    on line.id = v_work_order_line_id
   and line.work_order_id = work_order.id
   and line.shop_id = work_order.shop_id
  where work_order.id = v_work_order_id;

  return v_shop_id is not null
    and private.profixiq_current_actor_can_mutate_work_order_product(
      v_shop_id,
      v_work_order_id
    );
end;
$function$;

revoke all on function private.job_photo_object_has_product_access(text)
  from public, anon, authenticated, service_role;
grant execute on function private.job_photo_object_has_product_access(text)
  to authenticated, service_role;
revoke all on function private.job_photo_object_relationship_read_access(text)
  from public, anon, authenticated, service_role;
grant execute on function private.job_photo_object_relationship_read_access(text)
  to authenticated, service_role;
revoke all on function private.job_photo_object_has_mutation_access(text)
  from public, anon, authenticated, service_role;
grant execute on function private.job_photo_object_has_mutation_access(text)
  to authenticated, service_role;

drop policy if exists job_photos_product_select_boundary on storage.objects;
create policy job_photos_product_select_boundary
on storage.objects
as restrictive
for select
to authenticated
using (
  bucket_id <> 'job-photos'
  or private.job_photo_object_has_product_access(name)
);

drop policy if exists job_photos_product_authorized_select on storage.objects;
create policy job_photos_product_authorized_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-photos'
  and private.job_photo_object_has_mutation_access(name)
);

drop policy if exists job_photos_product_insert_boundary on storage.objects;
create policy job_photos_product_insert_boundary
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'job-photos'
  or private.job_photo_object_has_mutation_access(name)
);

drop policy if exists job_photos_product_authorized_insert on storage.objects;
create policy job_photos_product_authorized_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'job-photos'
  and private.job_photo_object_has_mutation_access(name)
);

drop policy if exists job_photos_product_update_boundary on storage.objects;
create policy job_photos_product_update_boundary
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id <> 'job-photos'
  or private.job_photo_object_has_mutation_access(name)
)
with check (
  bucket_id <> 'job-photos'
  or private.job_photo_object_has_mutation_access(name)
);

drop policy if exists job_photos_product_authorized_update on storage.objects;
create policy job_photos_product_authorized_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'job-photos'
  and private.job_photo_object_has_mutation_access(name)
)
with check (
  bucket_id = 'job-photos'
  and private.job_photo_object_has_mutation_access(name)
);

drop policy if exists job_photos_product_delete_boundary on storage.objects;
create policy job_photos_product_delete_boundary
on storage.objects
as restrictive
for delete
to authenticated
using (
  bucket_id <> 'job-photos'
  or private.job_photo_object_has_product_access(name)
);

drop policy if exists job_photos_product_relationship_select on storage.objects;
create policy job_photos_product_relationship_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-photos'
  and private.job_photo_object_relationship_read_access(name)
);

-- Annotation saves can also promote canonical media to customer visibility.
-- Preserve #1559's role/assignment implementation as a private core and apply
-- this migration's product relationship before that privileged write runs.
alter function public.save_work_order_media_annotation_atomic(
  uuid, jsonb, text, text
) rename to save_work_order_media_annotation_product_core;
alter function public.save_work_order_media_annotation_product_core(
  uuid, jsonb, text, text
) set schema private;
revoke all on function private.save_work_order_media_annotation_product_core(
  uuid, jsonb, text, text
) from public, anon, authenticated, service_role;

create function public.save_work_order_media_annotation_atomic(
  p_media_id uuid,
  p_overlay jsonb,
  p_visibility text,
  p_client_mutation_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id uuid;
  v_work_order_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    select media.shop_id, media.work_order_id
      into v_shop_id, v_work_order_id
    from public.work_order_media media
    where media.id = p_media_id;

    if v_shop_id is null
       or not public.profixiq_current_actor_can_read_work_order_product(
         v_shop_id,
         v_work_order_id
       ) then
      raise exception using
        errcode = '42501',
        message = 'Media access denied.';
    end if;
  end if;

  return private.save_work_order_media_annotation_product_core(
    p_media_id,
    p_overlay,
    p_visibility,
    p_client_mutation_id
  );
end;
$function$;

revoke all on function public.save_work_order_media_annotation_atomic(
  uuid, jsonb, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.save_work_order_media_annotation_atomic(
  uuid, jsonb, text, text
) to authenticated, service_role;

-- SECURITY DEFINER Work Order entry points must enforce the same product
-- boundary even when called directly through PostgREST. Preserve each mature
-- implementation as an uncallable private core and keep the public signature
-- as a narrow actor/product wrapper.
alter function public.create_work_order_with_custom_id(
  uuid, uuid, uuid, text, integer, boolean, uuid
) rename to create_work_order_with_custom_id_product_core;
alter function public.create_work_order_with_custom_id_product_core(
  uuid, uuid, uuid, text, integer, boolean, uuid
) set schema private;
revoke all on function private.create_work_order_with_custom_id_product_core(
  uuid, uuid, uuid, text, integer, boolean, uuid
) from public, anon, authenticated, service_role;

create function public.create_work_order_with_custom_id(
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_notes text default ''::text,
  p_priority integer default 3,
  p_is_waiter boolean default false,
  p_advisor_id uuid default null::uuid
)
returns public.work_orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result public.work_orders%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_has_shop_product_access(p_shop_id) then
    raise exception using
      errcode = '42501',
      message = 'Shop product access is required.';
  end if;

  select * into v_result
  from private.create_work_order_with_custom_id_product_core(
    p_shop_id,
    p_customer_id,
    p_vehicle_id,
    p_notes,
    p_priority,
    p_is_waiter,
    p_advisor_id
  );
  return v_result;
end;
$function$;

revoke all on function public.create_work_order_with_custom_id(
  uuid, uuid, uuid, text, integer, boolean, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.create_work_order_with_custom_id(
  uuid, uuid, uuid, text, integer, boolean, uuid
) to authenticated, service_role;

-- These two mature Shop lifecycle commands remain browser-callable.  Their
-- internal role/actor checks do not establish a paid Shop product, so retain
-- those checks in private cores and apply the product gate at the Data API
-- boundary. Service-role assistant/fallback callers keep their existing path.
alter function public.work_order_delete_draft_atomic(
  uuid, uuid, text, uuid
) rename to work_order_delete_draft_product_core;
alter function public.work_order_delete_draft_product_core(
  uuid, uuid, text, uuid
) set schema private;
revoke all on function private.work_order_delete_draft_product_core(
  uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;

-- The original draft-delete command predates the canonical supplier quote and
-- purchase-order tables. Production still has an empty legacy
-- public.supplier_orders relation, but a clean migration replay does not. Keep
-- legacy history fail-closed when that relation exists while making the
-- canonical sourcing records authoritative on every schema.
create or replace function private.work_order_has_supplier_history(
  p_shop_id uuid,
  p_work_order_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_has_legacy_history boolean := false;
begin
  if exists (
    select 1
    from public.purchase_orders purchase_order
    where purchase_order.shop_id = p_shop_id
      and purchase_order.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.parts_supplier_quote_requests quote_request
    where quote_request.shop_id = p_shop_id
      and quote_request.work_order_id = p_work_order_id
  ) then
    return true;
  end if;

  if pg_catalog.to_regclass('public.supplier_orders') is not null then
    execute $legacy_supplier_history$
      select exists (
        select 1
        from public.supplier_orders supplier_order
        where supplier_order.shop_id = $1
          and supplier_order.work_order_id = $2
      )
    $legacy_supplier_history$
      into v_has_legacy_history
      using p_shop_id, p_work_order_id;
  end if;

  return v_has_legacy_history;
end;
$function$;

revoke all on function private.work_order_has_supplier_history(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.work_order_delete_draft_product_core(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_operation_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_authenticated_user_id uuid := auth.uid();
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_operation public.parts_operation_keys;
  v_result jsonb;
begin
  if p_shop_id is null or p_work_order_id is null then
    raise exception using
      errcode = '22023',
      message = 'WORK_ORDER_DELETE_SCOPE_REQUIRED';
  end if;

  if coalesce(trim(p_operation_key), '') = ''
     or p_operation_key <> (
       p_shop_id::text || ':delete-draft-work-order:' || p_work_order_id::text
     ) then
    raise exception using
      errcode = '22023',
      message = 'WORK_ORDER_DELETE_OPERATION_KEY_INVALID';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if v_authenticated_user_id is null then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_DELETE_AUTHENTICATION_REQUIRED';
    end if;

    if p_actor_user_id is null
       or v_authenticated_user_id is distinct from p_actor_user_id then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_DELETE_ACTOR_MISMATCH';
    end if;

    select lower(trim(coalesce(profile.role::text, '')))
      into v_actor_role
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (
        profile.id = v_authenticated_user_id
        or profile.user_id = v_authenticated_user_id
      )
    order by (profile.id = v_authenticated_user_id) desc
    limit 1;

    if v_actor_role is null then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_DELETE_SHOP_ACCESS_DENIED';
    end if;

    if v_actor_role not in ('owner', 'admin') then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_DELETE_ROLE_ACCESS_DENIED';
    end if;
  end if;

  v_operation := public.parts_begin_operation(
    p_shop_id,
    p_operation_key,
    'delete_draft_work_order',
    'work_order',
    p_work_order_id,
    p_actor_user_id
  );
  if v_operation.completed_at is not null then
    return coalesce(v_operation.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  select work_order_row.*
    into v_work_order
  from public.work_orders work_order_row
  where work_order_row.id = p_work_order_id
    and work_order_row.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'WORK_ORDER_DELETE_NOT_FOUND_FOR_SHOP';
  end if;

  if lower(coalesce(v_work_order.status::text, '')) not in (
    'awaiting',
    'awaiting_inspection',
    'draft',
    'new',
    'pending',
    'queued'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_NOT_DRAFT';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id)
     or coalesce(v_work_order.invoice_total, 0) <> 0
     or coalesce(v_work_order.labor_total, 0) <> 0
     or coalesce(v_work_order.parts_total, 0) <> 0
     or v_work_order.customer_approval_at is not null
     or v_work_order.customer_agreed_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_FINANCIAL_OR_APPROVAL_HISTORY';
  end if;

  if exists (
    select 1
    from public.invoices invoice_row
    where invoice_row.shop_id = p_shop_id
      and invoice_row.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.payments payment_row
    where payment_row.shop_id = p_shop_id
      and payment_row.work_order_id = p_work_order_id
  ) or private.work_order_has_supplier_history(
    p_shop_id,
    p_work_order_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_FINANCIAL_OR_SUPPLIER_HISTORY';
  end if;

  if exists (
    select 1
    from public.work_order_line_labor_segments labor_segment
    where labor_segment.shop_id = p_shop_id
      and labor_segment.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.inspections inspection_row
    where inspection_row.shop_id = p_shop_id
      and inspection_row.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.inspection_sessions inspection_session
    where inspection_session.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.work_order_quote_lines quote_line
    where quote_line.shop_id = p_shop_id
      and quote_line.work_order_id = p_work_order_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_OPERATIONAL_HISTORY';
  end if;

  if exists (
    select 1
    from public.work_order_parts work_order_part
    where work_order_part.shop_id = p_shop_id
      and work_order_part.work_order_id = p_work_order_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_PARTS_HISTORY';
  end if;

  if exists (
    select 1
    from public.part_requests request_row
    where request_row.shop_id = p_shop_id
      and request_row.work_order_id = p_work_order_id
      and lower(coalesce(request_row.status::text, '')) not in (
        'cancelled',
        'deferred',
        'quoted',
        'rejected',
        'requested'
      )
  ) or exists (
    select 1
    from public.part_request_items item
    join public.part_requests request_row
      on request_row.id = item.request_id
     and request_row.shop_id = p_shop_id
    where request_row.work_order_id = p_work_order_id
      and (
        lower(coalesce(item.status::text, '')) not in (
          'awaiting_customer_approval',
          'cancelled',
          'quoted',
          'requested'
        )
        or coalesce(item.approved, false)
        or coalesce(item.qty_approved, 0) > 0
        or coalesce(item.qty_reserved, 0) > 0
        or coalesce(item.qty_picked, 0) > 0
        or coalesce(item.qty_ordered, 0) > 0
        or coalesce(item.qty_received, 0) > 0
        or coalesce(item.qty_consumed, 0) > 0
        or coalesce(item.qty_returned, 0) > 0
        or item.po_id is not null
        or item.source_work_order_part_id is not null
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_ACTIVE_PARTS_HISTORY';
  end if;

  if exists (
    select 1
    from public.work_order_lines work_order_line
    where work_order_line.shop_id = p_shop_id
      and work_order_line.work_order_id = p_work_order_id
      and (
        lower(coalesce(work_order_line.status::text, '')) not in (
          'awaiting',
          'awaiting_approval',
          'new',
          'pending',
          'queued'
        )
        or work_order_line.punched_in_at is not null
        or work_order_line.punched_out_at is not null
        or nullif(trim(coalesce(work_order_line.cause, '')), '') is not null
        or nullif(trim(coalesce(work_order_line.correction, '')), '') is not null
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_ACTIVE_LABOR_HISTORY';
  end if;

  delete from public.part_request_items item
  using public.part_requests request_row
  where item.request_id = request_row.id
    and request_row.shop_id = p_shop_id
    and request_row.work_order_id = p_work_order_id;

  delete from public.part_request_lines request_line
  using public.part_requests request_row
  where request_line.request_id = request_row.id
    and request_row.shop_id = p_shop_id
    and request_row.work_order_id = p_work_order_id;

  delete from public.part_requests request_row
  where request_row.shop_id = p_shop_id
    and request_row.work_order_id = p_work_order_id;

  delete from public.work_order_lines work_order_line
  where work_order_line.shop_id = p_shop_id
    and work_order_line.work_order_id = p_work_order_id;

  delete from public.work_orders work_order_row
  where work_order_row.id = p_work_order_id
    and work_order_row.shop_id = p_shop_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_FAILED';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'deleted', true,
    'work_order_id', p_work_order_id
  );
  return public.parts_complete_operation(v_operation.id, v_result);
end;
$function$;

create function public.work_order_delete_draft_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_operation_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_has_shop_product_access(p_shop_id) then
    raise exception using
      errcode = '42501',
      message = 'Shop product access is required.';
  end if;

  return private.work_order_delete_draft_product_core(
    p_shop_id,
    p_work_order_id,
    p_operation_key,
    p_actor_user_id
  );
end;
$function$;

revoke all on function public.work_order_delete_draft_atomic(
  uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.work_order_delete_draft_atomic(
  uuid, uuid, text, uuid
) to authenticated, service_role;

alter function public.mark_work_order_ready_atomic(
  uuid, uuid, uuid, text, timestamptz
) rename to mark_work_order_ready_product_core;
alter function public.mark_work_order_ready_product_core(
  uuid, uuid, uuid, text, timestamptz
) set schema private;
revoke all on function private.mark_work_order_ready_product_core(
  uuid, uuid, uuid, text, timestamptz
) from public, anon, authenticated, service_role;

create function public.mark_work_order_ready_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_has_shop_product_access(p_shop_id) then
    raise exception using
      errcode = '42501',
      message = 'Shop product access is required.';
  end if;

  return private.mark_work_order_ready_product_core(
    p_shop_id,
    p_work_order_id,
    p_actor_user_id,
    p_operation_key,
    p_at
  );
end;
$function$;

revoke all on function public.mark_work_order_ready_atomic(
  uuid, uuid, uuid, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.mark_work_order_ready_atomic(
  uuid, uuid, uuid, text, timestamptz
) to authenticated, service_role;

-- The deepest mature Mobile handoff core predates this wrapper and calls the
-- public custom-id creator when a manager creates the Work Order. Route that
-- one already-authorized internal call to the private implementation so a
-- Field-only manager can complete an assigned mobile visit without making the
-- public creator generally available to Field actors. The later mode and
-- end-to-end wrappers remain unchanged around this core.
create or replace function private.mobile_materialize_visit_wo_v1_core(
  p_shop_id uuid,
  p_visit_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_profile public.profiles%rowtype;
  v_visit public.service_visits%rowtype;
  v_booking public.bookings%rowtype;
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_custom_id text;
  v_role text;
  v_visit_linked_directly boolean := false;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;

  select result into v_existing
  from public.mobile_operation_keys operation_key
  where operation_key.shop_id = p_shop_id
    and operation_key.operation_name = 'mobile_materialize_work_order'
    and operation_key.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_profile
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (
      profile.id = p_actor_user_id
      or profile.user_id = p_actor_user_id
    )
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;
  v_role := lower(coalesce(v_profile.role, ''));

  select * into v_visit
  from public.service_visits visit
  where visit.id = p_visit_id
    and visit.shop_id = p_shop_id
  for update;
  if not found or v_visit.booking_id is null then
    raise exception using errcode = 'P0001', message = 'Booking-backed Service Visit not found.';
  end if;

  if not public.mobile_can_manage_work_orders(p_shop_id, p_actor_user_id)
     and not (
       v_visit.assigned_user_id = v_profile.id
       and public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id)
     ) then
    raise exception using
      errcode = '42501',
      message = 'Work-order handoff requires work-order creation authority or the assigned technician.';
  end if;

  select * into v_booking
  from public.bookings booking
  where booking.id = v_visit.booking_id
    and booking.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Linked booking not found.';
  end if;

  if v_visit.work_order_id is not null then
    select * into v_work_order
    from public.work_orders work_order
    where work_order.id = v_visit.work_order_id
      and work_order.shop_id = p_shop_id;
  elsif v_booking.work_order_id is not null then
    select * into v_work_order
    from public.work_orders work_order
    where work_order.id = v_booking.work_order_id
      and work_order.shop_id = p_shop_id;
  end if;

  if v_work_order.id is null then
    if v_booking.customer_id is null or v_booking.vehicle_id is null then
      raise exception using
        errcode = '23503',
        message = 'Customer and vehicle are required before creating the work order.';
    end if;

    if not exists (
      select 1
      from public.vehicles vehicle
      where vehicle.id = v_booking.vehicle_id
        and vehicle.shop_id = p_shop_id
        and vehicle.customer_id = v_booking.customer_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'Booking vehicle does not belong to the booking customer.';
    end if;

    if public.mobile_can_manage_work_orders(p_shop_id, p_actor_user_id) then
      select * into v_work_order
      from private.create_work_order_with_custom_id_product_core(
        p_shop_id,
        v_booking.customer_id,
        v_booking.vehicle_id,
        coalesce(v_booking.notes, v_visit.dispatch_notes, ''),
        3,
        false,
        case
          when v_role in ('advisor','service','manager','owner','admin') then
            v_profile.id
          else null
        end
      );
    else
      loop
        v_custom_id := 'WO-'
          || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
        insert into public.work_orders(
          shop_id, customer_id, vehicle_id, notes, priority, is_waiter,
          created_by, advisor_id, custom_id, status
        ) values (
          p_shop_id, v_booking.customer_id, v_booking.vehicle_id,
          coalesce(v_booking.notes, v_visit.dispatch_notes, ''), 3, false,
          coalesce(auth.uid(), p_actor_user_id), null, v_custom_id, 'awaiting'
        ) on conflict do nothing
        returning * into v_work_order;
        exit when v_work_order.id is not null;
      end loop;
    end if;
  end if;

  update public.bookings
  set work_order_id = v_work_order.id,
      lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'mobile_work_order_handoff_operation_key',
          p_operation_key
        ),
      updated_at = now()
  where id = v_booking.id
    and (work_order_id is null or work_order_id = v_work_order.id);

  select * into v_booking
  from public.bookings booking
  where booking.id = v_booking.id
    and booking.shop_id = p_shop_id;
  if not found or v_booking.work_order_id is distinct from v_work_order.id then
    raise exception using
      errcode = 'P0001',
      message = 'Booking did not accept the work-order handoff.';
  end if;

  select * into v_visit
  from public.service_visits visit
  where visit.id = p_visit_id
    and visit.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Service Visit disappeared during work-order handoff.';
  end if;

  if v_visit.work_order_id is null then
    update public.service_visits visit
    set work_order_id = v_work_order.id,
        version = visit.version + 1,
        updated_at = now()
    where visit.id = p_visit_id
      and visit.shop_id = p_shop_id
      and visit.work_order_id is null
    returning * into v_visit;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'Service Visit work-order handoff changed concurrently.';
    end if;
    v_visit_linked_directly := true;
  end if;

  if v_visit.work_order_id is distinct from v_work_order.id then
    raise exception using
      errcode = 'P0001',
      message = 'Service Visit did not accept the work-order handoff.';
  end if;

  if v_visit_linked_directly then
    insert into public.service_visit_events(
      shop_id, service_visit_id, event_type, from_status, to_status,
      actor_user_id, assigned_user_id, service_vehicle_id, metadata
    ) values (
      p_shop_id, v_visit.id, 'updated', v_visit.status, v_visit.status,
      v_profile.id, v_visit.assigned_user_id, v_visit.service_vehicle_id,
      jsonb_build_object(
        'source', 'mobile_work_order_handoff',
        'booking_id', v_booking.id,
        'work_order_id', v_work_order.id,
        'operation_key', p_operation_key
      )
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'serviceVisitId', v_visit.id,
    'bookingId', v_booking.id,
    'workOrderId', v_work_order.id,
    'workOrderNumber', v_work_order.custom_id,
    'visit', public.dispatch_visit_snapshot(v_visit.id)
  );

  insert into public.mobile_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'mobile_materialize_work_order', p_operation_key,
    coalesce(auth.uid(), p_actor_user_id), v_work_order.id, v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;

  return v_result;
end;
$function$;

revoke all on function private.mobile_materialize_visit_wo_v1_core(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

alter function public.materialize_offline_work_order_draft_atomic(
  uuid, uuid, text, uuid, uuid, jsonb
) rename to materialize_offline_work_order_draft_product_core;
alter function public.materialize_offline_work_order_draft_product_core(
  uuid, uuid, text, uuid, uuid, jsonb
) set schema private;
-- The legacy implementation resolves pgcrypto helpers without qualification.
-- Keep its hardened execution path away from the caller-controlled public
-- schema while retaining access to digest/gen_random_uuid in extensions.
alter function private.materialize_offline_work_order_draft_product_core(
  uuid, uuid, text, uuid, uuid, jsonb
) set search_path = pg_catalog, extensions;
revoke all on function private.materialize_offline_work_order_draft_product_core(
  uuid, uuid, text, uuid, uuid, jsonb
) from public, anon, authenticated, service_role;

create function public.materialize_offline_work_order_draft_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_has_shop_product_access(p_shop_id) then
    raise exception using
      errcode = '42501',
      message = 'Shop product access is required.';
  end if;

  return private.materialize_offline_work_order_draft_product_core(
    p_shop_id,
    p_actor_user_id,
    p_operation_key,
    p_customer_id,
    p_vehicle_id,
    p_payload
  );
end;
$function$;

revoke all on function public.materialize_offline_work_order_draft_atomic(
  uuid, uuid, text, uuid, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.materialize_offline_work_order_draft_atomic(
  uuid, uuid, text, uuid, uuid, jsonb
) to authenticated, service_role;

-- Only the legacy five-argument assignment wrapper is browser callable. The
-- seven-argument canonical mutation overload remains service-role-only.
alter function public.assign_work_order_line_technician_atomic(
  uuid, uuid, uuid, uuid, text
) rename to assign_work_order_line_technician_product_core;
alter function public.assign_work_order_line_technician_product_core(
  uuid, uuid, uuid, uuid, text
) set schema private;
revoke all on function private.assign_work_order_line_technician_product_core(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

create function public.assign_work_order_line_technician_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_technician_id uuid,
  p_assigned_by uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_has_shop_product_access(p_shop_id) then
    raise exception using
      errcode = '42501',
      message = 'Shop product access is required.';
  end if;

  return private.assign_work_order_line_technician_product_core(
    p_shop_id,
    p_work_order_line_id,
    p_technician_id,
    p_assigned_by,
    p_operation_key
  );
end;
$function$;

revoke all on function public.assign_work_order_line_technician_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.assign_work_order_line_technician_atomic(
  uuid, uuid, uuid, uuid, text
) to authenticated, service_role;

alter function public.get_work_order_assignments(uuid)
  rename to get_work_order_assignments_product_core;
alter function public.get_work_order_assignments_product_core(uuid)
  set schema private;
revoke all on function private.get_work_order_assignments_product_core(uuid)
  from public, anon, authenticated, service_role;

create function public.get_work_order_assignments(p_work_order_id uuid)
returns table(
  technician_id uuid,
  full_name text,
  role text,
  has_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_shop_id uuid;
begin
  select work_order.shop_id
    into v_shop_id
  from public.work_orders work_order
  where work_order.id = p_work_order_id;

  if v_shop_id is null then
    return;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_can_read_work_order_product(
       v_shop_id,
       p_work_order_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Work Order product access is required.';
  end if;

  return query
  select
    assignment.technician_id,
    assignment.full_name,
    assignment.role,
    assignment.has_active
  from private.get_work_order_assignments_product_core(
    p_work_order_id
  ) assignment;
end;
$function$;

revoke all on function public.get_work_order_assignments(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_work_order_assignments(uuid)
  to authenticated, service_role;

-- Both Fleet conversion names are retained for compatibility. They now enter
-- the unchanged conversion logic only after the authenticated Shop actor has a
-- current Shop product entitlement.
alter function public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)
  rename to convert_owned_fleet_request_work_order_product_core;
alter function public.convert_owned_fleet_request_work_order_product_core(uuid)
  set schema private;
revoke all on function private.convert_owned_fleet_request_work_order_product_core(uuid)
  from public, anon, authenticated, service_role;

create function public.convert_owned_fleet_service_request_to_work_order_atomic(
  p_service_request_id uuid
)
returns table(work_order_id uuid, conversion_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id uuid;
begin
  select service_request.shop_id
    into v_shop_id
  from public.fleet_service_requests service_request
  where service_request.id = p_service_request_id;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_has_shop_product_access(v_shop_id) then
    raise exception using
      errcode = 'P0002',
      message = 'Fleet service request is unavailable.';
  end if;

  return query
  select conversion.work_order_id, conversion.conversion_status
  from private.convert_owned_fleet_request_work_order_product_core(
    p_service_request_id
  ) conversion;
end;
$function$;

revoke all on function public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)
  to authenticated, service_role;

alter function public.convert_fleet_service_request_to_work_order_atomic(uuid)
  rename to convert_fleet_request_work_order_product_core;
alter function public.convert_fleet_request_work_order_product_core(uuid)
  set schema private;
revoke all on function private.convert_fleet_request_work_order_product_core(uuid)
  from public, anon, authenticated, service_role;

create function public.convert_fleet_service_request_to_work_order_atomic(
  p_service_request_id uuid
)
returns table(work_order_id uuid, conversion_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id uuid;
begin
  select service_request.shop_id
    into v_shop_id
  from public.fleet_service_requests service_request
  where service_request.id = p_service_request_id;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_has_shop_product_access(v_shop_id) then
    raise exception using
      errcode = 'P0002',
      message = 'Fleet service request is unavailable.';
  end if;

  return query
  select conversion.work_order_id, conversion.conversion_status
  from private.convert_fleet_request_work_order_product_core(
    p_service_request_id
  ) conversion;
end;
$function$;

revoke all on function public.convert_fleet_service_request_to_work_order_atomic(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.convert_fleet_service_request_to_work_order_atomic(uuid)
  to authenticated, service_role;

-- Shop Mobile and Field Service legitimately share rapid intake. Product-gate
-- the effective mode without routing Field work through the Shop entitlement.
create or replace function public.mobile_create_service_call_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_phone text,
  p_vehicle_id uuid,
  p_vehicle_year integer,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_plate text,
  p_address_line1 text,
  p_city text,
  p_province_state text,
  p_postal_code text,
  p_concern text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_quoted_price numeric,
  p_currency text,
  p_service_mode text,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_config_model text;
  v_effective_mode text;
  v_requested_mode text := lower(nullif(trim(coalesce(p_service_mode, '')), ''));
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Authenticated actor mismatch.';
  end if;

  select lower(coalesce(
      settings.service_model,
      case
        when shop.location_type = 'mobile_service_branch' then 'mobile'
        else 'shop'
      end
    ))
    into v_config_model
  from public.shops shop
  left join public.mobile_service_settings settings
    on settings.shop_id = shop.id
  where shop.id = p_shop_id;

  if not found then
    raise exception using errcode = '23503', message = 'Shop not found.';
  end if;

  if v_config_model = 'both' then
    if v_requested_mode not in ('shop', 'mobile') then
      raise exception using
        errcode = '22023',
        message = 'Choose shop or mobile service for this call.';
    end if;
    v_effective_mode := v_requested_mode;
  elsif v_config_model in ('shop', 'mobile') then
    v_effective_mode := v_config_model;
  else
    v_effective_mode := case
      when v_requested_mode in ('shop', 'mobile') then v_requested_mode
      else 'shop'
    end;
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if v_effective_mode = 'mobile' then
      if not public.profixiq_shop_has_product_access(
        p_shop_id,
        'field_service'
      ) or not public.mobile_actor_has_field_service_access(
        p_shop_id,
        p_actor_user_id
      ) then
        raise exception using
          errcode = '42501',
          message = 'Field Service access is required.';
      end if;
    elsif not public.profixiq_current_actor_has_shop_product_access(p_shop_id) then
      raise exception using
        errcode = '42501',
        message = 'Shop product access is required.';
    end if;
  end if;

  return private.mobile_create_service_call_field_service_core(
    p_shop_id, p_customer_id, p_customer_name, p_phone, p_vehicle_id,
    p_vehicle_year, p_vehicle_make, p_vehicle_model, p_vehicle_plate,
    p_address_line1, p_city, p_province_state, p_postal_code, p_concern,
    p_starts_at, p_duration_minutes, p_quoted_price, p_currency,
    p_service_mode, p_actor_user_id, p_operation_key
  );
end;
$function$;

revoke all on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) to authenticated, service_role;
revoke all on function private.mobile_create_service_call_field_service_core(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) from public, anon, authenticated, service_role;

create or replace function public.mobile_materialize_service_visit_work_order_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text;
  v_result jsonb;
  v_line_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Authenticated actor mismatch.';
  end if;

  select visit.mode
    into v_mode
  from public.service_visits visit
  where visit.id = p_visit_id
    and visit.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Service visit not found.';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if v_mode = 'mobile' then
      if not public.profixiq_shop_has_product_access(
        p_shop_id,
        'field_service'
      ) or not public.mobile_actor_has_field_service_access(
        p_shop_id,
        p_actor_user_id
      ) then
        raise exception using
          errcode = '42501',
          message = 'Field Service access is required.';
      end if;
    elsif not public.profixiq_current_actor_has_shop_product_access(p_shop_id) then
      raise exception using
        errcode = '42501',
        message = 'Shop product access is required.';
    end if;
  end if;

  v_result := private.mobile_materialize_visit_work_order_mode_core(
    p_shop_id,
    p_visit_id,
    p_actor_user_id,
    p_operation_key
  );
  v_line_id := nullif(v_result ->> 'initialWorkOrderLineId', '')::uuid;

  if v_line_id is not null then
    update public.work_order_lines line
    set assigned_to = null,
        updated_at = greatest(
          clock_timestamp(),
          line.updated_at + interval '1 microsecond'
        )
    where line.id = v_line_id
      and line.shop_id = p_shop_id
      and line.assigned_to is not null
      and line.assigned_tech_id is not null
      and exists (
        select 1
        from public.work_order_line_technicians assignment
        where assignment.work_order_line_id = line.id
          and assignment.technician_id = line.assigned_tech_id
      );
  end if;

  return v_result;
end;
$function$;

revoke all on function public.mobile_materialize_service_visit_work_order_atomic(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.mobile_materialize_service_visit_work_order_atomic(
  uuid, uuid, uuid, text
) to authenticated, service_role;
revoke all on function private.mobile_materialize_visit_work_order_mode_core(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

-- Inspection quote import is a public PostgREST entry point whose mature
-- implementation runs as SECURITY DEFINER. Keep its signature stable, bind
-- the authenticated actor, preserve an exact durable replay, and require Shop
-- or linked-Field mutation authority before entering the private core.
alter function public.import_inspection_quote_package_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) rename to import_inspection_quote_package_product_core;
alter function public.import_inspection_quote_package_product_core(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) set schema private;
revoke all on function private.import_inspection_quote_package_product_core(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;

create function public.import_inspection_quote_package_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_inspection_id uuid,
  p_requested_vehicle_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_items jsonb,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.quote_lifecycle_operation_keys%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_actor_user_id then
    raise exception using
      errcode = '42501',
      message = 'Inspection import actor mismatch.';
  end if;

  select operation.*
    into v_existing
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'inspection_quote_import'
    and operation.operation_key = p_operation_key;
  if found then
    if v_existing.actor_user_id is distinct from p_actor_user_id
       or v_existing.work_order_id is distinct from p_work_order_id then
      raise exception using
        errcode = '23505',
        message = 'INSPECTION_IMPORT_OPERATION_CONFLICT';
    end if;
    return private.import_inspection_quote_package_product_core(
      p_shop_id,
      p_work_order_id,
      p_inspection_id,
      p_requested_vehicle_id,
      p_actor_user_id,
      p_operation_key,
      p_items,
      p_at
    );
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not private.profixiq_current_actor_can_mutate_work_order_product(
       p_shop_id,
       p_work_order_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Work Order product access is required.';
  end if;

  return private.import_inspection_quote_package_product_core(
    p_shop_id,
    p_work_order_id,
    p_inspection_id,
    p_requested_vehicle_id,
    p_actor_user_id,
    p_operation_key,
    p_items,
    p_at
  );
end;
$function$;

revoke all on function public.import_inspection_quote_package_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.import_inspection_quote_package_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) to authenticated, service_role;

-- Preserve the canonical PO receipt signature and Shop-wide FIFO allocation.
-- Field callers must prove that every PO line is backed by a linked request
-- item, and their allocation lane is limited to those exact request items.
create or replace function public.receive_po_part_and_allocate(
  p_po_id uuid,
  p_part_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_operation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_shop_id uuid;
  v_po_status text;
  v_operation_key text;
  v_move public.stock_moves%rowtype;
  v_result jsonb;
  v_po_remaining numeric;
  v_remaining numeric;
  v_po_closed boolean := false;
  v_field_restricted boolean := false;
  v_item record;
  v_target numeric;
  v_received numeric;
  v_need numeric;
  v_take numeric;
  v_alloc jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Not authenticated';
  end if;
  if p_po_id is null
     or p_part_id is null
     or p_location_id is null
     or p_operation_id is null then
    raise exception using
      errcode = '22023',
      message = 'PO, part, location, and operation id are required';
  end if;
  if p_qty is null
     or p_qty <= 0
     or p_qty::text in ('NaN', 'Infinity', '-Infinity')
     or round(p_qty, 2) is distinct from p_qty then
    raise exception using
      errcode = '22023',
      message = 'Receipt quantity must be positive with at most two decimal places';
  end if;

  select purchase_order.shop_id, purchase_order.status::text
    into v_shop_id, v_po_status
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id
  for update;
  if v_shop_id is null then
    raise exception using errcode = 'P0002', message = 'Purchase order not found';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where (profile.id = v_uid or profile.user_id = v_uid)
      and profile.shop_id = v_shop_id
      and public.canonical_shop_membership_role(profile.role::text) in (
        'owner', 'admin', 'manager', 'lead_hand', 'foreman', 'parts'
      )
  ) then
    raise exception using errcode = '42501', message = 'Parts permission required';
  end if;
  if not exists (
    select 1
    from public.parts part
    where part.id = p_part_id
      and part.shop_id = v_shop_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Part does not belong to purchase-order shop';
  end if;
  if not exists (
    select 1
    from public.stock_locations location
    where location.id = p_location_id
      and location.shop_id = v_shop_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Location does not belong to purchase-order shop';
  end if;

  v_operation_key := v_shop_id::text || ':po-receive:' || p_operation_id::text;
  select move.*
    into v_move
  from public.stock_moves move
  where move.shop_id = v_shop_id
    and move.idempotency_key = v_operation_key
  for update;
  if found then
    if v_move.part_id is distinct from p_part_id
       or v_move.location_id is distinct from p_location_id
       or v_move.qty_change is distinct from p_qty
       or v_move.reference_kind is distinct from 'purchase_order'
       or v_move.reference_id is distinct from p_po_id then
      raise exception using
        errcode = '22023',
        message = 'PO_RECEIVE_IDEMPOTENCY_CONFLICT';
    end if;
    return coalesce(v_move.metadata -> 'receipt_result', '{}'::jsonb)
      || jsonb_build_object('ok', true, 'replayed', true, 'move_id', v_move.id);
  end if;

  v_field_restricted := not public.profixiq_current_actor_has_shop_product_access(
    v_shop_id
  );
  if v_field_restricted and (
    not exists (
      select 1
      from public.purchase_order_lines line
      where line.po_id = p_po_id
    )
    or exists (
      select 1
      from public.purchase_order_lines line
      left join public.part_request_items item
        on item.id = line.part_request_item_id
       and item.shop_id = v_shop_id
      where line.po_id = p_po_id
        and (
          line.part_request_item_id is null
          or item.id is null
          or item.work_order_id is null
          or not private.profixiq_current_actor_can_mutate_work_order_product(
            v_shop_id,
            item.work_order_id
          )
        )
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Purchase order product access is required.';
  end if;

  perform 1
  from public.purchase_order_lines line
  where line.po_id = p_po_id
    and line.part_id = p_part_id
  order by line.created_at, line.id
  for update;
  select coalesce(
      sum(greatest(coalesce(line.qty, 0) - coalesce(line.received_qty, 0), 0)),
      0
    )
    into v_po_remaining
  from public.purchase_order_lines line
  where line.po_id = p_po_id
    and line.part_id = p_part_id;
  if v_po_remaining <= 0 then
    raise exception using errcode = '22023', message = 'PO_PART_FULLY_RECEIVED';
  end if;
  if p_qty > v_po_remaining then
    raise exception using
      errcode = '22023',
      message = format(
        'PO_RECEIVE_QUANTITY_EXCEEDS_REMAINING requested=%s remaining=%s',
        p_qty,
        v_po_remaining
      );
  end if;

  insert into public.stock_moves (
    shop_id, part_id, location_id, qty_change, reason, reference_kind,
    reference_id, created_by, idempotency_key, metadata, lifecycle_quantity
  ) values (
    v_shop_id,
    p_part_id,
    p_location_id,
    p_qty,
    'receive',
    'purchase_order',
    p_po_id,
    v_uid,
    v_operation_key,
    jsonb_build_object(
      'operation', 'purchase_order_receipt',
      'operation_id', p_operation_id,
      'po_id', p_po_id
    ),
    p_qty
  ) returning * into v_move;

  v_remaining := p_qty;
  for v_item in
    select line.id, line.qty, line.received_qty
    from public.purchase_order_lines line
    where line.po_id = p_po_id
      and line.part_id = p_part_id
    order by line.created_at, line.id
    for update
  loop
    exit when v_remaining <= 0;
    v_need := greatest(
      coalesce(v_item.qty, 0) - coalesce(v_item.received_qty, 0),
      0
    );
    v_take := least(v_remaining, v_need);
    if v_take > 0 then
      update public.purchase_order_lines
      set received_qty = coalesce(received_qty, 0) + v_take
      where id = v_item.id;
      v_remaining := v_remaining - v_take;
    end if;
  end loop;
  if v_remaining <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PO_RECEIVE_LINE_RECONCILIATION_FAILED';
  end if;

  if exists (
    select 1
    from public.purchase_order_lines line
    where line.po_id = p_po_id
      and coalesce(line.received_qty, 0) < coalesce(line.qty, 0)
  ) then
    v_po_closed := false;
  else
    update public.purchase_orders
    set status = 'received'
    where id = p_po_id;
    v_po_closed := true;
  end if;
  select purchase_order.status::text
    into v_po_status
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id;

  v_remaining := p_qty;
  for v_item in
    select
      item.id,
      item.qty,
      item.qty_requested,
      item.qty_approved,
      item.qty_received
    from public.part_request_items item
    where item.shop_id = v_shop_id
      and item.part_id = p_part_id
      and item.status in (
        'approved', 'reserved', 'ordered', 'picking', 'picked',
        'partially_received'
      )
      and greatest(
        coalesce(item.qty_approved, 0),
        coalesce(item.qty_requested, 0),
        coalesce(item.qty, 0),
        0
      ) > greatest(coalesce(item.qty_received, 0), 0)
      and (
        not v_field_restricted
        or exists (
          select 1
          from public.purchase_order_lines source_line
          where source_line.po_id = p_po_id
            and source_line.part_request_item_id = item.id
        )
      )
    order by item.created_at, item.id
    for update
  loop
    exit when v_remaining <= 0;
    v_target := greatest(
      coalesce(v_item.qty_approved, 0),
      coalesce(v_item.qty_requested, 0),
      coalesce(v_item.qty, 0),
      0
    );
    v_received := greatest(coalesce(v_item.qty_received, 0), 0);
    v_need := greatest(v_target - v_received, 0);
    v_take := least(v_remaining, v_need);
    if v_take > 0 then
      update public.part_request_items
      set qty_received = v_received + v_take,
          status = case
            when v_received + v_take >= v_target
              then 'received'::public.part_request_item_status
            else 'partially_received'::public.part_request_item_status
          end
      where id = v_item.id;
      v_alloc := v_alloc || jsonb_build_object(
        'request_item_id', v_item.id,
        'qty_allocated', v_take
      );
      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'move_id', v_move.id,
    'po_id', p_po_id,
    'po_closed', v_po_closed,
    'po_status', v_po_status,
    'part_id', p_part_id,
    'qty_received_total', p_qty,
    'allocations', v_alloc,
    'unallocated_qty', greatest(v_remaining, 0)
  );
  update public.stock_moves
  set metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('receipt_result', v_result)
  where id = v_move.id;
  return v_result;
end;
$function$;

revoke all on function public.receive_po_part_and_allocate(
  uuid, uuid, uuid, numeric, uuid
) from public, anon;
grant execute on function public.receive_po_part_and_allocate(
  uuid, uuid, uuid, numeric, uuid
) to authenticated, service_role;

-- Quote decisions and line voids are public PostgREST entry points whose
-- mature cores run as SECURITY DEFINER. Preserve committed, actor-bound
-- receipts before applying current product authority, then keep the cores
-- unreachable so RLS cannot be bypassed by calling them directly.
alter function public.apply_shop_quote_decision_atomic(
  uuid, uuid, uuid[], text, uuid, text, text, text, timestamptz
) rename to apply_shop_quote_decision_product_core;
alter function public.apply_shop_quote_decision_product_core(
  uuid, uuid, uuid[], text, uuid, text, text, text, timestamptz
) set schema private;
revoke all on function private.apply_shop_quote_decision_product_core(
  uuid, uuid, uuid[], text, uuid, text, text, text, timestamptz
) from public, anon, authenticated, service_role;

create function public.apply_shop_quote_decision_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[],
  p_decision text,
  p_actor_user_id uuid,
  p_contact_method text,
  p_note text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing jsonb;
  v_existing_actor uuid;
  v_existing_work_order uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_actor_user_id then
    raise exception using
      errcode = '42501',
      message = 'Shop quote decision actor mismatch.';
  end if;

  select operation.result, operation.actor_user_id, operation.work_order_id
    into v_existing, v_existing_actor, v_existing_work_order
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'shop_quote_decision'
    and operation.operation_key = p_operation_key;
  if found then
    if v_existing_actor is distinct from p_actor_user_id
       or v_existing_work_order is distinct from p_work_order_id then
      raise exception using
        errcode = '23505',
        message = 'SHOP_QUOTE_DECISION_OPERATION_CONFLICT';
    end if;
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not private.profixiq_current_actor_can_mutate_work_order_product(
       p_shop_id,
       p_work_order_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Work Order product access is required.';
  end if;

  return private.apply_shop_quote_decision_product_core(
    p_shop_id,
    p_work_order_id,
    p_quote_line_ids,
    p_decision,
    p_actor_user_id,
    p_contact_method,
    p_note,
    p_operation_key,
    p_at
  );
end;
$function$;

revoke all on function public.apply_shop_quote_decision_atomic(
  uuid, uuid, uuid[], text, uuid, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.apply_shop_quote_decision_atomic(
  uuid, uuid, uuid[], text, uuid, text, text, text, timestamptz
) to authenticated, service_role;

alter function public.parts_void_work_order_line_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) rename to parts_void_work_order_line_product_core;
alter function public.parts_void_work_order_line_product_core(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) set schema private;
revoke all on function private.parts_void_work_order_line_product_core(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated, service_role;

create function public.parts_void_work_order_line_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_mode text,
  p_reserved_disposition text,
  p_ordered_disposition text,
  p_received_disposition text,
  p_consumed_disposition text,
  p_reason text,
  p_note text,
  p_operation_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_work_order_id uuid;
  v_existing public.parts_operation_keys%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = p_shop_id
         and (profile.id = auth.uid() or profile.user_id = auth.uid())
         and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
         and public.canonical_shop_membership_role(profile.role::text) in (
           'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Line void actor mismatch.';
  end if;

  select operation.*
    into v_existing
  from public.parts_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_key = p_operation_key;
  if found and v_existing.completed_at is not null then
    if v_existing.operation_type <> 'void_work_order_line'
       or v_existing.aggregate_type <> 'work_order_line'
       or v_existing.aggregate_id <> p_work_order_line_id
       or v_existing.created_by is distinct from p_actor_user_id then
      raise exception using
        errcode = '23505',
        message = 'PARTS_VOID_OPERATION_CONFLICT';
    end if;
    return coalesce(v_existing.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  select line.work_order_id
    into v_work_order_id
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = p_shop_id;
  if v_work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Work-order line not found for shop.';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not private.profixiq_current_actor_can_mutate_work_order_product(
       p_shop_id,
       v_work_order_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Work Order product access is required.';
  end if;

  return private.parts_void_work_order_line_product_core(
    p_shop_id,
    p_work_order_line_id,
    p_mode,
    p_reserved_disposition,
    p_ordered_disposition,
    p_received_disposition,
    p_consumed_disposition,
    p_reason,
    p_note,
    p_operation_key,
    p_actor_user_id
  );
end;
$function$;

revoke all on function public.parts_void_work_order_line_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.parts_void_work_order_line_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) to authenticated, service_role;

-- These mature mutation functions predate the product-package boundary and
-- run as SECURITY DEFINER. Keep their public signatures and existing business
-- logic intact, but place the implementations in the private schema so every
-- authenticated call must first prove Shop or linked Field mutation authority.
alter function public.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text, text,
  text, boolean, boolean, text, text, text, jsonb
) rename to apply_job_punch_transition_product_core;
alter function public.apply_job_punch_transition_product_core(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text, text,
  text, boolean, boolean, text, text, text, jsonb
) set schema private;
revoke all on function private.apply_job_punch_transition_product_core(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text, text,
  text, boolean, boolean, text, text, text, jsonb
) from public, anon, authenticated, service_role;

create function public.apply_job_punch_transition_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_action text,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_allow_concurrent boolean default false,
  p_at timestamptz default now(),
  p_start_source text default null,
  p_hold_reason text default null,
  p_notes text default null,
  p_preserve_line_status boolean default false,
  p_release_to_awaiting boolean default false,
  p_cause text default null,
  p_correction text default null,
  p_event text default null,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_work_order_id uuid;
begin
  if coalesce(auth.role(), '') = 'service_role'
     or public.profixiq_current_actor_has_shop_product_access(p_shop_id) then
    return private.apply_job_punch_transition_product_core(
      p_shop_id, p_work_order_line_id, p_action, p_technician_id,
      p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
      p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
      p_release_to_awaiting, p_cause, p_correction, p_event, p_details
    );
  end if;

  -- A committed actor/line/action-bound receipt remains replayable after a
  -- Field visit is reassigned. The private core repeats its canonical actor
  -- validation and returns the durable result before touching live line state.
  if auth.uid() is not null
     and exists (
       select 1
       from public.workforce_operation_keys operation
       where operation.shop_id = p_shop_id
         and operation.operation_name =
           'job_punch:' || lower(trim(coalesce(p_action, '')))
         and operation.operation_key = p_operation_key
         and operation.actor_user_id = auth.uid()
         and operation.work_order_line_id = p_work_order_line_id
     ) then
    return private.apply_job_punch_transition_product_core(
      p_shop_id, p_work_order_line_id, p_action, p_technician_id,
      p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
      p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
      p_release_to_awaiting, p_cause, p_correction, p_event, p_details
    );
  end if;

  select line.work_order_id
    into v_work_order_id
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = p_shop_id;

  if v_work_order_id is null
     or not private.profixiq_current_actor_can_mutate_work_order_product(
       p_shop_id,
       v_work_order_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Work Order product access is required.';
  end if;

  return private.apply_job_punch_transition_product_core(
    p_shop_id, p_work_order_line_id, p_action, p_technician_id,
    p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
    p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
    p_release_to_awaiting, p_cause, p_correction, p_event, p_details
  );
end;
$function$;

revoke all on function public.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text, text,
  text, boolean, boolean, text, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text, text,
  text, boolean, boolean, text, text, text, jsonb
) to authenticated, service_role;

alter function public.apply_offline_line_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) rename to apply_offline_line_mutation_product_core;
alter function public.apply_offline_line_mutation_product_core(
  uuid, uuid, text, text, uuid, jsonb
) set schema private;
revoke all on function private.apply_offline_line_mutation_product_core(
  uuid, uuid, text, text, uuid, jsonb
) from public, anon, authenticated, service_role;

create function public.apply_offline_line_mutation_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_action_type text,
  p_work_order_line_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_work_order_id uuid;
begin
  if coalesce(auth.role(), '') = 'service_role'
     or public.profixiq_current_actor_has_shop_product_access(p_shop_id) then
    return private.apply_offline_line_mutation_product_core(
      p_shop_id, p_actor_user_id, p_operation_key, p_action_type,
      p_work_order_line_id, p_payload
    );
  end if;

  -- Preserve idempotent retries after a Field visit is reassigned. The receipt
  -- must match the authenticated actor, operation, action, entity, and line;
  -- the private core additionally validates the canonical payload hash.
  if auth.uid() is not null
     and exists (
       select 1
       from public.offline_mutation_receipts receipt
       where receipt.shop_id = p_shop_id
         and receipt.operation_key = p_operation_key
         and receipt.actor_user_id = auth.uid()
         and receipt.action_type = p_action_type
         and receipt.entity_type = 'work_order_line'
         and receipt.entity_id = p_work_order_line_id
     ) then
    return private.apply_offline_line_mutation_product_core(
      p_shop_id, p_actor_user_id, p_operation_key, p_action_type,
      p_work_order_line_id, p_payload
    );
  end if;

  select line.work_order_id
    into v_work_order_id
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = p_shop_id;

  if v_work_order_id is null
     or not private.profixiq_current_actor_can_mutate_work_order_product(
       p_shop_id,
       v_work_order_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Work Order product access is required.';
  end if;

  return private.apply_offline_line_mutation_product_core(
    p_shop_id, p_actor_user_id, p_operation_key, p_action_type,
    p_work_order_line_id, p_payload
  );
end;
$function$;

revoke all on function public.apply_offline_line_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_offline_line_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) to authenticated, service_role;

alter function public.parts_attach_inventory_to_request_item_atomic(uuid, uuid)
  rename to parts_attach_inventory_to_request_item_product_core;
alter function public.parts_attach_inventory_to_request_item_product_core(uuid, uuid)
  set schema private;
revoke all on function private.parts_attach_inventory_to_request_item_product_core(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.parts_attach_inventory_to_request_item_atomic(
  p_item_id uuid,
  p_part_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id uuid;
  v_work_order_id uuid;
begin
  select item.shop_id, item.work_order_id
    into v_shop_id, v_work_order_id
  from public.part_request_items item
  where item.id = p_item_id;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_has_shop_product_access(v_shop_id)
     and (
       v_shop_id is null
       or v_work_order_id is null
       or not private.profixiq_current_actor_can_mutate_work_order_product(
         v_shop_id,
         v_work_order_id
       )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Parts request item product access is required.';
  end if;

  return private.parts_attach_inventory_to_request_item_product_core(
    p_item_id,
    p_part_id
  );
end;
$function$;

revoke all on function public.parts_attach_inventory_to_request_item_atomic(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.parts_attach_inventory_to_request_item_atomic(uuid, uuid)
  to authenticated, service_role;

alter function public.parts_create_and_attach_inventory_atomic(
  uuid, text, text, text, text, text, text, numeric, numeric, numeric, uuid, text
) rename to parts_create_and_attach_inventory_product_core;
alter function public.parts_create_and_attach_inventory_product_core(
  uuid, text, text, text, text, text, text, numeric, numeric, numeric, uuid, text
) set schema private;
revoke all on function private.parts_create_and_attach_inventory_product_core(
  uuid, text, text, text, text, text, text, numeric, numeric, numeric, uuid, text
) from public, anon, authenticated, service_role;

create function public.parts_create_and_attach_inventory_atomic(
  p_item_id uuid,
  p_name text,
  p_part_number text,
  p_manufacturer text,
  p_supplier text,
  p_sku text,
  p_category text,
  p_cost numeric,
  p_sell_price numeric,
  p_initial_qty numeric,
  p_location_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id uuid;
  v_work_order_id uuid;
begin
  select item.shop_id, item.work_order_id
    into v_shop_id, v_work_order_id
  from public.part_request_items item
  where item.id = p_item_id;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.profixiq_current_actor_has_shop_product_access(v_shop_id)
     and (
       v_shop_id is null
       or v_work_order_id is null
       or not private.profixiq_current_actor_can_mutate_work_order_product(
         v_shop_id,
         v_work_order_id
       )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Parts request item product access is required.';
  end if;

  return private.parts_create_and_attach_inventory_product_core(
    p_item_id, p_name, p_part_number, p_manufacturer, p_supplier, p_sku,
    p_category, p_cost, p_sell_price, p_initial_qty, p_location_id,
    p_operation_key
  );
end;
$function$;

revoke all on function public.parts_create_and_attach_inventory_atomic(
  uuid, text, text, text, text, text, text, numeric, numeric, numeric, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.parts_create_and_attach_inventory_atomic(
  uuid, text, text, text, text, text, text, numeric, numeric, numeric, uuid, text
) to authenticated, service_role;

do $product_boundary_acl_postcheck$
declare
  v_signature regprocedure;
  v_role name;
  v_delete_core_definition text;
begin
  foreach v_signature in array array[
    'private.save_work_order_media_annotation_product_core(uuid,jsonb,text,text)'::regprocedure,
    'private.create_work_order_with_custom_id_product_core(uuid,uuid,uuid,text,integer,boolean,uuid)'::regprocedure,
    'private.work_order_has_supplier_history(uuid,uuid)'::regprocedure,
    'private.work_order_delete_draft_product_core(uuid,uuid,text,uuid)'::regprocedure,
    'private.mark_work_order_ready_product_core(uuid,uuid,uuid,text,timestamptz)'::regprocedure,
    'private.materialize_offline_work_order_draft_product_core(uuid,uuid,text,uuid,uuid,jsonb)'::regprocedure,
    'private.assign_work_order_line_technician_product_core(uuid,uuid,uuid,uuid,text)'::regprocedure,
    'private.get_work_order_assignments_product_core(uuid)'::regprocedure,
    'private.convert_owned_fleet_request_work_order_product_core(uuid)'::regprocedure,
    'private.convert_fleet_request_work_order_product_core(uuid)'::regprocedure,
    'private.mobile_create_service_call_field_service_core(uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,timestamptz,integer,numeric,text,text,uuid,text)'::regprocedure,
    'private.mobile_materialize_visit_wo_v1_core(uuid,uuid,uuid,text)'::regprocedure,
    'private.mobile_materialize_visit_work_order_mode_core(uuid,uuid,uuid,text)'::regprocedure,
    'private.apply_shop_quote_decision_product_core(uuid,uuid,uuid[],text,uuid,text,text,text,timestamptz)'::regprocedure,
    'private.parts_void_work_order_line_product_core(uuid,uuid,text,text,text,text,text,text,text,text,uuid)'::regprocedure,
    'private.profixiq_current_actor_can_mutate_work_order_product(uuid,uuid)'::regprocedure,
    'private.apply_job_punch_transition_product_core(uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,boolean,boolean,text,text,text,jsonb)'::regprocedure,
    'private.apply_offline_line_mutation_product_core(uuid,uuid,text,text,uuid,jsonb)'::regprocedure,
    'private.parts_attach_inventory_to_request_item_product_core(uuid,uuid)'::regprocedure,
    'private.parts_create_and_attach_inventory_product_core(uuid,text,text,text,text,text,text,numeric,numeric,numeric,uuid,text)'::regprocedure
  ]
  loop
    foreach v_role in array array['anon', 'authenticated', 'service_role']::name[]
    loop
      if has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception 'Private Work Order core % is executable by %',
          v_signature,
          v_role;
      end if;
    end loop;
  end loop;

  foreach v_signature in array array[
    'public.apply_job_punch_transition_atomic(uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,boolean,boolean,text,text,text,jsonb)'::regprocedure,
    'public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb)'::regprocedure,
    'public.parts_attach_inventory_to_request_item_atomic(uuid,uuid)'::regprocedure,
    'public.parts_create_and_attach_inventory_atomic(uuid,text,text,text,text,text,text,numeric,numeric,numeric,uuid,text)'::regprocedure
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or not has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'Public Work Order mutation wrapper ACL drifted for %',
        v_signature;
    end if;
  end loop;

  v_delete_core_definition := pg_catalog.pg_get_functiondef(
    'private.work_order_delete_draft_product_core(uuid,uuid,text,uuid)'::regprocedure
  );
  if pg_catalog.strpos(
       v_delete_core_definition,
       'private.work_order_has_supplier_history'
     ) = 0
     or pg_catalog.strpos(
       v_delete_core_definition,
       'public.supplier_orders'
     ) > 0 then
    raise exception 'Draft-delete supplier-history compatibility guard drifted.';
  end if;

  if has_function_privilege(
       'anon',
       'public.create_work_order_with_custom_id(uuid,uuid,uuid,text,integer,boolean,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.create_work_order_with_custom_id(uuid,uuid,uuid,text,integer,boolean,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.assign_work_order_line_technician_atomic(uuid,uuid,uuid,uuid,text,text,timestamptz)',
       'EXECUTE'
     ) then
    raise exception 'Public Work Order wrapper/core ACL composition is unsafe';
  end if;
end;
$product_boundary_acl_postcheck$;

comment on function public.profixiq_current_actor_has_shop_product_access(uuid) is
  'Actor-bound Shop product entitlement used by restrictive operational RLS policies.';
comment on function public.profixiq_current_actor_can_read_work_order_product(uuid, uuid) is
  'Allows Shop staff, assigned/manager Field actors, linked Fleet members, or the owning Portal customer to read one Work Order.';

notify pgrst, 'reload schema';

commit;
