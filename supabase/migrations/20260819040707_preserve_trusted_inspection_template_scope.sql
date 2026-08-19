begin;

-- Direct authenticated inserts are still constrained by inspection_templates
-- RLS. Preserve explicit values so trusted SECURITY DEFINER publishers (for
-- example Fleet pre-trip template publication) keep their already-authorized
-- fleet shop, and only fill boundaries a browser insert omitted.
create or replace function public.set_inspection_template_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_actor_shop_id uuid;
begin
  if v_actor_user_id is null then
    return new;
  end if;

  if new.user_id is null then
    new.user_id := v_actor_user_id;
  end if;

  if new.shop_id is null then
    select p.shop_id
      into v_actor_shop_id
    from public.profiles p
    where (p.id = v_actor_user_id or p.user_id = v_actor_user_id)
      and p.shop_id is not null
    order by (p.id = v_actor_user_id) desc, p.id
    limit 1;

    new.shop_id := v_actor_shop_id;
  end if;

  return new;
end;
$$;

revoke all on function public.set_inspection_template_owner()
  from public, anon, authenticated;
grant execute on function public.set_inspection_template_owner()
  to service_role;

commit;
