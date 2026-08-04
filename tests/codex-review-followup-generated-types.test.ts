import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const generatedTypesPath = "features/shared/types/types/supabase.ts";

describe("Codex follow-up generated Supabase types", () => {
  it("tracks every table, column, and RPC added by the superseding migration", () => {
    const source = readFileSync(generatedTypesPath, "utf8");

    for (const contract of [
      "inventory_reconciliation_exceptions: {",
      "technician_notes: string | null",
      "technician_notes?: string | null",
      "canonical_shop_membership_role: {",
      "parts_create_and_attach_inventory_atomic: {",
      "p_operation_key: string",
    ]) {
      expect(source).toContain(contract);
    }

    expect(source.match(/technician_notes\?: string \| null/g)).toHaveLength(2);
  });
});
