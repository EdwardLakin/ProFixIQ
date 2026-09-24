import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { createDemoProspect } from "@/features/ops/server/demoAccess";

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

export type DemoAccessRequestStatus = "pending" | "provisioning" | "approved" | "dismissed";

export type DemoAccessRequest = {
  id: string;
  fullName: string;
  email: string;
  companyName: string | null;
  message: string | null;
  status: DemoAccessRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESUBMIT_COOLDOWN_MINUTES = 10;
const DEFAULT_APPROVAL_EXPIRY_HOURS = 24 * 7;

export type SubmitDemoAccessRequestInput = {
  fullName: string;
  email: string;
  companyName?: string;
  message?: string;
  // Honeypot: real visitors never see or fill this field (kept off-screen
  // in the form). A bot that fills it gets a normal-looking success
  // response, but nothing is written -- this doesn't tip the bot off that
  // it was caught.
  website?: string;
};

/**
 * Public entry point -- called from the unauthenticated landing-page form
 * via app/api/public/demo-request. Never touches profiles, shop_members,
 * or any provisioning path; it only ever inserts into
 * demo_access_requests. An ops operator reviews and approves/dismisses
 * each request from /ops/demo-access (approveDemoAccessRequest /
 * dismissDemoAccessRequest below), which is what actually provisions an
 * account, reusing the existing createDemoProspect() flow.
 */
export async function submitDemoAccessRequest(input: SubmitDemoAccessRequestInput): Promise<void> {
  if (input.website && input.website.trim() !== "") {
    return;
  }

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const companyName = input.companyName?.trim() || null;
  const message = input.message?.trim() || null;

  if (!fullName) throw new Error("Name is required.");
  if (!EMAIL_PATTERN.test(email)) throw new Error("Enter a valid email address.");
  if (fullName.length > 200) throw new Error("Name is too long.");
  if (companyName && companyName.length > 200) throw new Error("Company name is too long.");
  if (message && message.length > 2000) throw new Error("Message is too long.");

  const admin = createAdminSupabase();

  // Simple, DB-backed throttle: no per-request infra in this repo to reuse,
  // and the request queue is manually reviewed anyway, so this only needs
  // to stop accidental double-submits and naive repeat spam from one email,
  // not defend a public API against a determined attacker.
  const cooldownSince = new Date(Date.now() - RESUBMIT_COOLDOWN_MINUTES * 60 * 1000).toISOString();
  const { data: recent, error: recentErr } = await admin
    .from("demo_access_requests")
    .select("id")
    .eq("email", email)
    .gte("created_at", cooldownSince)
    .limit(1);
  if (recentErr) {
    throw new Error(`Failed to check recent requests: ${recentErr.message}`);
  }
  if (recent && recent.length > 0) {
    return;
  }

  const { error } = await admin.from("demo_access_requests").insert({
    full_name: fullName,
    email,
    company_name: companyName,
    message,
  });
  if (error) {
    // The cooldown pre-check above isn't atomic with this insert, so two
    // concurrent submissions for the same email can both pass it. The
    // database's partial unique index on (email) where status='pending' is
    // the real guard; a violation here means a concurrent submit won, which
    // is the same outcome as the cooldown skip above.
    if (error.code === "23505") {
      return;
    }
    throw new Error(`Failed to submit demo access request: ${error.message}`);
  }
}

/**
 * Ops-only. Access is the caller's responsibility -- called from API route
 * handlers and the page that have already checked
 * requireOpsOperatorApiAccess()/requireOpsOperatorPageAccess(), matching
 * every other function in features/ops/server/demoAccess.ts.
 */
type DemoAccessRequestRow = {
  id: string;
  full_name: string;
  email: string;
  company_name: string | null;
  message: string | null;
  status: DemoAccessRequestStatus;
  created_at: string;
  reviewed_at: string | null;
};

function mapRequestRow(row: DemoAccessRequestRow): DemoAccessRequest {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    companyName: row.company_name,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

const REQUEST_ROW_COLUMNS = "id, full_name, email, company_name, message, status, created_at, reviewed_at";

export async function listDemoAccessRequests(): Promise<DemoAccessRequest[]> {
  const admin = createAdminSupabase();

  // Queried separately so a pending/provisioning request can never be
  // pushed out of view by a page of older reviewed history -- the two
  // groups compete for the same page under a single created_at-ordered
  // query once the table holds more rows than the limit.
  const [pendingResult, reviewedResult] = await Promise.all([
    admin
      .from("demo_access_requests")
      .select(REQUEST_ROW_COLUMNS)
      .in("status", ["pending", "provisioning"])
      .order("created_at", { ascending: false })
      .returns<DemoAccessRequestRow[]>(),
    admin
      .from("demo_access_requests")
      .select(REQUEST_ROW_COLUMNS)
      .in("status", ["approved", "dismissed"])
      .order("reviewed_at", { ascending: false })
      .limit(10)
      .returns<DemoAccessRequestRow[]>(),
  ]);

  if (pendingResult.error) {
    throw new Error(`Failed to list demo access requests: ${pendingResult.error.message}`);
  }
  if (reviewedResult.error) {
    throw new Error(`Failed to list demo access requests: ${reviewedResult.error.message}`);
  }

  return [...(pendingResult.data ?? []), ...(reviewedResult.data ?? [])].map(mapRequestRow);
}

async function describeUnclaimableRequest(admin: AdminSupabase, requestId: string): Promise<never> {
  const { data, error } = await admin
    .from("demo_access_requests")
    .select("status")
    .eq("id", requestId)
    .maybeSingle<{ status: DemoAccessRequestStatus }>();
  if (error) {
    throw new Error(`Failed to load demo access request: ${error.message}`);
  }
  if (!data) {
    throw new Error("Demo access request not found.");
  }
  if (data.status === "provisioning") {
    throw new Error("This request is already being processed.");
  }
  if (data.status === "pending") {
    // Lost a race to another claim between our attempt and this recheck.
    throw new Error("This request is already being processed.");
  }
  throw new Error(`This request is already ${data.status}.`);
}

/**
 * Atomically transitions a request from `pending` to `provisioning`,
 * returning the row only when this call won the transition. Two concurrent
 * approve calls on the same request can otherwise both pass a plain read
 * check before either writes, each independently provisioning a duplicate
 * account -- this conditional update (`eq("status", "pending")`) is the
 * guard, since only one concurrent UPDATE can match that predicate.
 */
async function claimPendingRequest(
  admin: AdminSupabase,
  requestId: string,
): Promise<{ id: string; full_name: string; email: string }> {
  const { data, error } = await admin
    .from("demo_access_requests")
    .update({ status: "provisioning" })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id, full_name, email")
    .maybeSingle<{ id: string; full_name: string; email: string }>();
  if (error) {
    throw new Error(`Failed to claim demo access request: ${error.message}`);
  }
  if (!data) {
    return describeUnclaimableRequest(admin, requestId);
  }
  return data;
}

export async function approveDemoAccessRequest(
  input: { requestId: string; expiresAt?: string },
  actorProfileId: string | null,
): Promise<{ profileId: string; username: string; expiresAt: string }> {
  const admin = createAdminSupabase();
  const request = await claimPendingRequest(admin, input.requestId);

  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + DEFAULT_APPROVAL_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  let result: { profileId: string; username: string; expiresAt: string };
  try {
    // Reuses the existing, already-reviewed prospect-provisioning path
    // end-to-end (shop resolution, internal_demo check, auth user + profile
    // creation, invite email) -- this function only adds the request-queue
    // bookkeeping around it.
    result = await createDemoProspect(
      { fullName: request.full_name, email: request.email, expiresAt },
      actorProfileId,
    );
  } catch (provisionError) {
    // Release the claim so the request goes back to pending and can be
    // retried, instead of being stuck at "provisioning" forever.
    await admin
      .from("demo_access_requests")
      .update({ status: "pending" })
      .eq("id", request.id)
      .eq("status", "provisioning");
    throw provisionError;
  }

  const { error } = await admin
    .from("demo_access_requests")
    .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: actorProfileId })
    .eq("id", request.id);
  if (error) {
    throw new Error(`Approved the prospect but failed to update the request record: ${error.message}`);
  }

  return result;
}

export async function dismissDemoAccessRequest(
  input: { requestId: string },
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();

  // Dismiss is a terminal transition with no async work in between, so a
  // single conditional update is enough to make it race-safe: only one
  // concurrent dismiss/approve can win the eq("status", ...) predicate.
  // Also allows clearing a request stuck in "provisioning" (e.g. a crash
  // between claim and outcome), since that's otherwise unrecoverable.
  const { data, error } = await admin
    .from("demo_access_requests")
    .update({ status: "dismissed", reviewed_at: new Date().toISOString(), reviewed_by: actorProfileId })
    .eq("id", input.requestId)
    .in("status", ["pending", "provisioning"])
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to dismiss demo access request: ${error.message}`);
  }
  if (!data) {
    await describeUnclaimableRequest(admin, input.requestId);
  }
}
