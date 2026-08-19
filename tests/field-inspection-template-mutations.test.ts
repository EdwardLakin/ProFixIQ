import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateInspectionTemplateMutation } from "@/features/inspections/server/inspectionTemplateMutation";

const mocks = vi.hoisted(() => ({
  deleteRows: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  maybeSingle: vi.fn(),
  requireAccess: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/features/mobile/service/server/access", () => ({
  requireMobileServiceOperatorApiAccess: mocks.requireAccess,
}));

import {
  DELETE,
  PATCH,
  POST,
} from "../app/api/mobile/service/inspection-templates/route";

const TEMPLATE_ID = "00000000-0000-4000-8000-000000000111";
const SHOP_ID = "00000000-0000-4000-8000-000000000222";
const USER_ID = "00000000-0000-4000-8000-000000000333";

const richSections = [
  {
    title: "Brakes",
    source: { kind: "customer-form", page: 2 },
    items: [
      {
        item: "Front pad thickness",
        unit: "mm",
        fieldType: "measurement",
        notes: "Retain this runner metadata",
        parts: [{ name: "Brake pad set", quantity: 1 }],
      },
    ],
  },
];

const validBody = {
  templateName: "Field brake inspection",
  sections: richSections,
  description: "Truck-ready brake workflow",
  vehicleType: "truck",
  tags: ["field", "brakes"],
  laborHours: 1.25,
};

const chain = {
  delete: mocks.deleteRows,
  eq: mocks.eq,
  insert: mocks.insert,
  maybeSingle: mocks.maybeSingle,
  select: mocks.select,
  update: mocks.update,
};

function allowedAccess(managementRole = true) {
  return {
    ok: true as const,
    authUserId: USER_ID,
    managementRole,
    profile: { id: USER_ID, shop_id: SHOP_ID, role: "owner" },
    supabase: { from: mocks.from },
  };
}

function jsonRequest(method: string, body: unknown) {
  return new Request(
    "http://localhost/api/mobile/service/inspection-templates",
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue(chain);
  mocks.insert.mockReturnValue(chain);
  mocks.update.mockReturnValue(chain);
  mocks.deleteRows.mockReturnValue(chain);
  mocks.eq.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.maybeSingle.mockResolvedValue({
    data: { id: TEMPLATE_ID },
    error: null,
  });
  mocks.requireAccess.mockResolvedValue(allowedAccess());
});

describe("Field inspection-template validation", () => {
  it("preserves canonical runner metadata while validating required structure", () => {
    const validation = validateInspectionTemplateMutation(validBody);

    expect(validation).toEqual({
      ok: true,
      value: {
        ...validBody,
        sections: richSections,
      },
    });
    if (validation.ok) {
      expect(validation.value.sections).toBe(richSections);
    }
  });

  it("rejects empty items and out-of-range labor without silently normalizing them", () => {
    expect(
      validateInspectionTemplateMutation({
        ...validBody,
        sections: [{ title: "Brakes", items: [{ item: "   " }] }],
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining("needs a label"),
      }),
    );
    expect(
      validateInspectionTemplateMutation({ ...validBody, laborHours: 1_000 }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining("999.99"),
      }),
    );
  });
});

describe("Field inspection-template mutation route", () => {
  it("requires a Field management role before touching template data", async () => {
    mocks.requireAccess.mockResolvedValueOnce(allowedAccess(false));

    const response = await POST(jsonRequest("POST", validBody));

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("derives ownership server-side and preserves validated template metadata", async () => {
    const response = await POST(jsonRequest("POST", validBody));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: TEMPLATE_ID });
    expect(mocks.from).toHaveBeenCalledWith("inspection_templates");
    expect(mocks.insert).toHaveBeenCalledWith({
      template_name: validBody.templateName,
      sections: richSections,
      description: validBody.description,
      vehicle_type: validBody.vehicleType,
      tags: validBody.tags,
      labor_hours: validBody.laborHours,
      is_public: false,
      shop_id: SHOP_ID,
      user_id: USER_ID,
    });
  });

  it("rejects invalid payloads before starting a mutation", async () => {
    const response = await POST(
      jsonRequest("POST", { ...validBody, sections: [] }),
    );

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("scopes updates by template, shop, and authenticated owner", async () => {
    const response = await PATCH(
      jsonRequest("PATCH", { ...validBody, templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        description: validBody.description,
        vehicle_type: validBody.vehicleType,
        tags: validBody.tags,
        labor_hours: validBody.laborHours,
      }),
    );
    expect(mocks.update.mock.calls[0]?.[0]).not.toHaveProperty("shop_id");
    expect(mocks.update.mock.calls[0]?.[0]).not.toHaveProperty("user_id");
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "id", TEMPLATE_ID);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "shop_id", SHOP_ID);
    expect(mocks.eq).toHaveBeenNthCalledWith(3, "user_id", USER_ID);
  });

  it("does not erase optional metadata omitted by a focused edit", async () => {
    await PATCH(
      jsonRequest("PATCH", {
        templateId: TEMPLATE_ID,
        templateName: validBody.templateName,
        sections: richSections,
      }),
    );

    expect(mocks.update).toHaveBeenCalledWith({
      template_name: validBody.templateName,
      sections: richSections,
    });
  });

  it("scopes deletes by template, shop, and authenticated owner", async () => {
    const response = await DELETE(
      new Request(
        `http://localhost/api/mobile/service/inspection-templates?templateId=${TEMPLATE_ID}`,
        { method: "DELETE" },
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteRows).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "id", TEMPLATE_ID);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "shop_id", SHOP_ID);
    expect(mocks.eq).toHaveBeenNthCalledWith(3, "user_id", USER_ID);
  });

  it("reports a referenced-template delete as a conflict", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: {
        code: "23503",
        message: "Inspection template is attached to a work-order line.",
      },
    });

    const response = await DELETE(
      new Request(
        `http://localhost/api/mobile/service/inspection-templates?templateId=${TEMPLATE_ID}`,
        { method: "DELETE" },
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This inspection template is in use and cannot be deleted.",
    });
  });

  it("returns not found when an owned, shop-scoped mutation matches no row", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await PATCH(
      jsonRequest("PATCH", { ...validBody, templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(404);
  });
});

describe("inspection-template RLS migration contract", () => {
  const migration = readFileSync(
    "supabase/migrations/20260819040033_field_inspection_template_rls.sql",
    "utf8",
  );
  const trustedScopeFollowup = readFileSync(
    "supabase/migrations/20260819040707_preserve_trusted_inspection_template_scope.sql",
    "utf8",
  );

  it("replays the owner trigger with a locked search path and no direct client execution", () => {
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain(
      "p.id = v_actor_user_id or p.user_id = v_actor_user_id",
    );
    expect(migration).toContain(
      "create trigger trg_set_inspection_template_owner",
    );
    expect(migration).toContain("from public, anon, authenticated;");
  });

  it("installs all four authenticated policies with linked-profile tenant scope", () => {
    for (const policy of ["select", "insert", "update", "delete"]) {
      expect(migration).toContain(
        `create policy inspection_templates_${policy}`,
      );
    }
    expect(migration).toContain("is_public is true");
    expect(migration).toContain("p.id = (select auth.uid())");
    expect(migration).toContain("p.user_id = (select auth.uid())");
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(migration).toContain(
      "public.canonical_shop_membership_role(p.role) in (",
    );
    expect(migration).toContain(
      "'owner', 'admin', 'manager', 'advisor', 'service'",
    );

    const selectPolicy = migration.slice(
      migration.indexOf("create policy inspection_templates_select"),
      migration.indexOf("create policy inspection_templates_insert"),
    );
    expect(selectPolicy).not.toContain("canonical_shop_membership_role");

    for (const policy of ["insert", "update", "delete"]) {
      const start = migration.indexOf(
        `create policy inspection_templates_${policy}`,
      );
      const end = migration.indexOf("create policy ", start + 1);
      const policySql = migration.slice(start, end === -1 ? undefined : end);
      expect(policySql).toContain("canonical_shop_membership_role");
    }
  });

  it("removes anon access and limits authenticated table grants", () => {
    expect(migration).toContain(
      "revoke all privileges on table public.inspection_templates from anon;",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete\n  on table public.inspection_templates\n  to authenticated;",
    );
    expect(migration).toContain("idx_inspection_templates__shop_id");
    expect(migration).toContain("idx_inspection_templates__user_id");
  });

  it("preserves scope supplied by trusted template publishers", () => {
    const fleetPublisher = readFileSync(
      "supabase/migrations/20260806164259_fleet_driver_dispatch_portals.sql",
      "utf8",
    );

    expect(fleetPublisher).toMatch(
      /values\s*\(\s*v_user_id,\s*v_shop_id,\s*btrim\(p_name\)/s,
    );
    expect(trustedScopeFollowup).toContain("if new.user_id is null then");
    expect(trustedScopeFollowup).toContain("if new.shop_id is null then");
    expect(trustedScopeFollowup).toContain("new.user_id := v_actor_user_id;");
    expect(trustedScopeFollowup).toContain("new.shop_id := v_actor_shop_id;");
    expect(trustedScopeFollowup).toContain("from public, anon, authenticated;");
  });
});
