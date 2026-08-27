import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825213000_enforce_inspection_write_capability.sql",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/supabase-clean-replay-audit.yml",
  "utf8",
);

function functionBody(start: string, end: string): string {
  return migration.slice(migration.indexOf(start), migration.indexOf(end));
}

describe("inspection exact-head review regressions", () => {
  it("keeps imported profile receipts same-shop visible without crossing tenants", () => {
    const policy = functionBody(
      "create policy quote_lifecycle_operation_keys_shop_select",
      "-- Preserve the established canonical writer implementation",
    );

    expect(policy).toContain(
      "profile.shop_id = quote_lifecycle_operation_keys.shop_id",
    );
    expect(policy).toContain("profile.id = (select auth.uid())");
    expect(policy).toContain("profile.user_id = (select auth.uid())");
  });

  it("treats signature role as evidence and recovers only exact committed work", () => {
    const sign = functionBody(
      "create or replace function public.sign_inspection(",
      "comment on function public.sign_inspection(",
    );
    const capability = sign.indexOf(
      "from private.resolve_workspace_profile_capability(",
    );
    const workOrder = sign.indexOf("from public.work_orders work_order");
    const retry = sign.indexOf("v_same_actor_retry := (");
    const assignment = sign.indexOf("if v_actor_role = 'mechanic'");
    const core = sign.indexOf("perform private.sign_inspection_core(");

    expect(sign).not.toContain("p_role is distinct from 'customer'");
    expect(sign).not.toContain("p_role = 'technician'");
    expect(sign).toContain(
      "v_actor_role = 'mechanic'\n     and v_work_order_line_id is not null",
    );
    expect(capability).toBeGreaterThan(0);
    expect(workOrder).toBeGreaterThan(capability);
    expect(retry).toBeGreaterThan(workOrder);
    expect(assignment).toBeGreaterThan(retry);
    expect(sign.slice(assignment, core)).toContain("not v_same_actor_retry");
    expect(sign).toContain("p_expected_sync_revision = v_inspection_revision");
    expect(sign).toContain("signature.signed_name is not distinct from");
    expect(core).toBeGreaterThan(assignment);

    const imported = functionBody(
      "create or replace function public.import_inspection_quote_package_atomic(",
      "comment on function public.import_inspection_quote_package_atomic(",
    );
    const receipt = imported.indexOf(
      "from public.quote_lifecycle_operation_keys receipt",
    );
    const receiptReturn = imported.indexOf(
      "return coalesce(v_receipt_result, '{}'::jsonb)",
    );
    const importAssignment = imported.indexOf("if v_actor_role = 'mechanic'");
    expect(imported).toContain("v_receipt_result ->> 'sourceWorkOrderLineId'");
    expect(receiptReturn).toBeGreaterThan(receipt);
    expect(importAssignment).toBeGreaterThan(receiptReturn);
  });

  it("cannot strand imported findings between technician import and signing", () => {
    const combined = functionBody(
      "create or replace function public.import_inspection_findings_and_sign_atomic(",
      "comment on function public.import_inspection_findings_and_sign_atomic(",
    );
    const imported = combined.indexOf(
      "public.import_inspection_quote_package_atomic(",
    );
    const signed = combined.indexOf("public.sign_inspection(");

    expect(combined).toContain("security invoker");
    expect(combined).toContain("p_role is distinct from 'technician'");
    expect(imported).toBeGreaterThan(0);
    expect(signed).toBeGreaterThan(imported);
    expect(combined).toContain("'signedAtomically', true");
  });

  it("locks Work Orders before inspection rows for attach and reopen", () => {
    expect(migration).toContain("rename to attach_signed_inspection_pdf_core");
    expect(migration).toContain(
      "alter function private.attach_signed_inspection_pdf_core(",
    );
    expect(migration).toContain("set search_path to '';");
    expect(migration).toContain(
      "revoke all on function private.attach_signed_inspection_pdf_core(",
    );

    const attach = functionBody(
      "create or replace function public.attach_signed_inspection_pdf_atomic(",
      "comment on function public.attach_signed_inspection_pdf_atomic(",
    );
    const attachWorkOrder = attach.indexOf(
      "from public.work_orders work_order",
    );
    const attachInspection = attach.lastIndexOf(
      "from public.inspections inspection",
    );
    const attachCore = attach.indexOf(
      "return private.attach_signed_inspection_pdf_core(",
    );
    expect(attachInspection).toBeGreaterThan(attachWorkOrder);
    expect(attachCore).toBeGreaterThan(attachInspection);

    const reopen = functionBody(
      "create or replace function public.reopen_inspection(",
      "comment on function public.reopen_inspection(",
    );
    const reopenWorkOrder = reopen.indexOf(
      "from public.work_orders work_order",
    );
    const reopenInspection = reopen.lastIndexOf(
      "from public.inspections inspection",
    );
    const reopenCore = reopen.indexOf("return private.reopen_inspection_core(");
    expect(reopenInspection).toBeGreaterThan(reopenWorkOrder);
    expect(reopenCore).toBeGreaterThan(reopenInspection);
  });

  it("preserves Assistant action-first order before parent-first domain locks", () => {
    const assistant = functionBody(
      "create or replace function public.shop_assistant_reopen_inspection_atomic(",
      "comment on function public.shop_assistant_reopen_inspection_atomic(",
    );
    const action = assistant.indexOf(
      "public.shop_assistant_lock_action_for_tool(",
    );
    const workOrder = assistant.indexOf("from public.work_orders work_order");
    const inspection = assistant.lastIndexOf(
      "from public.inspections inspection",
    );
    const core = assistant.lastIndexOf(
      "return private.shop_assistant_reopen_inspection_core(",
    );
    expect(action).toBeGreaterThan(0);
    expect(workOrder).toBeGreaterThan(action);
    expect(inspection).toBeGreaterThan(workOrder);
    expect(core).toBeGreaterThan(inspection);
  });

  it("runs both lock-order and photo authorization races in Clean Replay", () => {
    const photoAuthorizer = functionBody(
      "create or replace function private.authorize_work_order_inspection_photo_write(",
      "comment on function private.authorize_work_order_inspection_photo_write(",
    );
    expect(photoAuthorizer).not.toContain("for key share");
    expect(workflow).toContain(
      "inspection-write-authorization-concurrency.runtime.sh",
    );
    expect(workflow).toContain(
      "inspection-photo-upload-authorization-concurrency.runtime.sh",
    );
    expect(workflow).toContain(
      "inspection-photo-upload-authorization-concurrency.log",
    );
  });

  it("preserves capability-authorized standalone mechanic inspections", () => {
    const authorization = readFileSync(
      "features/inspections/server/authorizeInspectionMutation.ts",
      "utf8",
    );

    expect(authorization).toContain(
      'if (canonicalRole === "mechanic" && line)',
    );
    expect(migration).toContain(
      "v_actor_role = 'mechanic'\n     and v_work_order_line_id is not null",
    );
  });
});
