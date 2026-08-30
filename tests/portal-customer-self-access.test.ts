import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const portalAuth = read("features/portal/server/portalAuth.ts");
const portalActor = read("features/portal/server/requirePortalActor.ts");
const invoicePage = read("app/portal/invoices/[id]/page.tsx");
const workOrderPage = read("app/portal/work-orders/view/[id]/page.tsx");

describe("portal customer identity resolution", () => {
  it("resolves portal identity server-side rather than through the caller's client", () => {
    // Every `customers` SELECT policy requires a staff identity and a pure
    // portal customer has no `profiles` row, while `customer_portal_invites`
    // has RLS enabled with no policy at all. The caller's own client therefore
    // reads nothing, which is what blocked portal entry and payment checkout.
    expect(portalAuth).toContain(
      'import { createAdminSupabase } from "@/features/shared/lib/supabase/server"',
    );
    expect(portalAuth).toContain("const admin = createAdminSupabase();");
    expect(portalAuth).toContain('await admin\n    .from("customers")');
    expect(portalAuth).toContain(
      'await admin\n    .from("customer_portal_invites")',
    );
  });

  it("pins every service-role read to the verified session identity", () => {
    // Service-role bypasses RLS, so authorization has to be explicit. `userId`
    // and `userEmail` come from requireAuthedUser, never from a caller.
    expect(portalActor).toContain("const user = await requireAuthedUser(supabase)");
    expect(portalActor).toContain(
      "await requirePortalCustomerAccess(user.id, user.email)",
    );
    expect(portalAuth).toContain('.eq("user_id", userId)');
    expect(portalAuth).toContain('.eq("accepted_by_user_id", userId)');
  });

  it("still requires accepted, non-revoked invite evidence", () => {
    expect(portalAuth).toContain('.not("accepted_at", "is", null)');
    expect(portalAuth).toContain('.is("revoked_at", null)');
    expect(portalAuth).toContain('throw new PortalAccessError("Portal invite required", 403)');
    // The in-memory re-check must survive, including the email match, so a
    // widened query can never by itself grant access.
    expect(portalAuth).toContain("row.email.trim().toLowerCase() === userEmail");
  });

  it("does not grant the customer's own JWT access to staff-facing tables", () => {
    // Resolving server-side is what keeps `customers` columns such as `notes`,
    // `import_notes`, and `merge_reason` away from the portal browser. An RLS
    // policy granting the customer row access would expose all of them, because
    // column privileges are role-wide and staff share the `authenticated` role.
    expect(portalAuth).not.toContain("customers_portal_self_select");
    expect(portalAuth).not.toContain(
      "customer_portal_invites_self_accepted_select",
    );
  });

  it("keeps the callers unchanged in behaviour after the signature simplification", () => {
    expect(invoicePage).toContain("await requirePortalCustomer(userId)");
    expect(workOrderPage).toContain("await requirePortalCustomer(userId)");
  });
});
