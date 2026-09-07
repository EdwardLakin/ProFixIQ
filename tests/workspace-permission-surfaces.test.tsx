import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EmployeeAccessPanel from "@/features/workspace/authorization/components/EmployeeAccessPanel";
import RolePermissionsPanel from "@/features/workspace/authorization/components/RolePermissionsPanel";
import {
  WORKSPACE_CAPABILITIES,
  WORKSPACE_CAPABILITY_KEYS,
} from "@/features/workspace/authorization/capabilities";
import type { PermissionSnapshot } from "@/features/workspace/authorization/components/permissionModel";

const SHOP_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";

function snapshot(
  overrides: Partial<PermissionSnapshot> = {},
): PermissionSnapshot {
  return {
    shopId: SHOP_ID,
    actor: { profileId: ACTOR_ID, canonicalRole: "owner", isOwner: true },
    manageableRoles: ["mechanic", "parts"],
    capabilities: WORKSPACE_CAPABILITY_KEYS.map((capabilityKey) => ({
      capabilityKey,
      isProtected:
        capabilityKey === WORKSPACE_CAPABILITIES.manageTeamPermissions,
      actorCanGrant: true,
    })),
    presets: [
      {
        roleKey: "mechanic",
        capabilityKey: WORKSPACE_CAPABILITIES.requestParts,
        effect: "allow",
      },
    ],
    rolePolicies: [],
    employee: null,
    ...overrides,
  };
}

function mockSnapshot(payload: PermissionSnapshot) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/workspace/authorization/administration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ snapshot: payload }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, changed: true }),
        _init: init,
      } as unknown as Response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Owner Settings roles and permissions", () => {
  beforeEach(() => {
    mockSnapshot(snapshot());
  });

  it("shows business language and the effective result, never the capability key", async () => {
    await act(async () => {
      render(<RolePermissionsPanel />);
    });

    expect(await screen.findByText("Assign work")).toBeInTheDocument();
    expect(
      screen.getByText("Assign or reassign repair work to technicians."),
    ).toBeInTheDocument();
    expect(screen.queryByText("work_order.assignment.manage")).toBeNull();
    expect(screen.queryByText(/capability_key/i)).toBeNull();
    expect(screen.queryByText(/shop_role_capability_policies/i)).toBeNull();

    // Technician defaults: allowed to request parts, not to assign work.
    expect(screen.getAllByText(/ProFixIQ default/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not allowed").length).toBeGreaterThan(0);
  });

  it("posts INHERIT / ALLOW / DENY through the guarded role-policy contract", async () => {
    const fetchMock = mockSnapshot(snapshot());
    const user = userEvent.setup();
    await act(async () => {
      render(<RolePermissionsPanel />);
    });
    await screen.findByText("Assign work");

    const row = screen.getByText("Assign work").closest("li");
    expect(row).not.toBeNull();
    await user.click(
      within(row as HTMLElement).getByRole("radio", { name: "Allow" }),
    );

    const call = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/workspace/authorization/role-policies",
    );
    expect(call).toBeDefined();
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      roleKey: "mechanic",
      capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
      effect: "allow",
    });
  });

  it("never offers to edit a protected capability", async () => {
    await act(async () => {
      render(<RolePermissionsPanel />);
    });
    const row = (await screen.findByText("Manage permissions")).closest("li");
    for (const option of within(row as HTMLElement).getAllByRole("radio")) {
      expect(option).toBeDisabled();
    }
  });

  it("says nothing is configurable rather than guessing when the caller is denied", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden" }),
      })) as unknown as typeof fetch,
    );
    await act(async () => {
      render(<RolePermissionsPanel />);
    });
    expect(
      await screen.findByText(/do not have permission to change roles/i),
    ).toBeInTheDocument();
  });
});

describe("Workforce employee access and permissions", () => {
  const employee: NonNullable<PermissionSnapshot["employee"]> = {
    profileId: EMPLOYEE_ID,
    fullName: "Edward Smith",
    canonicalRole: "mechanic",
    isSelf: false,
    manageable: true,
    overrides: [
      {
        capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
        effect: "allow",
      },
    ],
    effective: [
      {
        capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
        granted: true,
        source: "individual_override",
      },
      {
        capabilityKey: WORKSPACE_CAPABILITIES.requestParts,
        granted: true,
        source: "profixiq_preset",
      },
    ],
  };
  const employeeSnapshot = snapshot({ employee });

  it("explains why the Lead Hand has access without changing their role", async () => {
    mockSnapshot(employeeSnapshot);
    const user = userEvent.setup();
    await act(async () => {
      render(<EmployeeAccessPanel profileId={EMPLOYEE_ID} />);
    });

    expect(
      await screen.findByText(/1 individual override/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /review permissions/i }),
    );

    const row = screen.getByText("Assign work").closest("li") as HTMLElement;
    expect(within(row).getByText("Allowed")).toBeInTheDocument();
    expect(within(row).getByText(/Individual override/)).toBeInTheDocument();
    expect(
      within(row).getByText(/Technician setting: Not allowed/),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("radio", { name: "Use Technician setting" }),
    ).toBeInTheDocument();
  });

  it("posts an individual override for the employee being viewed", async () => {
    const fetchMock = mockSnapshot(employeeSnapshot);
    const user = userEvent.setup();
    await act(async () => {
      render(<EmployeeAccessPanel profileId={EMPLOYEE_ID} />);
    });
    await screen.findByText(/1 individual override/i);
    await user.click(
      screen.getByRole("button", { name: /review permissions/i }),
    );

    const row = screen.getByText("Assign work").closest("li") as HTMLElement;
    await user.click(within(row).getByRole("radio", { name: "Deny" }));

    const call = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/workspace/authorization/staff-overrides",
    );
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      targetProfileId: EMPLOYEE_ID,
      capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
      effect: "deny",
    });
  });

  it("is read-only for a peer or higher-authority employee", async () => {
    mockSnapshot(snapshot({ employee: { ...employee, manageable: false } }));
    const user = userEvent.setup();
    await act(async () => {
      render(<EmployeeAccessPanel profileId={EMPLOYEE_ID} />);
    });
    expect(await screen.findByText(/read-only for you/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /clear individual overrides/i }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /review permissions/i }),
    );
    const row = screen.getByText("Assign work").closest("li") as HTMLElement;
    for (const option of within(row).getAllByRole("radio")) {
      expect(option).toBeDisabled();
    }
  });

  it("refuses to render permissions it could not load rather than showing them as allowed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: "Authorization service unavailable" }),
      })) as unknown as typeof fetch,
    );
    await act(async () => {
      render(<EmployeeAccessPanel profileId={EMPLOYEE_ID} />);
    });
    expect(
      await screen.findByText(/Authorization service unavailable/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Allowed")).toBeNull();
  });
});

describe("permission surfaces stay usable on a phone", () => {
  it("stacks each capability row and keeps the role list scrollable", async () => {
    mockSnapshot(snapshot());
    const { container } = await act(async () =>
      render(<RolePermissionsPanel />),
    );
    await screen.findByText("Assign work");

    const roleChips = container.querySelector(".overflow-x-auto");
    expect(roleChips).not.toBeNull();

    const row = screen.getByText("Assign work").closest("li") as HTMLElement;
    const layout = row.firstElementChild as HTMLElement;
    // Column on a phone, row from the small breakpoint up.
    expect(layout.className).toContain("flex-col");
    expect(layout.className).toContain("sm:flex-row");

    for (const option of within(row).getAllByRole("radio")) {
      // Touch targets stay at least 36px tall and never force a fixed width.
      expect(option.className).toContain("min-h-9");
      expect(option.className).not.toMatch(/\bw-\d/);
    }
  });
});
