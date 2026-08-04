begin;

-- Profile self-service updates (including clearing must_change_password after a
-- successful first-login password change) do not affect shop seat counts. The
-- legacy trigger fired for every profile update and attempted to rewrite the
-- server-managed shops.active_user_count column as the authenticated user,
-- causing the billing-identity guard to reject the entire profile update.
-- Recalculate only when shop membership can actually change the count.
drop trigger if exists profiles_recalc_shop_user_count on public.profiles;

create trigger profiles_recalc_shop_user_count
after insert or delete or update of shop_id on public.profiles
for each row
execute function public.tg_profiles_recalc_shop_user_count();

commit;
