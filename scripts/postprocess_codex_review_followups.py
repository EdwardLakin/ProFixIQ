from __future__ import annotations

import re
from pathlib import Path


inventory = Path("app/api/parts/requests/items/[itemId]/inventory/route.ts")
text = inventory.read_text(encoding="utf-8")
text = text.replace(
    '  const value = typeof body[key] === "number" ? body[key] : Number(body[key]);',
    '  const raw = body[key];\n  const value = typeof raw === "number" ? raw : Number(raw);',
)
inventory.write_text(text, encoding="utf-8")

fleet = Path("features/fleet/components/FleetServiceRequestsPage.tsx")
text = fleet.read_text(encoding="utf-8")
text = re.sub(
    r'type ConvertPayload = \{\n  workOrderId\?: string;\n  error\?: string;\n\};\n\n',
    "",
    text,
    count=1,
)
fleet.write_text(text, encoding="utf-8")

mobile = Path("features/work-orders/mobile/MobileFocusedJob.tsx")
text = mobile.read_text(encoding="utf-8").replace(
    'cached.line.technician_notes ?? ""',
    '(cached.line as WorkOrderLine).technician_notes ?? ""',
)
mobile.write_text(text, encoding="utf-8")

Path("tests/fleet-service-request-conversion-action.test.ts").write_text(
    '''import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { convertFleetServiceRequest } from "@/features/fleet/lib/convertFleetServiceRequest";

const componentPath =
  "features/fleet/components/FleetServiceRequestsPage.tsx";

describe("fleet service-request conversion action", () => {
  it("shows conversion only for internal actors with the exact capability and an open request", () => {
    const source = readFileSync(componentPath, "utf8");
    expect(source).toContain('routePrefix === "/fleet"');
    expect(source).toContain("uiContext.isInternal");
    expect(source).toContain(
      "uiContext.capabilities.canConvertServiceRequestToWorkOrder",
    );
    expect(source).toContain('item.status === "open"');
    expect(source).toContain("Create work order");
  });

  it("posts the request id and returns the resulting work order", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workOrderId: "work-order-1" }),
    });

    await expect(
      convertFleetServiceRequest("service-request-1", fetchMock as never),
    ).resolves.toBe("work-order-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fleet/service-requests/convert-to-work-order",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ serviceRequestId: "service-request-1" }),
      }),
    );
  });

  it("surfaces API failures instead of navigating", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Request is not convertible" }),
    });

    await expect(
      convertFleetServiceRequest("service-request-1", fetchMock as never),
    ).rejects.toThrow("Request is not convertible");
  });
});
''',
    encoding="utf-8",
)

Path("tests/set-password-shell-transition.test.ts").write_text(
    '''import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  activatePasswordProfile,
  PASSWORD_ACTIVATION_RETRY_MESSAGE,
} from "@/features/auth/lib/passwordActivation";

const pagePath = "app/auth/set-password/page.tsx";
const helperPath = "features/auth/lib/passwordActivation.ts";

describe("set-password shell transition", () => {
  it("performs a document navigation so the protected app shell is rebuilt", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toContain("window.location.replace(redirect)");
    expect(source).not.toContain("router.replace(redirect)");
    expect(source).not.toContain("router.push(redirect)");
  });

  it("treats credential success and profile activation as separate stages", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toContain("passwordCommitted");
    expect(source).toContain("activatePasswordProfile");
    expect(source).toContain("Retry account activation");
    expect(source).toContain('setPassword("")');
    expect(source).toContain('setConfirmPassword("")');
  });

  it("keeps database details internal and presents a safe retry message", async () => {
    const eq = vi.fn().mockResolvedValue({
      error: { message: "raw postgres policy detail" },
    });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));

    const result = await activatePasswordProfile(
      { from } as never,
      "profile-id",
    );

    expect(result).toEqual({
      ok: false,
      userMessage: PASSWORD_ACTIVATION_RETRY_MESSAGE,
      detail: "raw postgres policy detail",
    });
    expect(PASSWORD_ACTIVATION_RETRY_MESSAGE).not.toContain("postgres");
    expect(readFileSync(helperPath, "utf8")).toContain(
      "PASSWORD_ACTIVATION_RETRY_MESSAGE",
    );
  });
});
''',
    encoding="utf-8",
)

Path("tests/mobile-active-approved-notes.test.ts").write_text(
    '''import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobilePath = "features/work-orders/mobile/MobileFocusedJob.tsx";
const originalMigrationPath =
  "supabase/migrations/20260804055000_allow_active_approved_job_notes.sql";
const hardeningMigrationPath =
  "supabase/migrations/20260804120000_codex_review_followup_hardening.sql";

describe("mobile technician notes on active approved jobs", () => {
  it("keeps the mobile editor available for active approved work", () => {
    const source = readFileSync(mobilePath, "utf8");
    expect(source).toContain("technician_notes");
    expect(source).toContain("saveTechNotes");
    expect(source).toContain('actionType: "update_work_order_line_notes"');
    expect(source).toContain('line.status !== "completed"');
    expect(source).toContain('line.approval_state !== "approved"');
  });

  it("preserves the original permission repair and supersedes it with active-state and void guards", () => {
    const original = readFileSync(originalMigrationPath, "utf8");
    const hardening = readFileSync(hardeningMigrationPath, "utf8");

    expect(original).toContain(
      "create or replace function public.apply_offline_line_mutation_atomic",
    );
    expect(hardening).toContain("v_line.voided_at is not null");
    expect(hardening).toContain("Work-order line is not active.");
    expect(hardening).toContain("technician_notes");
    expect(hardening).toContain("OFFLINE_VERSION_CONFLICT");
    expect(hardening).toContain("Actor is not assigned to this work-order line.");
    expect(hardening).toContain("offline_mutation_receipts");
  });
});
''',
    encoding="utf-8",
)

Path("tests/job-finish-punchout-order.test.ts").write_text(
    '''import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const originalMigrationPath =
  "supabase/migrations/20260804070000_complete_job_with_punchout_atomic.sql";
const hardeningMigrationPath =
  "supabase/migrations/20260804120000_codex_review_followup_hardening.sql";

describe("job completion punch-out ordering", () => {
  it("writes a non-null punch-out in the same update that completes the line", () => {
    const migration = readFileSync(originalMigrationPath, "utf8");
    const completionUpdate = migration.indexOf(
      "update public.work_order_lines\n    set status = 'completed'",
    );
    const punchOut = migration.indexOf(
      "punched_out_at = coalesce(",
      completionUpdate,
    );
    const inspectionFinalize = migration.indexOf(
      "update public.inspections",
      completionUpdate,
    );

    expect(completionUpdate).toBeGreaterThanOrEqual(0);
    expect(punchOut).toBeGreaterThan(completionUpdate);
    expect(inspectionFinalize).toBeGreaterThan(punchOut);
    expect(migration).toContain(
      "when v_action = 'finish' then coalesce(v_latest, punched_out_at, v_now)",
    );
  });

  it("rejects shared-line completion while another technician remains active", () => {
    const hardening = readFileSync(hardeningMigrationPath, "utf8");
    expect(hardening).toContain("OTHER_TECHNICIANS_STILL_PUNCHED_IN");
    expect(hardening).toContain("segment.ended_at is null");
    expect(hardening).toContain(
      "new.punched_in_at := null;\n    new.punched_out_at := null;",
    );
  });
});
''',
    encoding="utf-8",
)

# Avoid enum/text comparison failures when terminal fleet status vocabularies
# differ across runtime and clean-replay schemas.
migration = Path(
    "supabase/migrations/20260804120000_codex_review_followup_hardening.sql",
)
text = migration.read_text(encoding="utf-8").replace(
    "if old.status in ('completed','closed','cancelled','declined','rejected')",
    "if old.status::text in ('completed','closed','cancelled','declined','rejected')",
)
migration.write_text(text, encoding="utf-8")

Path(__file__).unlink(missing_ok=True)
