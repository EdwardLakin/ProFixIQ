import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/inspections/sign/route.ts", "utf8");
const authorization = readFileSync(
  "features/inspections/server/authorizeInspectionMutation.ts",
  "utf8",
);

describe("inspection committed-signature replay authorization", () => {
  it("authorizes every staff-captured evidence role before signing", () => {
    const authorizeAt = route.indexOf("authorizeInspectionMutation({");
    const importAt = route.indexOf("insertPrioritizedJobsFromInspection({");
    const signAt = route.indexOf("callSignInspectionRpc(supabase");

    expect(route).not.toContain('bodyUnknown.role !== "customer"');
    expect(route).toContain("committedSignatureReplay: {");
    expect(route).toContain("role: bodyUnknown.role");
    expect(route).toContain("signedName: effectiveSignedName");
    expect(authorizeAt).toBeGreaterThan(-1);
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
    const inspectionAt = authorization.indexOf('.from("inspections")');
    const signatureAt = authorization.indexOf('.from("inspection_signatures")');

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
});
