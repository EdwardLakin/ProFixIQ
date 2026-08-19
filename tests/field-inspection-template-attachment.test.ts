import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveMobileWorkOrderHref } from "@/features/mobile/work-orders/mobileWorkOrderRouting";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  inspectionRead: vi.fn(),
  lineRead: vi.fn(),
  lineSelect: vi.fn(),
  lineUpdate: vi.fn(),
  templateRead: vi.fn(),
  workOrderRead: vi.fn(),
  updateRead: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock("@/features/mobile/service/server/access", () => ({
  requireMobileServiceOperatorApiAccess: mocks.requireAccess,
}));

import { PUT } from "../app/api/mobile/service/work-order-lines/inspection-template/route";

const LINE_ID = "00000000-0000-4000-8000-000000000111";
const WORK_ORDER_ID = "00000000-0000-4000-8000-000000000222";
const TEMPLATE_ID = "00000000-0000-4000-8000-000000000333";
const OTHER_TEMPLATE_ID = "00000000-0000-4000-8000-000000000444";
const SHOP_ID = "00000000-0000-4000-8000-000000000555";
const USER_ID = "00000000-0000-4000-8000-000000000666";

function chain(final: ReturnType<typeof vi.fn>) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    maybeSingle: final,
    neq: vi.fn(),
    or: vi.fn(),
    select: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

const lineReadChain = chain(mocks.lineRead);
const updateChain = chain(mocks.updateRead);
const workOrderChain = chain(mocks.workOrderRead);
const templateChain = chain(mocks.templateRead);
const inspectionChain = chain(mocks.inspectionRead);

const tables = {
  inspections: {
    select: vi.fn(() => inspectionChain),
  },
  inspection_templates: {
    select: vi.fn(() => templateChain),
  },
  work_order_lines: {
    select: mocks.lineSelect.mockImplementation(() => lineReadChain),
    update: mocks.lineUpdate.mockImplementation(() => updateChain),
  },
  work_orders: {
    select: vi.fn(() => workOrderChain),
  },
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

function request(body: unknown) {
  return new Request(
    "http://localhost/api/mobile/service/work-order-lines/inspection-template",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    id: LINE_ID,
    work_order_id: WORK_ORDER_ID,
    shop_id: SHOP_ID,
    status: "awaiting",
    line_status: null,
    voided_at: null,
    inspection_template_id: null,
    template_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: keyof typeof tables) => tables[table]);
  mocks.requireAccess.mockResolvedValue(allowedAccess());
  mocks.lineRead.mockResolvedValue({ data: line(), error: null });
  mocks.workOrderRead.mockResolvedValue({
    data: { id: WORK_ORDER_ID, status: "in_progress" },
    error: null,
  });
  mocks.templateRead.mockResolvedValue({
    data: { id: TEMPLATE_ID, template_name: "Field inspection" },
    error: null,
  });
  mocks.inspectionRead.mockResolvedValue({ data: null, error: null });
  mocks.updateRead.mockResolvedValue({ data: { id: LINE_ID }, error: null });
});

describe("Field inspection-template assignment route", () => {
  it("requires Field template-management access before reading line data", async () => {
    mocks.requireAccess.mockResolvedValueOnce(allowedAccess(false));

    const response = await PUT(
      request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers before starting the mutation", async () => {
    const response = await PUT(
      request({ workOrderLineId: "not-a-line", templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("derives tenant scope server-side and mirrors the canonical template linkage", async () => {
    const response = await PUT(
      request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      attached: true,
      workOrderId: WORK_ORDER_ID,
      workOrderLineId: LINE_ID,
      templateId: TEMPLATE_ID,
    });
    expect(lineReadChain.eq).toHaveBeenCalledWith("shop_id", SHOP_ID);
    expect(templateChain.eq).toHaveBeenCalledWith("shop_id", SHOP_ID);
    expect(mocks.lineUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        inspection_template_id: TEMPLATE_ID,
        template_id: TEMPLATE_ID,
      }),
    );
    expect(updateChain.eq).toHaveBeenCalledWith("id", LINE_ID);
    expect(updateChain.eq).toHaveBeenCalledWith("work_order_id", WORK_ORDER_ID);
    expect(updateChain.eq).toHaveBeenCalledWith("shop_id", SHOP_ID);
    expect(updateChain.or).toHaveBeenCalledWith(
      `inspection_template_id.is.null,inspection_template_id.eq.${TEMPLATE_ID}`,
    );
    expect(updateChain.or).toHaveBeenCalledWith(
      `template_id.is.null,template_id.eq.${TEMPLATE_ID}`,
    );
    expect(updateChain.or).toHaveBeenCalledWith(
      expect.stringContaining("status.not.in.("),
    );
    expect(updateChain.or).toHaveBeenCalledWith(
      expect.stringContaining("line_status.not.in.("),
    );
  });

  it("does not reveal or update a line outside the authorized shop", async () => {
    mocks.lineRead.mockResolvedValueOnce({ data: null, error: null });

    const response = await PUT(
      request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(404);
    expect(mocks.lineUpdate).not.toHaveBeenCalled();
  });

  it("rejects destructive replacement of an existing template", async () => {
    mocks.lineRead.mockResolvedValueOnce({
      data: line({ inspection_template_id: OTHER_TEMPLATE_ID }),
      error: null,
    });

    const response = await PUT(
      request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(409);
    expect(mocks.lineUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent when both template columns already point at the request", async () => {
    mocks.lineRead.mockResolvedValueOnce({
      data: line({
        inspection_template_id: TEMPLATE_ID,
        template_id: TEMPLATE_ID,
      }),
      error: null,
    });

    const response = await PUT(
      request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      attached: false,
      workOrderLineId: LINE_ID,
    });
    expect(mocks.lineUpdate).not.toHaveBeenCalled();
  });

  it("rejects completed lines before writing", async () => {
    mocks.lineRead.mockResolvedValueOnce({
      data: line({ status: "completed" }),
      error: null,
    });

    const response = await PUT(
      request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(409);
    expect(mocks.lineUpdate).not.toHaveBeenCalled();
  });

  it.each([{ status: "cancelled" }, { line_status: "deferred" }])(
    "rejects terminal status mirrors before writing: %o",
    async (terminal) => {
      mocks.lineRead.mockResolvedValueOnce({
        data: line(terminal),
        error: null,
      });

      const response = await PUT(
        request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
      );

      expect(response.status).toBe(409);
      expect(mocks.lineUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(["ready_to_invoice", "cancelled", "paid"])(
    "rejects a stale active line under terminal parent %s",
    async (status) => {
      mocks.workOrderRead.mockResolvedValueOnce({
        data: { id: WORK_ORDER_ID, status },
        error: null,
      });

      const response = await PUT(
        request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
      );

      expect(response.status).toBe(409);
      expect(mocks.lineUpdate).not.toHaveBeenCalled();
    },
  );

  it("does not assign a new identity over existing unlinked inspection progress", async () => {
    mocks.inspectionRead.mockResolvedValueOnce({
      data: { id: "00000000-0000-4000-8000-000000000777", template_id: null },
      error: null,
    });

    const response = await PUT(
      request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("template-link repair"),
    });
    expect(inspectionChain.eq).toHaveBeenCalledWith(
      "work_order_line_id",
      LINE_ID,
    );
    expect(inspectionChain.eq).toHaveBeenCalledWith("shop_id", SHOP_ID);
    expect(mocks.lineUpdate).not.toHaveBeenCalled();
  });

  it.each(["23503", "23514"])(
    "reports transactional guard rejection %s as a conflict",
    async (code) => {
      mocks.updateRead.mockResolvedValueOnce({
        data: null,
        error: { code, message: "Database attachment guard" },
      });

      const response = await PUT(
        request({ workOrderLineId: LINE_ID, templateId: TEMPLATE_ID }),
      );

      expect(response.status).toBe(409);
    },
  );
});

describe("Field inspection-template selection flow", () => {
  it("preserves the template while choosing a work order", () => {
    expect(
      resolveMobileWorkOrderHref({
        workOrderId: WORK_ORDER_ID,
        status: "in_progress",
        readyToInvoiceCloseout: false,
        inspectionTemplateId: TEMPLATE_ID,
      }),
    ).toBe(`/mobile/work-orders/${WORK_ORDER_ID}?templateId=${TEMPLATE_ID}`);
  });

  it("launches the canonical runner with work-order-line identity", () => {
    const detail = readFileSync(
      "features/work-orders/mobile/MobileWorkOrderClient.tsx",
      "utf8",
    );

    expect(detail).toContain(
      '"/api/mobile/service/work-order-lines/inspection-template"',
    );
    expect(detail).toContain("workOrderLineId: ln.id");
    expect(detail).toContain(
      "`/mobile/inspections/${encodeURIComponent(body.workOrderLineId)}?${query.toString()}`",
    );
    expect(detail).toContain("[ln.status, ln.line_status]");
    expect(detail).toContain("FIELD_INSPECTION_LOCKED_PARENT_STATUSES.has(");
    for (const status of [
      "declined",
      "deferred",
      "voided",
      "cancelled",
      "canceled",
    ]) {
      expect(detail).toContain(`"${status}"`);
    }
    for (const parentStatus of ["cancelled", "paid", "archived"]) {
      expect(detail).toContain(`"${parentStatus}"`);
    }
  });
});

describe("Field inspection-template attachment migration", () => {
  const migration = readFileSync(
    "supabase/migrations/20260819040800_guard_field_inspection_template_attachment.sql",
    "utf8",
  );

  it("checks and locks the same-shop commercial parent inside the line update", () => {
    expect(migration).toContain("from public.work_orders as wo");
    expect(migration).toContain("wo.id = new.work_order_id");
    expect(migration).toContain("wo.shop_id = new.shop_id");
    expect(migration).toContain("for share;");
    for (const status of ["cancelled", "paid", "voided", "archived"]) {
      expect(migration).toContain(`'${status}'`);
    }
  });

  it("only runs when a canonical or legacy template linkage actually changes", () => {
    expect(migration).toContain(
      "before update of inspection_template_id, template_id",
    );
    expect(migration).toContain(
      "old.inspection_template_id is distinct from new.inspection_template_id",
    );
    expect(migration).toContain(
      "old.template_id is distinct from new.template_id",
    );
    expect(migration).toContain("if new.voided_at is not null then");
  });

  it("serializes attachments with deletion and fails closed over inspection progress", () => {
    expect(migration).toContain("inspection_template.shop_id = new.shop_id");
    expect(migration).toContain("inspection_template.is_public is true");
    expect(migration).toContain("for key share;");
    expect(migration).toContain("from public.inspections as inspection");
    expect(migration).toContain(
      "old.inspection_template_id is null and old.template_id is null",
    );
    expect(migration).toContain(
      "inspection.template_id is distinct from v_previous_template_id",
    );
  });

  it("locks linked line inserts against concurrent template deletion", () => {
    const insertGuardStart = migration.indexOf(
      "create or replace function private.guard_inserted_work_order_line_inspection_template()",
    );
    const deleteGuardStart = migration.indexOf(
      "create or replace function private.guard_inspection_template_delete_references()",
    );
    const insertGuard = migration.slice(insertGuardStart, deleteGuardStart);

    expect(insertGuardStart).toBeGreaterThan(-1);
    expect(deleteGuardStart).toBeGreaterThan(insertGuardStart);
    expect(insertGuard).toContain(
      "new.inspection_template_id is distinct from new.template_id",
    );
    expect(insertGuard).toContain("inspection_template.shop_id = new.shop_id");
    expect(insertGuard).toContain("inspection_template.is_public is true");
    expect(insertGuard).toContain("for key share;");
    expect(insertGuard).toContain(
      "create trigger trg_guard_inserted_work_order_line_inspection_template",
    );
    expect(insertGuard).toContain("before insert");
    expect(insertGuard).toContain("new.inspection_template_id is not null");
    expect(insertGuard).toContain("or new.template_id is not null");
    expect(insertGuard).toContain(
      "from public, anon, authenticated, service_role;",
    );
  });

  it("normalizes both line status mirrors before attachment", () => {
    expect(migration).toContain("coalesce(new.status::text, '')");
    expect(migration).toContain("coalesce(new.line_status::text, '')");
    for (const status of [
      "declined",
      "deferred",
      "voided",
      "cancelled",
      "canceled",
    ]) {
      expect(migration).toContain(`'${status}'`);
    }
  });

  it("blocks deletion while canonical or legacy line references remain", () => {
    expect(migration).toContain(
      "private.guard_inspection_template_delete_references()",
    );
    expect(migration).toContain(
      "work_order_line.inspection_template_id = old.id",
    );
    expect(migration).toContain("work_order_line.template_id = old.id");
    expect(migration).toContain(
      "create trigger trg_guard_inspection_template_delete_references",
    );
    expect(migration).toContain("before delete");
  });

  it("keeps the invariant function private and non-callable", () => {
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role;",
    );
  });
});
