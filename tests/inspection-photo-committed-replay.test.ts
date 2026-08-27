import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAuthenticatedStaffProfileMock = vi.hoisted(() => vi.fn());
const resolveCurrentWorkspaceCapabilitiesMock = vi.hoisted(() => vi.fn());
const createAdminSupabaseMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  resolveAuthenticatedStaffProfile: resolveAuthenticatedStaffProfileMock,
}));

vi.mock(
  "@/features/workspace/authorization/server/resolveWorkspaceCapabilities",
  () => ({
    resolveCurrentWorkspaceCapabilities:
      resolveCurrentWorkspaceCapabilitiesMock,
  }),
);

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
  createServerSupabaseRoute: vi.fn(),
}));

import { authorizeInspectionMutation } from "@/features/inspections/server/authorizeInspectionMutation";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const REPLACEMENT_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const SHOP_ID = "44444444-4444-4444-8444-444444444444";
const WORK_ORDER_ID = "55555555-5555-4555-8555-555555555555";
const LINE_ID = "66666666-6666-4666-8666-666666666666";
const INSPECTION_ID = "77777777-7777-4777-8777-777777777777";
const MEDIA_ID = "88888888-8888-4888-8888-888888888888";
const PHOTO_ID = "99999999-9999-4999-8999-999999999999";
const CLIENT_MUTATION_ID = `ip-${"a".repeat(40)}`;
const STORAGE_PATH =
  `wo/${WORK_ORDER_ID}/lines/${LINE_ID}/` +
  `${CLIENT_MUTATION_ID}_${"b".repeat(32)}.jpg`;

type QueryResult = { data: unknown; error: null };

function sessionClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: AUTH_USER_ID } },
        error: null,
      }),
    },
  };
}

function query(result: QueryResult) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "in"]) {
    builder[method] = vi.fn(() => builder);
  }
  for (const terminal of ["maybeSingle", "limit", "order"]) {
    builder[terminal] = vi.fn().mockResolvedValue(result);
  }
  return builder;
}

function capabilityResult(granted: boolean) {
  return {
    capabilities: {
      [WORKSPACE_CAPABILITIES.runWorkOrderInspections]: {
        capabilityKey: WORKSPACE_CAPABILITIES.runWorkOrderInspections,
        accessLevel: "write",
        granted,
        source: granted ? "role_preset" : "individual_override",
      },
    },
    error: null,
  };
}

function adminClient(options?: { media?: boolean; photo?: boolean }) {
  const queries = new Map<string, ReturnType<typeof query>>();
  const rows: Record<string, QueryResult> = {
    work_order_lines: {
      data: {
        id: LINE_ID,
        work_order_id: WORK_ORDER_ID,
        assigned_tech_id: REPLACEMENT_PROFILE_ID,
        assigned_to: null,
      },
      error: null,
    },
    work_orders: { data: { id: WORK_ORDER_ID }, error: null },
    work_order_line_technicians: { data: [], error: null },
    inspections: { data: { id: INSPECTION_ID }, error: null },
    work_order_media: {
      data: options?.media === false ? null : { id: MEDIA_ID },
      error: null,
    },
    inspection_photos: {
      data:
        options?.photo === false
          ? []
          : [
              {
                id: PHOTO_ID,
                image_url: `/storage/v1/object/public/job-photos/${STORAGE_PATH}`,
                item_name: "Brake hose",
                user_id: AUTH_USER_ID,
              },
            ],
      error: null,
    },
  };

  const client = {
    from: vi.fn((table: string) => {
      const builder = query(rows[table] ?? { data: null, error: null });
      queries.set(table, builder);
      return builder;
    }),
  };
  return { client, queries };
}

const replay = {
  inspectionId: INSPECTION_ID,
  storageBucket: "job-photos" as const,
  storagePath: STORAGE_PATH,
  clientMutationId: CLIENT_MUTATION_ID,
};

describe("inspection committed-photo replay authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthenticatedStaffProfileMock.mockResolvedValue({
      profile: {
        id: PROFILE_ID,
        user_id: AUTH_USER_ID,
        shop_id: SHOP_ID,
        role: "mechanic",
      },
      error: null,
    });
    resolveCurrentWorkspaceCapabilitiesMock.mockResolvedValue(
      capabilityResult(true),
    );
  });

  it("recovers an exact same-actor receipt after line reassignment", async () => {
    const { client, queries } = adminClient();
    createAdminSupabaseMock.mockReturnValue(client);

    const result = await authorizeInspectionMutation({
      sessionClient: sessionClient() as never,
      shopId: SHOP_ID,
      workOrderId: WORK_ORDER_ID,
      workOrderLineId: LINE_ID,
      committedPhotoReplay: replay,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replay).toEqual({
        kind: "photo",
        inspectionId: INSPECTION_ID,
        storageBucket: "job-photos",
        storagePath: STORAGE_PATH,
        photo: {
          id: PHOTO_ID,
          image_url: `/storage/v1/object/public/job-photos/${STORAGE_PATH}`,
          item_name: "Brake hose",
        },
      });
    }
    expect(queries.get("work_order_media")?.eq).toHaveBeenCalledWith(
      "user_id",
      AUTH_USER_ID,
    );
    expect(queries.get("inspection_photos")?.eq).toHaveBeenCalledWith(
      "user_id",
      AUTH_USER_ID,
    );
  });

  it("denies a fresh or only partially committed upload after reassignment", async () => {
    const { client } = adminClient({ photo: false });
    createAdminSupabaseMock.mockReturnValue(client);

    const result = await authorizeInspectionMutation({
      sessionClient: sessionClient() as never,
      shopId: SHOP_ID,
      workOrderId: WORK_ORDER_ID,
      workOrderLineId: LINE_ID,
      committedPhotoReplay: replay,
    });

    expect(result).toEqual({
      ok: false,
      error: "Inspection work is limited to the assigned technician.",
      status: 403,
    });
  });

  it("does not let a committed receipt bypass a current capability deny", async () => {
    resolveCurrentWorkspaceCapabilitiesMock.mockResolvedValue(
      capabilityResult(false),
    );

    const result = await authorizeInspectionMutation({
      sessionClient: sessionClient() as never,
      shopId: SHOP_ID,
      workOrderId: WORK_ORDER_ID,
      workOrderLineId: LINE_ID,
      committedPhotoReplay: replay,
    });

    expect(result).toEqual({
      ok: false,
      error: "Inspection capability is required.",
      status: 403,
    });
    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });
});
