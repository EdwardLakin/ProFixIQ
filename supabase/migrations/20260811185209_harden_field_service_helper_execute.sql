-- Keep Field Service authorization helpers internal to SECURITY DEFINER callers.
-- The public RPC wrapper performs the caller check and invokes these as owner.

revoke all on function public.mobile_profile_has_field_service_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mobile_actor_has_field_service_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mobile_profile_has_field_service_access(uuid, uuid) to service_role;
grant execute on function public.mobile_actor_has_field_service_access(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
