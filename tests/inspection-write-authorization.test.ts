import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20260825213000_enforce_inspection_write_capability.sql",
);
const saveRoute = source("app/api/inspections/save/route.ts");
const signRoute = source("app/api/inspections/sign/route.ts");
const reopenRoute = source("app/api/inspections/reopen/route.ts");
const photoUploadRoute = source("app/api/inspections/photos/upload/route.ts");
const finalizePdfRoute = source("app/api/inspections/finalize/pdf/route.ts");
const inspectionImportRoute = source(
  "app/api/work-orders/import-from-inspection/route.ts",
);
const inspectionMutationAuthorization = source(
  "features/inspections/server/authorizeInspectionMutation.ts",
);
const createWorkOrderPage = source(
  "features/work-orders/app/work-orders/create/page.tsx",
);
const assistantInspections = source(
  "features/shop-assistant/server/tools/domains/inspections.ts",
);
const capabilityContract = source(
  "features/workspace/authorization/capabilities.ts",
);
const workOrderClient = source("app/work-orders/[id]/Client.tsx");
const mobileWorkOrderClient = source(
  "features/work-orders/mobile/MobileWorkOrderClient.tsx",
);
const runtime = source(
  "tests/security/inspection-write-authorization.runtime.sql",
);
const concurrencyRuntime = source(
  "tests/security/inspection-write-authorization-concurrency.runtime.sh",
);
const photoConcurrencyRuntime = source(
  "tests/security/inspection-photo-upload-authorization-concurrency.runtime.sh",
);
const cleanReplayWorkflow = source(
  ".github/workflows/supabase-clean-replay-audit.yml",
);

describe("inspection write authorization", () => {
  it("registers established inspection roles in the grantable capability model", () => {
    expect(migration).toContain("'work_order.inspection.run'");
    for (const role of [
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
      "mechanic",
      "lead_hand",
      "foreman",
    ]) {
      expect(migration).toContain(
        `('work_order.inspection.run', '${role}', 'allow')`,
      );
    }
    expect(migration).not.toContain(
      "('work_order.inspection.run', 'parts', 'allow')",
    );
    expect(capabilityContract).toContain(
      'runWorkOrderInspections: "work_order.inspection.run"',
    );
  });

  it("keeps all public signatures stable while making the implementation private", () => {
    expect(migration).toContain(
      "alter function public.save_inspection_progress_v3_atomic(",
    );
    expect(migration).toContain("rename to save_inspection_progress_v3_core");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role;",
    );
    expect(
      migration.match(/select public\.save_inspection_progress_v3_atomic\(/g),
    ).toHaveLength(2);
    expect(runtime).toContain(
      "A Data API role can execute the private inspection core.",
    );
    expect(migration).toContain("rename to sign_inspection_core");
    expect(migration).toContain("rename to reopen_inspection_core");
    expect(migration).toContain(
      "rename to import_inspection_quote_package_core",
    );
    expect(migration).toContain("rename to finalize_inspection_pdf_core");
    expect(migration).toContain(
      "rename to shop_assistant_reopen_inspection_core",
    );
    for (const core of [
      "save_inspection_progress_v3_core",
      "sign_inspection_core",
      "reopen_inspection_core",
      "import_inspection_quote_package_core",
      "shop_assistant_reopen_inspection_core",
    ]) {
      const coreConfiguration = migration.slice(
        migration.indexOf(`alter function private.${core}(`),
        migration.indexOf(`revoke all on function private.${core}(`),
      );
      expect(coreConfiguration).toContain("set search_path to '';");
    }
    expect(
      migration.slice(
        migration.indexOf(
          "create or replace function private.finalize_inspection_pdf_core(",
        ),
        migration.indexOf(
          "revoke all on function private.finalize_inspection_pdf_core(",
        ),
      ),
    ).toContain("set search_path = ''");
    expect(runtime).toContain(
      "A Data API role can execute a private inspection lifecycle core.",
    );
    expect(runtime).toContain(
      "Private inspection core has a non-empty search path",
    );
  });

  it("authorizes before invoking the receipt-bearing core", () => {
    const capabilityCheck = migration.indexOf(
      "from private.resolve_workspace_profile_capability(",
    );
    const assignmentCheck = migration.indexOf("if v_actor_role = 'mechanic'");
    const receiptCheck = migration.indexOf(
      "from public.mobile_operation_keys receipt",
    );
    const coreCall = migration.indexOf(
      "return private.save_inspection_progress_v3_core(",
    );

    expect(capabilityCheck).toBeGreaterThan(0);
    expect(receiptCheck).toBeGreaterThan(capabilityCheck);
    expect(assignmentCheck).toBeGreaterThan(receiptCheck);
    expect(coreCall).toBeGreaterThan(assignmentCheck);
    expect(migration).toContain("profile.user_id = v_auth_user_id");
    expect(migration).toContain("line.assigned_tech_id in (");
    expect(migration).toContain("assignment.technician_id in (");
    expect(runtime).toContain(
      "Unauthorized actor replayed an authorized inspection receipt.",
    );
    expect(runtime).toContain(
      "Service role bypassed the supplied Parts actor capability.",
    );
    expect(runtime).toContain(
      "Committed inspection receipt was lost after reassignment",
    );
    expect(runtime).toMatch(
      /response-loss retry[\s\S]*?select set_config\('request\.jwt\.claims', '\{"role":"service_role"\}', true\);[\s\S]*?update public\.work_order_lines/,
    );
    expect(runtime).toMatch(
      /\$inspection_reassigned_receipt\$;[\s\S]*?reset role;[\s\S]*?select set_config\('request\.jwt\.claims', '\{"role":"service_role"\}', true\);[\s\S]*?update public\.work_order_lines/,
    );
    expect(runtime).toContain(
      "Reassigned mechanic created fresh inspection progress.",
    );
    expect(migration.indexOf("pg_catalog.pg_advisory_xact_lock(")).toBeLessThan(
      receiptCheck,
    );
    expect(migration).toContain(
      "p_shop_id::text || ':save_inspection_progress:' || p_operation_key",
    );
    const saveWrapper = migration.slice(
      migration.indexOf(
        "create or replace function public.save_inspection_progress_v3_atomic(",
      ),
      migration.indexOf(
        "create or replace function public.save_inspection_progress_v2_atomic(",
      ),
    );
    const saveReceipt = saveWrapper.indexOf(
      "from public.mobile_operation_keys receipt",
    );
    const saveWorkOrderLock = saveWrapper.indexOf(
      "from public.work_orders work_order",
    );
    const saveInspectionLock = saveWrapper.indexOf(
      "from public.inspections inspection",
    );
    const saveLineLock = saveWrapper.lastIndexOf(
      "from public.work_order_lines line",
    );
    expect(saveWorkOrderLock).toBeGreaterThan(saveReceipt);
    expect(saveInspectionLock).toBeGreaterThan(saveWorkOrderLock);
    expect(saveLineLock).toBeGreaterThan(saveInspectionLock);

    const signWrapper = migration.slice(
      migration.indexOf("create or replace function public.sign_inspection("),
      migration.indexOf("comment on function public.sign_inspection("),
    );
    expect(
      signWrapper.indexOf("from public.work_orders work_order"),
    ).toBeLessThan(
      signWrapper.lastIndexOf("from public.inspections inspection"),
    );
    expect(
      signWrapper.lastIndexOf("from public.inspections inspection"),
    ).toBeLessThan(signWrapper.indexOf("from public.work_order_lines line"));
    expect(concurrencyRuntime).toContain("activity.wait_event = 'advisory'");
    expect(concurrencyRuntime).toContain(
      "Concurrent inspection save applied the snapshot more than once.",
    );
    expect(cleanReplayWorkflow).toContain(
      "bash tests/security/inspection-write-authorization-concurrency.runtime.sh",
    );
  });

  it("binds import, PDF finalization, and Assistant replay before private cores", () => {
    const importWrapper = migration.slice(
      migration.indexOf(
        "create or replace function public.import_inspection_quote_package_atomic(",
      ),
      migration.indexOf(
        "comment on function public.import_inspection_quote_package_atomic(",
      ),
    );
    const importCapability = importWrapper.indexOf(
      "from private.resolve_workspace_profile_capability(",
    );
    const importAdvisoryLock = importWrapper.indexOf(
      "p_shop_id::text || ':inspection_quote_import:' || p_operation_key",
    );
    const workOrderLock = importWrapper.indexOf(
      "from public.work_orders work_order",
    );
    const inspectionLock = importWrapper.indexOf(
      "from public.inspections inspection",
    );
    const lineLock = importWrapper.indexOf("from public.work_order_lines line");
    const importReceipt = importWrapper.indexOf(
      "from public.quote_lifecycle_operation_keys receipt",
    );
    const importAssignment = importWrapper.indexOf(
      "if v_actor_role = 'mechanic'",
    );
    const importCore = importWrapper.indexOf(
      "return private.import_inspection_quote_package_core(",
    );

    expect(importCapability).toBeGreaterThan(0);
    expect(importAdvisoryLock).toBeGreaterThan(importCapability);
    expect(workOrderLock).toBeGreaterThan(importCapability);
    expect(workOrderLock).toBeGreaterThan(importAdvisoryLock);
    expect(inspectionLock).toBeGreaterThan(workOrderLock);
    expect(lineLock).toBeGreaterThan(inspectionLock);
    expect(importReceipt).toBeGreaterThan(lineLock);
    expect(importAssignment).toBeGreaterThan(importReceipt);
    expect(importCore).toBeGreaterThan(importAssignment);
    expect(importWrapper).toContain(
      "Inspection import operation key belongs to a different actor, work order, or source line.",
    );
    expect(importWrapper).toContain(
      "v_core_actor_user_id := v_actor_linked_user_id",
    );
    expect(importWrapper).toContain("from auth.users auth_user");
    expect(importWrapper).toContain(
      "v_receipt_actor_user_id is not distinct from v_core_actor_user_id",
    );
    expect(importWrapper).toContain("set actor_user_id = v_core_actor_user_id");
    expect(importWrapper).toContain(
      "p_requested_vehicle_id,\n    v_core_actor_user_id,",
    );

    const finalizeWrapper = migration.slice(
      migration.indexOf(
        "create or replace function public.finalize_inspection_pdf_atomic(",
      ),
      migration.indexOf(
        "comment on function public.finalize_inspection_pdf_atomic(",
      ),
    );
    expect(finalizeWrapper).toContain("if not v_is_service_role then");
    expect(finalizeWrapper).toContain(
      "from private.resolve_workspace_profile_capability(",
    );
    expect(finalizeWrapper).toContain("for update;");
    expect(finalizeWrapper).toContain(
      "inspection.work_order_line_id = p_work_order_line_id",
    );
    expect(
      finalizeWrapper.indexOf("if v_actor_role = 'mechanic'"),
    ).toBeLessThan(
      finalizeWrapper.indexOf("return private.finalize_inspection_pdf_core("),
    );

    const assistantWrapper = migration.slice(
      migration.indexOf(
        "create or replace function public.shop_assistant_reopen_inspection_atomic(",
      ),
      migration.indexOf(
        "comment on function public.shop_assistant_reopen_inspection_atomic(",
      ),
    );
    expect(assistantWrapper).toContain("if not v_is_service_role then");
    expect(assistantWrapper).toContain(
      "if coalesce(v_actor_role, '') not in ('owner', 'admin', 'manager', 'advisor') then",
    );
    expect(
      assistantWrapper.indexOf("profile.shop_id = p_shop_id"),
    ).toBeLessThan(
      assistantWrapper.indexOf(
        "from private.resolve_workspace_profile_capability(",
      ),
    );
    expect(
      assistantWrapper.indexOf(
        "from private.resolve_workspace_profile_capability(",
      ),
    ).toBeLessThan(
      assistantWrapper.indexOf(
        "return private.shop_assistant_reopen_inspection_core(",
      ),
    );
    expect(
      assistantWrapper.indexOf(
        "if coalesce(v_actor_role, '') not in ('owner', 'admin', 'manager', 'advisor') then",
      ),
    ).toBeLessThan(
      assistantWrapper.indexOf(
        "return private.shop_assistant_reopen_inspection_core(",
      ),
    );

    for (const proof of [
      "Imported profile alias wrote a non-canonical inspection audit actor.",
      "Linked auth subject did not recover its profile-alias receipt",
      "Unauthorized actor replayed an inspection import receipt.",
      "Unassigned mechanic imported inspection findings.",
      "Service role finalized an inspection for a denied actor.",
      "Imported finalization profile was not mapped to its auth subject.",
      "Denied Assistant actor replayed a completed inspection reopen action.",
      "Preset-capable service Assistant role replayed a completed inspection reopen action.",
      "Preset-capable foreman Assistant role replayed a completed inspection reopen action.",
    ]) {
      expect(runtime).toContain(proof);
    }
  });

  it("returns authorization failures as forbidden and presents the effective capability", () => {
    expect(saveRoute).toContain('error.code === "42501"');
    expect(saveRoute).toContain("? 403");
    expect(workOrderClient).toContain(
      "WORKSPACE_CAPABILITIES.runWorkOrderInspections",
    );
    expect(workOrderClient).not.toContain(
      "canRunInspections: currentActor.canRunInspections",
    );
    expect(workOrderClient).toContain("canRunInspectionForLine(ln)");
    expect(workOrderClient).toContain("canRunInspectionForLine(panelLine)");
    expect(mobileWorkOrderClient).toContain(
      "WORKSPACE_CAPABILITIES.runWorkOrderInspections",
    );
    expect(mobileWorkOrderClient).toContain(
      "const canRunLineInspection = canRunInspectionForLine(ln)",
    );
    expect(mobileWorkOrderClient).toContain("inspectionAccessError");
    expect(createWorkOrderPage).toContain("useWorkspaceCapabilities()");
    expect(createWorkOrderPage).toContain(
      "WORKSPACE_CAPABILITIES.runWorkOrderInspections",
    );
    expect(createWorkOrderPage).toContain('ln.job_type === "inspection" &&');
    expect(createWorkOrderPage).toContain("canRunWorkOrderInspections &&");
  });

  it("gates every canonical inspection mutation before privileged side effects", () => {
    for (const route of [
      signRoute,
      reopenRoute,
      photoUploadRoute,
      finalizePdfRoute,
      inspectionImportRoute,
    ]) {
      expect(route).toContain("authorizeInspectionMutation({");
    }

    expect(inspectionMutationAuthorization).toContain(
      "resolveAuthenticatedStaffProfile",
    );
    expect(inspectionMutationAuthorization).toContain(
      "WORKSPACE_CAPABILITIES.runWorkOrderInspections",
    );
    expect(inspectionMutationAuthorization).toContain(
      'canonicalRole === "mechanic"',
    );
    expect(inspectionMutationAuthorization).toContain(
      'from("work_order_line_technicians")',
    );
    expect(signRoute.indexOf("authorizeInspectionMutation({")).toBeLessThan(
      signRoute.indexOf("insertPrioritizedJobsFromInspection({"),
    );
    expect(
      photoUploadRoute.indexOf("authorizeInspectionMutation({"),
    ).toBeLessThan(photoUploadRoute.indexOf("file.arrayBuffer()"));
    expect(
      finalizePdfRoute.indexOf("authorizeInspectionMutation({"),
    ).toBeLessThan(finalizePdfRoute.indexOf("publishInspectionPdf({"));
    expect(inspectionImportRoute).toContain(
      "resolveAuthenticatedStaffProfile(supabase, user.id)",
    );
    expect(inspectionImportRoute).toContain(
      "workOrderLineId: inspection.work_order_line_id",
    );
    expect(
      inspectionImportRoute.indexOf("authorizeInspectionMutation({"),
    ).toBeLessThan(
      inspectionImportRoute.indexOf("insertPrioritizedJobsFromInspection({"),
    );
    expect(inspectionImportRoute).toContain(
      "userId: authorization.actor.authUserId",
    );
    expect(assistantInspections).toContain("async authorize(_input, context)");
    expect(assistantInspections).toContain(
      "WORKSPACE_CAPABILITIES.runWorkOrderInspections",
    );
  });

  it("revalidates Work Order photo authority at both durable evidence writes", () => {
    const photoAuthorizer = migration.slice(
      migration.indexOf(
        "create or replace function private.authorize_work_order_inspection_photo_write(",
      ),
      migration.indexOf(
        "create or replace function private.work_order_inspection_photo_storage_insert_access(",
      ),
    );
    const workOrderLock = photoAuthorizer.indexOf(
      "from public.work_orders work_order",
    );
    const inspectionLock = photoAuthorizer.indexOf(
      "from public.inspections inspection",
    );
    const lineLock = photoAuthorizer.indexOf(
      "from public.work_order_lines line",
    );
    const profileLock = photoAuthorizer.indexOf("from public.profiles profile");
    const capabilityDecision = photoAuthorizer.indexOf(
      "from private.resolve_workspace_profile_capability(",
    );

    expect(photoAuthorizer).toContain("language plpgsql\nvolatile");
    expect(photoAuthorizer).toContain(
      "'workspace-authorization:' || p_shop_id::text || ':work_order.inspection.run'",
    );
    expect(workOrderLock).toBeGreaterThan(0);
    expect(inspectionLock).toBeGreaterThan(workOrderLock);
    expect(lineLock).toBeGreaterThan(inspectionLock);
    expect(profileLock).toBeGreaterThan(lineLock);
    expect(capabilityDecision).toBeGreaterThan(profileLock);
    expect(photoAuthorizer).not.toContain("for key share;");
    expect(photoAuthorizer).toContain("if v_actor_role = 'mechanic'");
    expect(photoAuthorizer).toContain("assignment.technician_id in (");

    expect(migration).toContain(
      "create policy job_photos_inspection_photo_insert",
    );
    expect(migration).toContain("as permissive\nfor insert");
    expect(migration).toContain(
      "create policy job_photos_inspection_photo_insert_boundary",
    );
    expect(migration).toContain("as restrictive\nfor insert");
    expect(migration).toContain("ip-[0-9a-f]{40}_[0-9a-f]{32}\\.(jpg|png)");
    expect(migration).toContain(
      "grant execute on function private.work_order_inspection_photo_storage_insert_access(",
    );
    expect(migration).toContain(
      "grant execute on function public.save_work_order_inspection_photo_evidence_atomic(",
    );
    expect(migration).toContain(
      ") from public, anon, authenticated, service_role;",
    );

    const atomicPhotoWriter = migration.slice(
      migration.indexOf(
        "create or replace function public.save_work_order_inspection_photo_evidence_atomic(",
      ),
      migration.indexOf(
        "comment on function public.save_work_order_inspection_photo_evidence_atomic(",
      ),
    );
    const atomicAuthorization = atomicPhotoWriter.indexOf(
      "private.authorize_work_order_inspection_photo_write(",
    );
    const objectReceipt = atomicPhotoWriter.indexOf(
      "from storage.objects object",
    );
    const mediaReceipt = atomicPhotoWriter.indexOf(
      "from public.work_order_media media",
    );
    const photoReceipt = atomicPhotoWriter.indexOf(
      "from public.inspection_photos photo",
    );
    expect(atomicAuthorization).toBeGreaterThan(0);
    expect(objectReceipt).toBeGreaterThan(atomicAuthorization);
    expect(mediaReceipt).toBeGreaterThan(objectReceipt);
    expect(photoReceipt).toBeGreaterThan(mediaReceipt);
    expect(atomicPhotoWriter).toContain(
      "'/storage/v1/object/sign/job-photos/' || p_storage_path",
    );

    expect(photoUploadRoute).toMatch(
      /bucket === "job-photos" \? supabase\.storage : admin\.storage/,
    );
    expect(photoUploadRoute).toContain(
      '"save_work_order_inspection_photo_evidence_atomic"',
    );
    expect(photoUploadRoute).toContain('savedError.code === "42501"');
    expect(photoUploadRoute).toContain(
      "saved = await ensureInspectionPhotoRow({",
    );
    expect(photoConcurrencyRuntime).toContain(
      "Photo upload survived a committed technician reassignment.",
    );
    expect(photoConcurrencyRuntime).toContain(
      "Photo upload survived a committed capability deny.",
    );
    expect(cleanReplayWorkflow).toContain(
      "bash tests/security/inspection-photo-upload-authorization-concurrency.runtime.sh",
    );
    expect(cleanReplayWorkflow).toContain(
      "inspection-photo-upload-authorization-concurrency.log",
    );
  });

  it("exercises default deny, assignment, overrides, service routes, and tenant isolation", () => {
    for (const proof of [
      "Parts escaped one or more public inspection writer gates",
      "Parts actor spoofed an authorized owner identity",
      "Unassigned mechanic saved another technician inspection",
      "Assigned mechanic inspection save did not persist",
      "Individual inspection deny did not override the manager preset",
      "Denied inspection attempts changed canonical inspection cardinality",
      "Shop A owner wrote inspection progress in Shop B",
      "Inspection authorization test crossed the tenant boundary",
    ]) {
      expect(runtime).toContain(proof);
    }
  });
});
