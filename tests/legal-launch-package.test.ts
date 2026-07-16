import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const config = read("features/legal/lib/config.ts");
const content = read("features/legal/lib/content.ts");
const legalIndex = read("app/legal/page.tsx");
const rootLayout = read("app/layout.tsx");
const signUp = read("features/auth/components/SignIn.tsx");
const customerConfirm = read("app/portal/auth/confirm/page.tsx");
const customerInviteRoute = read("app/api/portal/invites/accept/route.ts");
const fleetInvitePage = read("app/portal/auth/fleet-invite/page.tsx");
const fleetInviteRoute = read("app/api/portal/fleet/invites/accept/route.ts");
const propertyInvitePage = read("app/portal/property/invite/accept/page.tsx");
const propertyInviteAction = read(
  "app/portal/property/invite/accept/actions.ts",
);
const quoteActions = read(
  "features/portal/components/QuoteApprovalActions.tsx",
);
const quoteRoute = read(
  "app/api/work-orders/quotes/[id]/approval-decision/route.ts",
);
const quoteHelper = read(
  "features/work-orders/server/workOrderQuoteLineApproval.ts",
);
const legalSql = read(
  "supabase/migrations/20260716170000_legal_acceptance_evidence.sql",
);

describe("counsel-review legal launch package", () => {
  it("ships a complete draft-only legal centre", () => {
    for (const slug of [
      "terms",
      "privacy",
      "data-processing-addendum",
      "acceptable-use",
      "cookies",
      "portal-terms",
      "repair-authorization",
      "retention",
      "subprocessors",
      "support",
    ]) {
      expect(config).toContain(`slug: "${slug}"`);
      expect(content).toContain(slug);
    }
    expect(config).toContain('LEGAL_REVIEW_STATUS = "draft-counsel-review"');
    expect(legalIndex).toContain("Counsel and launch checklist");
    expect(legalIndex).toContain("index: false");
    expect(rootLayout).toContain('pathname.startsWith("/legal")');
  });

  it("requires and records versioned owner signup consent", () => {
    expect(signUp).toContain("legalAccepted");
    expect(signUp).toContain("signupLegalMetadata()");
    expect(signUp).toContain('profixiq_account_kind: "shop_owner_signup"');
    expect(signUp).toContain("Data Processing Addendum");
    expect(legalSql).toContain("capture_shop_signup_legal_acceptance");
    expect(legalSql).toContain(
      "Current shop signup legal documents must be accepted.",
    );
  });

  it("requires portal terms for every invitation surface", () => {
    for (const surface of [
      customerConfirm,
      fleetInvitePage,
      propertyInvitePage,
    ]) {
      expect(surface).toContain("portalTerms");
      expect(surface).toContain("Privacy");
      expect(surface).toContain('type="checkbox"');
    }
    expect(customerInviteRoute).toContain(
      "accept_customer_portal_invite_with_legal_atomic",
    );
    expect(fleetInviteRoute).toContain(
      "accept_fleet_portal_invite_with_legal_atomic",
    );
    expect(propertyInviteAction).toContain(
      "accept_property_portal_invite_with_legal_atomic",
    );
  });

  it("requires versioned authorization and one atomic quote decision", () => {
    expect(quoteActions).toContain("authorizationAccepted");
    expect(quoteActions).toContain('"Idempotency-Key": operationKey');
    expect(quoteActions).toContain("repairAuthorization.version");
    expect(quoteRoute).toContain("Current electronic repair authorization");
    expect(quoteHelper).toContain(
      "apply_customer_quote_decision_with_legal_atomic",
    );
  });

  it("keeps acceptance evidence immutable, tenant-scoped and server-owned", () => {
    expect(legalSql).toContain(
      "create table if not exists public.legal_acceptances",
    );
    expect(legalSql).toContain("enable row level security");
    expect(legalSql).toContain("p.shop_id = legal_acceptances.shop_id");
    expect(legalSql).toContain(
      "revoke all on table public.legal_acceptances from anon, authenticated",
    );
    expect(legalSql).toContain(
      "grant execute on function public.record_legal_acceptances_atomic",
    );
    expect(legalSql).toContain("to service_role");
    expect(legalSql).not.toContain(
      "grant insert on table public.legal_acceptances",
    );
    expect(legalSql).not.toContain(
      "grant update on table public.legal_acceptances",
    );
  });
});
