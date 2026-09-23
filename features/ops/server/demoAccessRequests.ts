import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { createDemoProspect } from "@/features/ops/server/demoAccess";

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

export type DemoAccessRequestStatus = "pending" | "approved" | "dismissed";

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
    throw new Error(`Failed to submit demo access request: ${error.message}`);
  }
}

/**
 * Ops-only. Access is the caller's responsibility -- called from API route
 * handlers and the page that have already checked
 * requireOpsOperatorApiAccess()/requireOpsOperatorPageAccess(), matching
 * every other function in features/ops/server/demoAccess.ts.
 */
export async function listDemoAccessRequests(): Promise<DemoAccessRequest[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("demo_access_requests")
    .select("id, full_name, email, company_name, message, status, created_at, reviewed_at")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<
      {
        id: string;
        full_name: string;
        email: string;
        company_name: string | null;
        message: string | null;
        status: DemoAccessRequestStatus;
        created_at: string;
        reviewed_at: string | null;
      }[]
    >();

  if (error) {
    throw new Error(`Failed to list demo access requests: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    companyName: row.company_name,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }));
}

async function loadPendingRequest(admin: AdminSupabase, requestId: string) {
  const { data, error } = await admin
    .from("demo_access_requests")
    .select("id, full_name, email, status")
    .eq("id", requestId)
    .maybeSingle<{ id: string; full_name: string; email: string; status: DemoAccessRequestStatus }>();
  if (error) {
    throw new Error(`Failed to load demo access request: ${error.message}`);
  }
  if (!data) {
    throw new Error("Demo access request not found.");
  }
  if (data.status !== "pending") {
    throw new Error(`This request is already ${data.status}.`);
  }
  return data;
}

export async function approveDemoAccessRequest(
  input: { requestId: string; expiresAt?: string },
  actorProfileId: string | null,
): Promise<{ profileId: string; username: string; expiresAt: string }> {
  const admin = createAdminSupabase();
  const request = await loadPendingRequest(admin, input.requestId);

  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + DEFAULT_APPROVAL_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  // Reuses the existing, already-reviewed prospect-provisioning path
  // end-to-end (shop resolution, internal_demo check, auth user + profile
  // creation, invite email) -- this function only adds the request-queue
  // bookkeeping around it.
  const result = await createDemoProspect(
    { fullName: request.full_name, email: request.email, expiresAt },
    actorProfileId,
  );

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
  await loadPendingRequest(admin, input.requestId);

  const { error } = await admin
    .from("demo_access_requests")
    .update({ status: "dismissed", reviewed_at: new Date().toISOString(), reviewed_by: actorProfileId })
    .eq("id", input.requestId);
  if (error) {
    throw new Error(`Failed to dismiss demo access request: ${error.message}`);
  }
}
