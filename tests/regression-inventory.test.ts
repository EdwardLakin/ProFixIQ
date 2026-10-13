// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyLogs,
  discoverMigrationStorageBuckets,
  evaluateCriticalFlows,
  parseSchemaTypes,
  scanSourceText,
} from "../scripts/regression-inventory/lib.mjs";

const rootDir = process.cwd();

function schemaContract() {
  const schema = parseSchemaTypes(
    path.join(rootDir, "features/shared/types/types/supabase.ts"),
  );
  schema.storageBuckets = discoverMigrationStorageBuckets(rootDir);
  return schema;
}

describe("full-app regression inventory", () => {
  it("loads the canonical clean-replay schema and migration bucket contract", () => {
    const schema = schemaContract();

    expect(schema.relations.get("work_orders")?.row.has("shop_id")).toBe(true);
    expect(schema.functions.has("apply_stock_move")).toBe(true);
    expect(schema.storageBuckets.has("employee_docs")).toBe(true);
  });

  it("checks order() columns against the referenced table when ordering an embedded resource", () => {
    const scan = (source: string) =>
      scanSourceText({ file: "app/example.ts", schema: schemaContract(), source }).findings.filter(
        (finding) => finding.rule === "missing-column" || finding.rule === "missing-relation",
      );

    // completed_on is a column of the embedded equipment_pm_completions, not of the plans.
    expect(
      scan(`
        await supabase
          .from("equipment_pm_plans")
          .select("id,equipment_pm_completions(id,completed_on)")
          .order("completed_on", { referencedTable: "equipment_pm_completions", ascending: false })
          .order("sequence", { foreignTable: "equipment_pm_completions" })
          .limit(1, { referencedTable: "equipment_pm_completions" })
          .order("id");
      `),
    ).toEqual([]);

    // A wrong column on the referenced table, an unknown referenced table and a
    // wrong column on the queried table are all still reported.
    const findings = scan(`
      await supabase
        .from("equipment_pm_plans")
        .select("id")
        .order("finished_on", { referencedTable: "equipment_pm_completions" })
        .order("completed_on", { referencedTable: "no_such_table" })
        .order("completed_on");
    `);
    expect(findings.map((finding) => finding.message)).toEqual([
      "order references missing column equipment_pm_completions.finished_on",
      "order references missing relation no_such_table",
      "order references missing column equipment_pm_plans.completed_on",
    ]);

    // An aliased embed is resolved through the select list to its relation.
    expect(
      scan(`
        await supabase
          .from("equipment_pm_plans")
          .select("id,latest:equipment_pm_completions!equipment_pm_completions_plan_id_fkey(completed_on)")
          .order("completed_on", { referencedTable: "latest" });
      `),
    ).toEqual([]);
    expect(
      scan(`
        await supabase
          .from("equipment_pm_plans")
          .select("id,latest:equipment_pm_completions(completed_on)")
          .order("finished_on", { referencedTable: "latest" });
      `).map((finding) => finding.message),
    ).toEqual(["order references missing column equipment_pm_completions.finished_on"]);

    // Only order() takes a referencedTable option: a JSON filter value with
    // that key is data, checked against the queried table as before.
    expect(
      scan(`
        await supabase
          .from("work_orders")
          .select("id")
          .contains("metadata", { referencedTable: "not_a_relation" });
      `).map((finding) => finding.message),
    ).toEqual(scan(`await supabase.from("work_orders").select("id").contains("metadata", {});`).map((finding) => finding.message));
  });

  it("finds a retired column even when the relation is a local constant", () => {
    const result = scanSourceText({
      file: "app/example.ts",
      schema: schemaContract(),
      source: `
        const TABLE = "work_orders";
        await supabase
          .from(TABLE)
          .select("id, technician_id")
          .eq("shop_id", shopId);
      `,
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.rule === "missing-column" &&
          finding.subject === "work_orders.technician_id",
      ),
    ).toBe(true);
  });

  it("accepts a valid generated RPC overload and ignores embedded filters", () => {
    const result = scanSourceText({
      file: "features/example.ts",
      schema: schemaContract(),
      source: `
        await supabase.rpc("apply_stock_move", {
          p_loc: locationId,
          p_part: partId,
          p_qty: 1,
          p_reason: "receive_po",
          p_ref_id: poId,
          p_ref_kind: "purchase_order",
        });
        await supabase
          .from("work_order_lines")
          .select("id, work_orders!inner(shop_id)")
          .eq("work_orders.shop_id", shopId);
      `,
    });

    expect(
      result.findings.filter((finding) =>
        ["unknown-rpc-argument", "missing-rpc-argument"].includes(finding.rule),
      ),
    ).toEqual([]);
    expect(
      result.findings.some(
        (finding) => finding.subject === "work_order_lines.work_orders",
      ),
    ).toBe(false);
  });

  it("checks storage buckets provisioned by the migration chain", () => {
    const result = scanSourceText({
      file: "app/storage.ts",
      schema: schemaContract(),
      source: `
        const GOOD_BUCKET = "employee_docs";
        await supabase.storage.from(GOOD_BUCKET).upload(path, file);
        await supabase.storage.from("dashboard-only-bucket").upload(path, file);
      `,
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.rule === "missing-storage-bucket" &&
          finding.subject === "dashboard-only-bucket",
      ),
    ).toBe(true);
    expect(
      result.findings.some((finding) => finding.subject === "employee_docs"),
    ).toBe(false);
  });

  it("checks Realtime relation and filter contracts", () => {
    const result = scanSourceText({
      file: "features/realtime.ts",
      schema: schemaContract(),
      source: `
        supabase.channel("work-orders").on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "work_orders",
          filter: "technician_id=eq.123",
        }, handler);
      `,
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.rule === "missing-column" &&
          finding.operation === "realtime-filter",
      ),
    ).toBe(true);
  });

  it("classifies sanitized runtime signatures without copying raw log text", () => {
    const result = classifyLogs(
      JSON.stringify([
        { event_message: "Request item has no selected inventory part" },
        {
          message:
            "permission denied for function recompute_live_invoice_costs",
        },
        { message: "PGRST204 Could not find the 'technician_id' column" },
      ]),
    );

    expect(result.messagesInspected).toBe(3);
    expect(result.categories.map((category) => category.id)).toEqual(
      expect.arrayContaining([
        "runtime-parts-po-unresolved-item",
        "runtime-invoice-cost-rpc-permission",
        "runtime-schema-column-missing",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("technician_id");
  });

  it("requires explicit proof markers for regression-sensitive stages", () => {
    const config = {
      flows: [
        {
          id: "quote-review",
          title: "Quote Review",
          domain: "quotes-approvals",
          stages: ["cost", "sell"],
          evidence: [
            {
              id: "cost-sell",
              label: "cost and sell assertion",
              globs: ["tests/*quote-review*.test.ts"],
              kinds: ["vitest"],
              markers: ["quotes.review-cost-and-sell"],
              minimum: 1,
            },
          ],
        },
      ],
    };
    const unproven = evaluateCriticalFlows(config, [
      {
        file: "tests/quote-review.test.ts",
        kind: "vitest",
        ciInvoked: true,
        markers: [],
      },
    ]);
    const proven = evaluateCriticalFlows(config, [
      {
        file: "tests/quote-review.test.ts",
        kind: "vitest",
        ciInvoked: true,
        markers: ["quotes.review-cost-and-sell"],
      },
    ]);

    expect(unproven.flows[0].status).toBe("gap");
    expect(proven.flows[0].status).toBe("covered");
  });

  it("keeps finding fingerprints stable when line numbers move", () => {
    const schema = schemaContract();
    const first = scanSourceText({
      file: "app/stable.ts",
      schema,
      source: 'supabase.from("work_orders").select("technician_id");',
    });
    const moved = scanSourceText({
      file: "app/stable.ts",
      schema,
      source: '\n\n\nsupabase.from("work_orders").select("technician_id");',
    });

    expect(first.findings[0].fingerprint).toBe(moved.findings[0].fingerprint);
    expect(first.findings[0].line).not.toBe(moved.findings[0].line);
  });
});
