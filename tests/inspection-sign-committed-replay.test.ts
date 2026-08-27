import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/inspections/sign/route.ts", "utf8");
const authorization = readFileSync(
  "features/inspections/server/authorizeInspectionMutation.ts",
  "utf8",
);
const importer = readFileSync(
  "features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260825213000_enforce_inspection_write_capability.sql",
  "utf8",
);

describe("inspection committed-signature replay authorization", () => {
  it("authorizes every staff-captured evidence role before signing", () => {
    const authorizeAt = route.indexOf("authorizeInspectionMutation({");
    const productAt = route.indexOf("canExecuteInspectionForProduct({");
    const importAt = route.indexOf("insertPrioritizedJobsFromInspection({");
    const signAt = route.indexOf("callSignInspectionRpc(supabase");

    expect(route).not.toContain('bodyUnknown.role !== "customer"');
    expect(route).toContain("committedSignatureReplay: {");
    expect(route).toContain("role: bodyUnknown.role");
    expect(route).toContain("signedName: effectiveSignedName");
    expect(authorizeAt).toBeGreaterThan(-1);
    expect(productAt).toBeGreaterThan(authorizeAt);
    expect(route).toContain('authorization.replay.kind !== "signature"');
    expect(route).not.toContain(
      'bodyUnknown.role === "technician" || bodyUnknown.role === "advisor"',
    );
    expect(importAt).toBeGreaterThan(authorizeAt);
    expect(signAt).toBeGreaterThan(importAt);
  });

  it("proves the exact committed signature only after normal authorization", () => {
    const capabilityAt = authorization.indexOf(
      "resolveCurrentWorkspaceCapabilities({",
    );
    const lineAt = authorization.indexOf('.from("work_order_lines")');
    const workOrderAt = authorization.indexOf('.from("work_orders")');
    const failedAssignmentAt = authorization.lastIndexOf(
      "if (!assigned)",
      authorization.indexOf("const retry = input.committedSignatureReplay;"),
    );
    const retryAt = authorization.indexOf(
      "const retry = input.committedSignatureReplay;",
    );
    const inspectionAt = authorization.indexOf('.from("inspections")', retryAt);
    const signatureAt = authorization.indexOf(
      '.from("inspection_signatures")',
      inspectionAt,
    );

    expect(lineAt).toBeGreaterThan(capabilityAt);
    expect(workOrderAt).toBeGreaterThan(lineAt);
    expect(retryAt).toBeGreaterThan(failedAssignmentAt);
    expect(inspectionAt).toBeGreaterThan(retryAt);
    expect(signatureAt).toBeGreaterThan(inspectionAt);

    for (const binding of [
      '.eq("id", retry.inspectionId)',
      '.eq("shop_id", profile.shop_id)',
      '.eq("work_order_id", workOrderId)',
      '.eq("work_order_line_id", line.id)',
      '.eq("is_canonical", true)',
      "syncRevision === retry.expectedSyncRevision",
      '.eq("role", retry.role)',
      '.eq("signing_cycle", inspection.signing_cycle)',
      '.eq("signed_sync_revision", syncRevision)',
      '.eq("signed_by", user.id)',
      'retry.role !== "customer"',
      "signatureResult.data.signed_name === retry.signedName.trim()",
    ]) {
      expect(authorization).toContain(binding);
    }

    expect(authorization).toContain('kind: "signature"');
  });

  it("skips technician import only for an exact signature replay", () => {
    expect(route).toContain('authorization.replay.kind !== "signature"');
    expect(
      route.indexOf('authorization.replay.kind !== "signature"'),
    ).toBeLessThan(route.indexOf("insertPrioritizedJobsFromInspection({"));
  });

  it("commits technician finding import and signing in one transaction", () => {
    expect(route).toContain("signing: {");
    expect(route).toContain(
      "signedAtomically = imported.signedAtomically === true",
    );
    expect(route).toContain("const { data, error } = signedAtomically");
    expect(importer).toContain(
      'rpc("import_inspection_findings_and_sign_atomic"',
    );
    expect(importer).toContain(
      "Atomic inspection signing did not return a committed receipt.",
    );

    const command = migration.slice(
      migration.indexOf(
        "create or replace function public.import_inspection_findings_and_sign_atomic(",
      ),
      migration.indexOf(
        "comment on function public.import_inspection_findings_and_sign_atomic(",
      ),
    );
    const importAt = command.indexOf(
      "public.import_inspection_quote_package_atomic(",
    );
    const signAt = command.indexOf("public.sign_inspection(");
    expect(command).toContain("security invoker");
    expect(command).toContain("p_role is distinct from 'technician'");
    expect(importAt).toBeGreaterThan(0);
    expect(signAt).toBeGreaterThan(importAt);
    expect(command).toContain("'signedAtomically', true");
  });
});
