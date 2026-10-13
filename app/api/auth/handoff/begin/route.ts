export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import {
  handoffFailureUrl,
  HANDOFF_START_PATH,
  isTrustedHandoffNavigation,
  resolveHandoffTarget,
  safeHandoffPath,
} from "@/features/shared/lib/hostHandoff";
import {
  createHandoffNonce,
  createHandoffState,
  hashHandoffNonce,
  HANDOFF_NONCE_COOKIE,
  HANDOFF_NONCE_COOKIE_OPTIONS,
  HANDOFF_NONCE_MAX_AGE_SECONDS,
} from "@/features/shared/lib/server/hostHandoffBinding";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

/**
 * Target side, step 1. Runs on the host the user is entering: bind the handoff
 * to this browser with a host-only nonce cookie, then send the browser to the
 * source host, which mints the one-time token for the hash of that nonce. The
 * state handed to the source is signed so `start` only acts on what this
 * route issued.
 */
export async function GET(req: NextRequest) {
  const self = resolveHandoffTarget(req.nextUrl.origin);
  const source = resolveHandoffTarget(req.nextUrl.searchParams.get("source"));
  const next = safeHandoffPath(req.nextUrl.searchParams.get("next"));
  if (!self || !source || source === self || !next) {
    return NextResponse.json(
      { error: "Invalid handoff request." },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!isTrustedHandoffNavigation(req.headers)) {
    return NextResponse.redirect(handoffFailureUrl(self), {
      status: 303,
      headers: NO_STORE,
    });
  }

  const nonce = createHandoffNonce();
  const state = createHandoffState({
    target: self,
    next,
    bind: hashHandoffNonce(nonce),
  });
  const start = new URL(HANDOFF_START_PATH, source);
  start.searchParams.set("target", state.target);
  start.searchParams.set("next", state.next);
  start.searchParams.set("bind", state.bind);
  start.searchParams.set("exp", String(state.exp));
  start.searchParams.set("sig", state.sig);

  const res = NextResponse.redirect(start, { status: 303, headers: NO_STORE });
  res.cookies.set(HANDOFF_NONCE_COOKIE, nonce, {
    ...HANDOFF_NONCE_COOKIE_OPTIONS,
    maxAge: HANDOFF_NONCE_MAX_AGE_SECONDS,
  });
  return res;
}
