# Cross-host session handoff

Auth cookies stay **host-only**. Moving from the Fleet host to the primary site
(Shop / Field / Equipment) carries the session with a single-use handoff
instead of a shared parent-domain cookie, so sibling subdomains (e.g. the
separately-run `shopreel.profixiq.com`) never see a session token.

## Flow (three hops, all top-level navigations)
1. **begin** (target host): the Fleet switcher links to
   `<target>/api/auth/handoff/begin?source=<fleet>&next=<path>`. The request must
   come from a page on exactly the `source` origin (see Guards). The target sets
   a host-only `__Host-profixiq-handoff-<bind prefix>` nonce cookie (httpOnly, Secure, 5 min, one per handoff)
   and redirects to the source with `bind = sha256(nonce)` plus an expiry and an
   HMAC signature over `(target, next, bind, exp)`.
2. **start** (source host): verifies the signature, then for the signed-in user mints a Supabase `magiclink`
   OTP via the admin API (no email is sent) and redirects to
   `<target>/api/auth/handoff/redeem?token_hash=…&next=<path>&bind=<hash>`.
3. **redeem** (target host): only if the nonce cookie hashes to `bind`, verifies
   the OTP, which creates a fresh host-only session, then redirects to `next`.
   Only that handoff's nonce is cleared, so concurrent handoffs in other tabs are unaffected.

## Guards
- `target`/`source` must exactly match the primary site or Fleet origin; `next`
  must be a same-origin path and can never point back into the handoff routes.
- **Login CSRF:** the OTP only redeems in the browser that began the handoff. An
  attacker who mints their own OTP and plants the link (even on a same-site
  sibling like shopreel) cannot make a victim's browser redeem it, because the
  victim's nonce cookie will not hash to the attacker's `bind`. The `__Host-`
  prefix stops sibling subdomains from setting or shadowing the cookie.
  `Sec-Fetch-Site: same-origin|same-site` is also required (fails closed).
- **Hostile sibling initiating a handoff:** `begin` requires the `Referer` origin
  to equal the named `source` origin (fails closed if absent). The browser sets
  Referer and a page cannot forge another origin's, so a same-site sibling such
  as shopreel that top-level navigates the user to `begin` is refused, even
  though Fetch Metadata calls it "same-site". The handoff anchor sets
  `referrerPolicy="origin"` so the origin is always sent. Residual: this trusts
  every page on the source origin, so an XSS or open redirect on Fleet itself is
  out of scope.
- **Forced minting:** `start` only acts on state signed by `begin` (key derived
  from the service-role key, 5 min expiry) and only for a top-level navigation
  (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`). A page, including a
  same-site sibling, cannot trigger minting with an embedded image, iframe or
  fetch, or by forging parameters.
- The OTP is single-use and short-lived. Responses are `no-store` with
  `Referrer-Policy: no-referrer`; the token is never echoed.
- Handoff links are rendered as plain `<a>` elements (never a prefetched router
  `<Link>`), because visiting `start` mints a token.
- **Failures never open the workspace or resume a session.** Signed out, no
  email, mint/verify error, nonce mismatch, untrusted navigation or untrusted
  initiator all redirect to the neutral `<target>/api/auth/handoff/failed` page,
  which needs an explicit click. Not `next` (the target host may already hold a
  different account's session) and not `/sign-in` (which silently resumes
  whatever session the host already holds). Browsers without fetch metadata
  (Safari < 16.4) therefore land on sign-in instead of the handoff.

## Notes
- Minting a magiclink replaces any pending password-recovery token for that user.
- Sign-out stays per host; a tab already open on the other host keeps its
  in-memory access token until it expires.
- Links from the primary site back to Fleet still use the existing host mapping.
  The same routes support it (Fleet origin is allowlisted).
