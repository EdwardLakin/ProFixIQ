import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const signInRoute = readFileSync("app/api/auth/sign-in/route.ts", "utf8");

describe("customer portal sign-in policy independence", () => {
  it("resolves the customer through the admin client after password authentication", () => {
    const customerBranch = signInRoute.slice(
      signInRoute.indexOf('if (surface === "customer")'),
      signInRoute.indexOf('if (surface === "fleet")'),
    );

    expect(customerBranch).toContain("const admin = createAdminSupabase()");
    expect(customerBranch).toContain('await admin\n      .from("customers")');
    expect(customerBranch).toContain('.eq("user_id", signedInUser.id)');
    expect(customerBranch).not.toContain('await supabase\n      .from("customers")');
  });

  it("still requires accepted, non-revoked invite evidence for the verified user", () => {
    const customerBranch = signInRoute.slice(
      signInRoute.indexOf('if (surface === "customer")'),
      signInRoute.indexOf('if (surface === "fleet")'),
    );

    expect(customerBranch).toContain('.from("customer_portal_invites")');
    expect(customerBranch).toContain('.eq("accepted_by_user_id", signedInUser.id)');
    expect(customerBranch).toContain('.not("accepted_at", "is", null)');
    expect(customerBranch).toContain('.is("revoked_at", null)');
  });
});
