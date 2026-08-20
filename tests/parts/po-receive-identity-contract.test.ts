import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const materializationMigration = () =>
  readFileSync(
    "supabase/migrations/20260808021602_materialize_request_backed_po_parts.sql",
    "utf8",
  );

const receiveMigration = () =>
  readFileSync(
    "supabase/migrations/20260804120000_codex_review_followup_hardening.sql",
    "utf8",
  );

const receivePanel = () =>
  readFileSync(
    "features/parts/components/PurchaseOrderReceivePanel.tsx",
    "utf8",
  );

describe("purchase-order receive identity contract", () => {
  it("materializes request-backed PO parts without requiring an internal SKU", () => {
    const source = materializationMigration();

    expect(source).toContain("sku,\n      cost");
    expect(source).toContain("null,\n      new.unit_cost");
    expect(source).toContain(
      "new.sku := coalesce(new.sku, v_part.sku, v_part.part_number);",
    );
  });

  it("canonical receiving is keyed by part_id rather than SKU", () => {
    const source = receiveMigration();
    const fnStart = source.indexOf(
      "create or replace function public.receive_po_part_and_allocate(",
    );
    expect(fnStart).toBeGreaterThanOrEqual(0);

    const bodyStart = source.indexOf("as $$", fnStart);
    expect(bodyStart).toBeGreaterThan(fnStart);

    const fnEnd = source.indexOf("\n$$;", bodyStart);
    expect(fnEnd).toBeGreaterThan(bodyStart);

    const fnSource = source.slice(fnStart, fnEnd + 4);

    expect(fnSource).toContain("p_part_id uuid");
    expect(fnSource).toContain("part.id=p_part_id");
    expect(fnSource).not.toMatch(/\bsku\b/i);
  });

  it("the receive UI sends part_id and never sends SKU to the receipt RPC", () => {
    const source = receivePanel();
    const argsStart = source.indexOf("const args = {");
    const rpcStart = source.indexOf('"receive_po_part_and_allocate"', argsStart);
    expect(argsStart).toBeGreaterThanOrEqual(0);
    expect(rpcStart).toBeGreaterThan(argsStart);

    const argsSource = source.slice(argsStart, rpcStart);
    expect(argsSource).toContain("p_part_id: partId");
    expect(argsSource).not.toMatch(/\bsku\b/i);
  });
});
