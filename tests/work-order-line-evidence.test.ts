import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  parseAnnotationOverlay,
  type EvidenceAnnotationElement,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";

type TableName =
  | "work_orders"
  | "profiles"
  | "customers"
  | "fleet_members"
  | "fleet_vehicles";

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  rows: {
    work_orders: [] as Row[],
    profiles: [] as Row[],
    customers: [] as Row[],
    fleet_members: [] as Row[],
    fleet_vehicles: [] as Row[],
  },
  filters: [] as Array<{
    table: TableName;
    operation: "eq" | "in";
    column: string;
    value: unknown;
  }>,
}));

function queryFor(table: TableName) {
  const filters: Array<{
    operation: "eq" | "in";
    column: string;
    value: unknown;
  }> = [];

  const resolveRows = () =>
    mocks.rows[table].filter((row) =>
      filters.every((filter) => {
        if (filter.operation === "eq") {
          return row[filter.column] === filter.value;
        }
        return (
          Array.isArray(filter.value) &&
          filter.value.includes(row[filter.column])
        );
      }),
    );

  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockImplementation((column: string, value: unknown) => {
    filters.push({ operation: "eq", column, value });
    mocks.filters.push({ table, operation: "eq", column, value });
    return query;
  });
  query.in.mockImplementation((column: string, value: unknown[]) => {
    filters.push({ operation: "in", column, value });
    mocks.filters.push({ table, operation: "in", column, value });
    return query;
  });
  query.limit.mockReturnValue(query);
  query.maybeSingle.mockImplementation(async () => ({
    data: resolveRows()[0] ?? null,
    error: null,
  }));
  query.then.mockImplementation(
    (
      resolve: (value: { data: Row[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({ data: resolveRows(), error: null }).then(
        resolve,
        reject,
      ),
  );
  return query;
}

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: (table: TableName) => queryFor(table),
  }),
}));
vi.mock("server-only", () => ({}));

import { authorizeWorkOrderEvidence } from "@/features/work-orders/server/authorizeWorkOrderEvidence";
import {
  isCanonicalEvidenceStorageObject,
  sanitizeEvidenceFallbackUrl,
} from "@/features/work-orders/server/workOrderEvidenceUrls";

function sessionClient(userId: string | null): SupabaseClient<Database> {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
    },
  } as unknown as SupabaseClient<Database>;
}

function seedWorkOrder() {
  mocks.rows.work_orders = [
    {
      id: "work-order-a",
      shop_id: "shop-a",
      customer_id: "customer-a",
      vehicle_id: "vehicle-a",
    },
  ];
}

describe("work-order line evidence authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters.length = 0;
    for (const table of Object.keys(mocks.rows) as TableName[]) {
      mocks.rows[table] = [];
    }
    seedWorkOrder();
  });

  it("does not classify a same-shop customer profile as editable staff", async () => {
    mocks.rows.profiles = [
      { id: "portal-user", shop_id: "shop-a", role: "customer" },
    ];
    mocks.rows.customers = [
      {
        id: "customer-a",
        user_id: "portal-user",
        shop_id: "shop-a",
      },
    ];

    const actor = await authorizeWorkOrderEvidence(
      sessionClient("portal-user"),
      "work-order-a",
    );

    expect(actor).toMatchObject({
      kind: "customer",
      shopId: "shop-a",
      canEdit: false,
    });
  });

  it("allows a same-shop technician to edit evidence", async () => {
    mocks.rows.profiles = [
      { id: "tech-user", shop_id: "shop-a", role: "mechanic" },
    ];

    const actor = await authorizeWorkOrderEvidence(
      sessionClient("tech-user"),
      "work-order-a",
    );

    expect(actor).toMatchObject({
      kind: "staff",
      shopId: "shop-a",
      canEdit: true,
    });
  });

  it("allows parts staff to view internal evidence without granting edit access", async () => {
    mocks.rows.profiles = [
      { id: "parts-user", shop_id: "shop-a", role: "parts" },
    ];

    const actor = await authorizeWorkOrderEvidence(
      sessionClient("parts-user"),
      "work-order-a",
    );

    expect(actor).toMatchObject({
      kind: "staff",
      shopId: "shop-a",
      canEdit: false,
    });
  });

  it("requires fleet membership to be anchored to the work-order shop", async () => {
    mocks.rows.profiles = [
      {
        id: "fleet-user",
        shop_id: "shop-b",
        role: "fleet_manager",
      },
    ];
    mocks.rows.fleet_members = [
      {
        user_id: "fleet-user",
        fleet_id: "fleet-a",
        shop_id: "shop-b",
      },
    ];
    mocks.rows.fleet_vehicles = [
      {
        fleet_id: "fleet-a",
        vehicle_id: "vehicle-a",
        shop_id: "shop-b",
      },
    ];

    const actor = await authorizeWorkOrderEvidence(
      sessionClient("fleet-user"),
      "work-order-a",
    );

    expect(actor).toBeNull();
    expect(mocks.filters).toContainEqual({
      table: "fleet_members",
      operation: "eq",
      column: "shop_id",
      value: "shop-a",
    });
  });
});

describe("evidence markup validation", () => {
  it("accepts normalized, bounded overlay elements", () => {
    const overlay: EvidenceAnnotationElement[] = [
      {
        id: "arrow-1",
        type: "arrow",
        color: "#ef4444",
        strokeWidth: 4,
        start: { x: 0.1, y: 0.2 },
        end: { x: 0.7, y: 0.8 },
      },
      {
        id: "label-1",
        type: "text",
        color: "#ffffff",
        x: 0.25,
        y: 0.35,
        text: "Crack",
      },
    ];

    expect(parseAnnotationOverlay(overlay)).toEqual(overlay);
  });

  it("rejects out-of-bounds coordinates, unknown colors, and oversized overlays", () => {
    expect(
      parseAnnotationOverlay([
        {
          id: "bad-arrow",
          type: "arrow",
          color: "#ef4444",
          strokeWidth: 4,
          start: { x: -0.1, y: 0.2 },
          end: { x: 0.7, y: 0.8 },
        },
      ]),
    ).toBeNull();
    expect(
      parseAnnotationOverlay([
        {
          id: "bad-color",
          type: "text",
          color: "#000000",
          x: 0.2,
          y: 0.3,
          text: "Not allowed",
        },
      ]),
    ).toBeNull();
    expect(
      parseAnnotationOverlay(
        Array.from({ length: 101 }, (_, index) => ({
          id: `label-${index}`,
          type: "text",
          color: "#ffffff",
          x: 0.2,
          y: 0.3,
          text: "Bounded",
        })),
      ),
    ).toBeNull();
  });
});

describe("evidence URL safety", () => {
  it("only treats canonical job-photo objects as signable", () => {
    expect(
      isCanonicalEvidenceStorageObject({
        work_order_id: "work-order-a",
        storage_bucket: "job-photos",
        storage_path: "wo/work-order-a/lines/line-a/photo.jpg",
      }),
    ).toBe(true);
    expect(
      isCanonicalEvidenceStorageObject({
        work_order_id: "work-order-a",
        storage_bucket: "private-documents",
        storage_path: "wo/work-order-a/lines/line-a/photo.jpg",
      }),
    ).toBe(false);
    expect(
      isCanonicalEvidenceStorageObject({
        work_order_id: "work-order-a",
        storage_bucket: "job-photos",
        storage_path: "wo/different-work-order/lines/line-a/photo.jpg",
      }),
    ).toBe(false);
  });

  it("rejects unsafe fallback URL schemes", () => {
    expect(sanitizeEvidenceFallbackUrl("https://cdn.example/photo.jpg")).toBe(
      "https://cdn.example/photo.jpg",
    );
    expect(
      sanitizeEvidenceFallbackUrl(
        "/storage/v1/object/public/job-photos/photo.jpg",
      ),
    ).toBe("/storage/v1/object/public/job-photos/photo.jpg");
    expect(sanitizeEvidenceFallbackUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeEvidenceFallbackUrl("not-a-url")).toBeNull();
  });
});

describe("canonical line evidence migration contract", () => {
  const migration = readFileSync(
    "supabase/migrations/20260729140000_canonical_line_evidence_markup.sql",
    "utf8",
  );

  it("registers quote evidence and relinks it when approval materializes a job", () => {
    expect(migration).toContain(
      "quote_line_id uuid references public.work_order_quote_lines",
    );
    expect(migration).toContain("trg_sync_quote_line_media_evidence");
    expect(migration).toContain("update of metadata, work_order_line_id");
    expect(migration).toContain("work_order_line_id = new.work_order_line_id");
    expect(migration).toContain("on conflict (shop_id, quote_line_id, url)");
  });

  it("backfills evidence directly without replaying quote-line update triggers", () => {
    const backfill = migration.slice(
      migration.indexOf("-- Register existing inspection evidence"),
      migration.indexOf(
        "alter table public.work_order_media_annotations enable row level security",
      ),
    );

    expect(backfill).toContain("insert into public.work_order_media");
    expect(backfill).toContain("select distinct");
    expect(backfill).not.toContain("set metadata = metadata");
  });

  it("retires legacy permissive policies and anchors portal access to ownership", () => {
    expect(migration).toContain(
      `drop policy if exists "Users can view their shop's media"`,
    );
    expect(migration).toContain(
      'drop policy if exists "Users can insert their own WO media"',
    );
    expect(migration).toContain("c.shop_id = work_order_media.shop_id");
    expect(migration).toContain("fm.shop_id = work_order_media.shop_id");
    expect(migration).toContain("fm.shop_id = wom.shop_id");
    expect(migration).toContain("user_id = auth.uid()");
  });

  it("keeps annotation writes atomic, tenant-scoped, bounded, and replay-safe", () => {
    const writer = migration.slice(
      migration.indexOf(
        "create or replace function public.save_work_order_media_annotation_atomic",
      ),
      migration.indexOf(
        "revoke all on function public.save_work_order_media_annotation_atomic",
      ),
    );

    expect(writer.indexOf("where id = p_media_id")).toBeLessThan(
      writer.indexOf("where shop_id = v_media.shop_id"),
    );
    expect(writer).toContain("v_existing.media_id <> p_media_id");
    expect(writer).toContain("v_existing.created_by <> v_actor");
    expect(writer).toContain("pg_advisory_xact_lock");
    expect(writer).toContain("v_media.visibility <> 'customer'");
    expect(migration).toContain("jsonb_array_length(overlay) <= 100");
    expect(migration).toContain(
      "revoke all on table public.work_order_media_annotations",
    );
    expect(migration).toContain(
      "grant select on table public.work_order_media_annotations to authenticated",
    );
  });

  it("publishes canonical media and annotations for cross-device refresh", () => {
    expect(migration).toContain("c.relname = 'work_order_media_annotations'");
    expect(migration).toContain(
      "add table public.work_order_media_annotations",
    );
    expect(migration).toContain("c.relname = 'work_order_media'");
    expect(migration).toContain("add table public.work_order_media");
  });
});

describe("premium work-order evidence UI contract", () => {
  const board = readFileSync(
    "features/shared/components/workboard/WorkOrderBoard.tsx",
    "utf8",
  );
  const jobCard = readFileSync(
    "features/work-orders/components/JobCard.tsx",
    "utf8",
  );
  const jobEvidenceStrip = readFileSync(
    "features/work-orders/components/evidence/JobEvidenceStrip.tsx",
    "utf8",
  );
  const workOrder = readFileSync("app/work-orders/[id]/Client.tsx", "utf8");
  const quote = readFileSync(
    "features/portal/app/quotes/[id]/QuotePageClient.tsx",
    "utf8",
  );
  const optionalQuoteEvidence = readFileSync(
    "features/portal/lib/loadOptionalQuoteEvidence.ts",
    "utf8",
  );
  const focusedJob = readFileSync(
    "features/work-orders/components/workorders/FocusedJobModal.tsx",
    "utf8",
  );
  const mobileFocusedJob = readFileSync(
    "features/work-orders/mobile/MobileFocusedJob.tsx",
    "utf8",
  );

  it("keeps the dashboard work-order board on its color-coded stage cards", () => {
    expect(board).toContain("function BoardCard");
    expect(board).toContain("visibleStages.map");
    expect(board).toContain("getWorkOrderBoardStageSurface");
    expect(board).not.toContain("function BoardRow");
    expect(board).not.toContain("<span>Operational state</span>");
  });

  it("removes job priority and moves line evidence and technician identity into the card", () => {
    expect(jobCard).not.toContain("onPriorityChange");
    expect(workOrder).not.toContain("updateLinePriority");
    expect(jobCard).toContain("Assigned technician");
    expect(jobCard).toContain("<JobEvidenceStrip evidence={evidence} />");
    expect(jobEvidenceStrip).toContain("evidence.slice(0, 3)");
    expect(jobEvidenceStrip).toContain("Open ${evidenceLabel(item, index)}");
    expect(workOrder).toContain("item.workOrderLineId === ln.id");
  });

  it("scopes focused-job galleries to the active line and retains unassigned media", () => {
    expect(focusedJob).toContain("workOrderLineId={workOrderLineId}");
    expect(mobileFocusedJob).toContain("workOrderLineId={workOrderLineId}");
    expect(workOrder).toContain('scope="unassigned"');
    expect(workOrder).toContain("lineOptions={sortedLines.map");
  });

  it("shows canonical line evidence in customer and fleet portal experiences", () => {
    expect(quote).toContain("loadOptionalQuoteEvidence");
    expect(optionalQuoteEvidence).toContain(
      "/api/work-orders/${workOrderId}/media?scope=all",
    );
    expect(quote).toContain("item.quoteLineId === line.id");
    expect(quote).toContain("EvidenceImage");
    expect(
      readFileSync(
        "features/fleet/components/FleetUnitWorkOrderEvidence.tsx",
        "utf8",
      ),
    ).toContain("item.workOrderLineId === line.id");
  });
});
