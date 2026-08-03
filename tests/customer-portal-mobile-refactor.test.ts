import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toPortalWorkOrderStatus } from "@/features/portal/lib/workOrderPresentation";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("customer portal mobile refactor", () => {
  it("translates internal work-order states into customer language", () => {
    expect(
      toPortalWorkOrderStatus({
        status: "awaiting_approval",
        approvalState: "awaiting_customer",
      }),
    ).toMatchObject({
      key: "approval_needed",
      label: "Your approval is needed",
      actionRequired: true,
    });
    expect(toPortalWorkOrderStatus({ status: "waiting_parts" })).toMatchObject({
      key: "waiting_for_parts",
      label: "Waiting for parts",
      actionRequired: false,
    });
    expect(
      toPortalWorkOrderStatus({
        status: "ready_to_invoice",
        invoiceSentAt: "2026-07-21T12:00:00.000Z",
      }),
    ).toMatchObject({
      key: "ready_for_pickup",
      label: "Ready for pickup",
      actionRequired: true,
    });
    expect(toPortalWorkOrderStatus({ status: "closed" })).toMatchObject({
      key: "completed",
      complete: true,
    });
  });

  it("removes the internal shop board from every customer portal entry point", () => {
    const home = read("app/portal/page.tsx");
    const status = read("app/portal/status/page.tsx");

    expect(home).not.toContain("WorkOrderBoard");
    expect(status).not.toContain("WorkOrderBoard");
    expect(home).toContain("listPortalWorkOrdersForCustomer");
    expect(status).toContain("listPortalWorkOrdersForCustomer");
    expect(status).toContain("requirePortalCustomerActor");
  });

  it("scopes portal work orders and related vehicles to the authenticated customer and shop", () => {
    const loader = read("features/portal/server/portalWorkOrders.ts");

    expect(loader).toContain('.eq("shop_id", shopId)');
    expect(loader).toContain('.eq("customer_id", customerId)');
    expect(loader).toContain('.in("work_order_id", workOrderIds)');
    expect(loader).not.toContain("createAdminSupabase");
  });

  it("uses a mobile drawer and a collapsed desktop rail", () => {
    const shell = read("features/portal/components/PortalShell.tsx");

    expect(shell).toContain(
      "const [desktopExpanded, setDesktopExpanded] = useState(false)",
    );
    expect(shell).toContain('aria-label="Open portal menu"');
    expect(shell).toContain("w-[72px]");
    expect(shell).toContain("Mobile portal navigation");
  });

  it("loads the profile identity and validates accepted invite evidence", () => {
    const profile = read("app/portal/profile/page.tsx");

    expect(profile).toContain(
      '"id,shop_id,first_name,last_name,phone,street,city,province,postal_code"',
    );
    expect(profile).toContain('.eq("accepted_by_user_id", user.id)');
    expect(profile).toContain('.not("accepted_at", "is", null)');
    expect(profile).toContain('.is("revoked_at", null)');
  });

  it("routes work-order messages to the assigned advisor with management coverage", () => {
    const route = read("app/api/chat/start-conversation/route.ts");
    const workspace = read(
      "features/chat/components/PortalMessagesWorkspace.tsx",
    );

    expect(route).toContain('.select("advisor_id")');
    expect(route).toContain('.eq("customer_id", createAccess.customerId)');
    expect(route).toContain('.in("role", ["owner", "admin", "manager"])');
    expect(workspace).toContain('searchParams.get("workOrderId")');
    expect(workspace).toContain("Message your advisor");
  });
});
