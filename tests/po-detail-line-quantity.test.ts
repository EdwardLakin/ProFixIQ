import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagePath = "app/parts/po/[id]/page.tsx";

describe("purchase order detail line quantity", () => {
  it("writes the canonical purchase_order_lines qty column", () => {
    const source = readFileSync(pagePath, "utf8");
    const addLineSource = source.slice(
      source.indexOf("async function addLine"),
      source.indexOf("async function deleteLine"),
    );

    expect(addLineSource).toContain("qty,");
    expect(addLineSource).not.toContain("ordered_qty: qty");
  });
});
