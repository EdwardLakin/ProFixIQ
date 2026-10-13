import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";


/**
 * `__Host-` makes the cookie host-only, Secure and Path=/, and stops sibling
 * subdomains from setting or shadowing it (no cookie tossing).
 */
export const HANDOFF_NONCE_COOKIE = "__Host-profixiq-handoff";
export const HANDOFF_NONCE_MAX_AGE_SECONDS = 300;

export const HANDOFF_NONCE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export function createHandoffNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function hashHandoffNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

/** Constant-time check that the browser's nonce cookie matches `bind`. */
export function handoffNonceMatches(
  nonce: string | undefined,
  bind: string,
): boolean {
  if (!nonce) return false;
  const a = Buffer.from(hashHandoffNonce(nonce), "hex");
  const b = Buffer.from(bind, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const HANDOFF_STATE_TTL_SECONDS = 300;

export type HandoffState = {
  target: string;
  next: string;
  bind: string;
  exp: number;
};

function stateSignature(state: HandoffState): string {
  // Read directly (not via readSupabaseServiceRoleKey) to avoid a log line on
  // every sign/verify. The key only seeds an HMAC and is never exposed.
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  const key = createHmac("sha256", secret)
    .update("profixiq/host-handoff/v1")
    .digest();
  return createHmac("sha256", key)
    .update(JSON.stringify([state.target, state.next, state.bind, state.exp]))
    .digest("hex");
}

/** `begin` signs the state it issues; `start` refuses anything it did not issue. */
export function createHandoffState(
  fields: Omit<HandoffState, "exp">,
  nowMs: number = Date.now(),
): HandoffState & { sig: string } {
  const state = {
    ...fields,
    exp: Math.floor(nowMs / 1000) + HANDOFF_STATE_TTL_SECONDS,
  };
  return { ...state, sig: stateSignature(state) };
}

export function verifyHandoffState(
  state: HandoffState,
  sig: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!sig || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isInteger(state.exp) || state.exp <= nowSeconds) return false;
  if (state.exp > nowSeconds + HANDOFF_STATE_TTL_SECONDS) return false;
  const expected = Buffer.from(stateSignature(state), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
