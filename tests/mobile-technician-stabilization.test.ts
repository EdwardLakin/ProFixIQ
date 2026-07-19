import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260719090000_mobile_technician_stabilization.sql",
  "utf8",
);
const signRoute = readFileSync(
  "app/api/inspections/sign/route.ts",
  "utf8",
);
const signaturePanel = readFileSync(
  "features/inspections/components/inspection/InspectionSignaturePanel.tsx",
  "utf8",
);
const mobileJobPage = readFileSync(
  "app/mobile/jobs/[lineId]/page.tsx",
  "utf8",
);
const mobilePartsPage = readFileSync(
  "app/mobile/parts/page.tsx",
  "utf8",
);
const mobilePartsWorkflow = readFileSync(
  "features/parts/mobile/MobilePartsWorkflow.tsx",
  "utf8",
);

describe("mobile technician stabilization", () => {
  it("resolves pgcrypto from the Supabase extensions schema", () => {
    expect(migration).toContain(
      "create extension if not exists pgcrypto with schema extensions",
    );
    expect(migration).toContain(
      "alter function public.record_offline_photo_receipt_atomic",
    );
    expect(migration.match(/set search_path = public, extensions/g)?.length).toBe(
      3,
    );
  });

  it("saves inspection progress without relying on missing line uniqueness", () => {
    expect(migration).toContain(
      "create or replace function public.save_inspection_progress_atomic",
    );
    expect(migration).toContain("from public.inspection_sessions s");
    expect(migration).toContain("where id = v_session_id");
    expect(migration).toContain("where id = v_inspection_id");
    expect(migration).not.toContain("on conflict (work_order_line_id)");
    expect(migration).toContain("Inspection is finalized and locked");
  });

  it("anchors a mobile inspection before signing instead of inserting a bare row", () => {
    expect(signRoute).toContain("resolveInspectionForSigning");
    expect(signRoute).toContain("work_order_line_id: canonicalLineId");
    expect(signRoute).toContain("work_order_id: canonicalWorkOrderId");
    expect(signRoute).not.toContain(
      "Unable to auto-create inspection before signing",
    );
    expect(signRoute).not.toContain(".upsert(");
    expect(signaturePanel).toContain(
      "workOrderLineId: resolvedWorkOrderLineId",
    );
    expect(signaturePanel).toContain(
      'sessionStorage.getItem("inspection:params")',
    );
  });

  it("exposes cause and correction independently from the finish button", () => {
    expect(mobileJobPage).toContain("Cause / Correction");
    expect(mobileJobPage).toContain("save_story_draft");
    expect(mobileJobPage).toContain("CauseCorrectionModal");
  });

  it("replaces the mobile parts placeholder with actionable parts commands", () => {
    expect(mobilePartsPage).toContain("MobilePartsWorkflow");
    expect(mobilePartsWorkflow).toContain("part_request_items");
    expect(mobilePartsWorkflow).toContain("/receive");
    expect(mobilePartsWorkflow).toContain("/allocate");
    expect(mobilePartsWorkflow).toContain("Open parts workbench");
    expect(mobilePartsPage).not.toContain("Mobile parts rollout");
  });
});
