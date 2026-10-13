# Shared auth cookie domain (cross-host session)

Fleet (`fleet.profixiq.com`) and the primary site (`profixiq.com`) are separate
hosts. By default Supabase auth cookies are host-only, so switching products
across hosts lands on sign-in.

Set `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.profixiq.com` (production only) to share
one session across all `*.profixiq.com` hosts, **including `ops.`**. Leave it
unset on localhost and preview deployments; cookies stay host-only there.

- Applied in the browser client, server client, Pages-API client and middleware.
- On load, the browser client copies existing host-only `sb-*-auth-token`
  cookies to the shared domain and expires the host-only copy, so existing
  sessions are not signed out and are not shadowed.
- Rollout: deploy with the variable set, verify sign-in on both hosts, then
  verify sign-out on one host clears the other.
- Rollback: unset the variable. Users may need to sign in once per host.
