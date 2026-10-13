# Cross-host session handoff

Auth cookies stay **host-only**. Moving from the Fleet host to the primary site
(Shop / Field / Equipment) carries the session with a single-use handoff
instead of a shared parent-domain cookie, so sibling subdomains (e.g. the
separately-run `shopreel.profixiq.com`) never see a session token.

Flow:
1. The Fleet-host switcher links to `/api/auth/handoff/start?target=<origin>&next=<path>`.
2. `start` (signed-in user) mints a Supabase `magiclink` OTP via the admin API
   (no email is sent) and 303-redirects to `<target>/api/auth/handoff/redeem?token_hash=…&next=<path>`.
3. `redeem` verifies the OTP, which creates a fresh host-only session on the
   target, then redirects to `next`.

Guards:
- `target` must exactly match the primary site or Fleet origin; `next` must be a
  same-origin path and can never point back into the handoff routes.
- `redeem` only logs in when `Sec-Fetch-Site` is `same-origin`/`same-site`
  (fails closed if absent), which blocks attacker-supplied links (login CSRF).
- The OTP is single-use and short-lived (Supabase OTP expiry). Responses are
  `no-store` with `Referrer-Policy: no-referrer`; the token is never echoed.
- Any failure (signed out, no email, mint/verify error) falls through to a plain
  navigation, so the target's normal sign-in applies.

Side effects: minting a magiclink replaces any pending password-recovery token
for that user. Sign-out stays per host; the other host's session expires
normally.

Not covered: links from the primary site back to Fleet still use the existing
host mapping. The same routes support it (Fleet origin is allowlisted).
