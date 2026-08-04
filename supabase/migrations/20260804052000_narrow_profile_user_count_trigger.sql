begin;

-- Profile self-service updates (including clearing must_change_password after a
-- successful first-login password change) do not affect shop seat counts. The
-- legacy trigger fired for every profile update and attempted to rewrite the
-- server-managed shops.active_user_count column as the authenticated user,
-- causing the billing-identity guard to reject the entire profile update.
-- Recalculate only when shop membership can actually change the count.
--
-- The legacy trigger/function currently exist only in production drift. Keep a
-- clean replay unchanged until that contract is promoted into the baseline.
do $migration$
begin
  if to_regclass('public.profiles') is null
     or to_regprocedure('public.tg_profiles_recalc_shop_user_count()') is null then
    return;
  end if;

  execute 'drop trigger if exists profiles_recalc_shop_user_count on public.profiles';
  execute $ddl$
create trigger profiles_recalc_shop_user_count
after insert or delete or update of shop_id on public.profiles
for each row
execute function public.tg_profiles_recalc_shop_user_count()
$ddl$;
end
$migration$;

commit;
