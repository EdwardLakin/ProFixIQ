import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const inviteSql = read(
  "supabase/migrations/20260715080000_phase7_atomic_portal_invite_acceptance.sql",
);
const bookingSql = read(
  "supabase/migrations/20260715080100_phase7_atomic_portal_booking_lifecycle.sql",
);
const confirmPage = read("app/portal/auth/confirm/page.tsx");
const activationRoute = read("app/portal/auth/activate/route.ts");
const inviteRoute = read("app/api/portal/invites/accept/route.ts");
const setupRoute = read("app/api/portal/qr/setup/route.ts");
const canonicalInviteService = read(
  "features/portal/server/customerPortalInvites.ts",
);
const staffBookingRoute = read("app/api/portal/bookings/[id]/route.ts");
const customerBookingRoute = read(
  "app/api/portal/customer-bookings/[id]/route.ts",
);

describe("Phase 7 portal identity and booking lifecycle", () => {
  it("accepts one exact invite in a server-owned transaction", () => {
    expect(inviteSql).toContain("accept_customer_portal_invite_atomic");
    expect(inviteSql).toContain("for update");
    expect(inviteSql).toContain("accepted_by_user_id");
    expect(inviteSql).toContain("portal_lifecycle_operation_keys");
    expect(inviteRoute).toContain(
      'rpc("accept_customer_portal_invite_atomic"',
    );
    expect(setupRoute).toContain("issueCustomerPortalInvite");
    expect(canonicalInviteService).toContain("new URLSearchParams({");
    expect(canonicalInviteService).toContain("invite: inviteId");
    expect(canonicalInviteService).toContain("properties?.hashed_token");
    expect(canonicalInviteService).toContain('mode: "portal"');
    expect(canonicalInviteService).not.toContain("properties?.action_link");
    expect(activationRoute).toContain("supabase.auth.verifyOtp");
    expect(activationRoute).toContain("token_hash: tokenHash");
    expect(activationRoute).toContain('new URL("/portal/auth/confirm"');
    expect(confirmPage).toContain("/api/portal/invites/accept");
    expect(confirmPage).not.toContain('.from("customers")');
    expect(confirmPage).not.toContain('.from("customer_portal_invites")');
  });

  it("uses one booking command for create, reschedule, and cancel", () => {
    expect(bookingSql).toContain("apply_portal_booking_command_atomic");
    expect(bookingSql).toContain("pg_advisory_xact_lock");
    expect(bookingSql).toContain("This time overlaps an existing booking");
    expect(bookingSql).toContain(
      "Work-order-linked booking requires staff work-order workflow",
    );
    expect(staffBookingRoute).toContain(
      'rpc("apply_portal_booking_command_atomic"',
    );
    expect(customerBookingRoute).toContain("Idempotency-Key");
  });

  it("preserves booking history instead of deleting rows", () => {
    expect(staffBookingRoute).not.toContain('.from("bookings").delete');
    expect(staffBookingRoute).toContain('action: "cancel"');
    expect(bookingSql).toContain("cancelled_at");
    expect(bookingSql).toContain("cancellation_reason");
  });
});
