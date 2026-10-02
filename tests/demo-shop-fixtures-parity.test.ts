import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// demoShopFixtures.ts (seeds a freshly cloned per-prospect shop) and
// scripts/seed-demo-shop.mjs (seeds the shared template demo shop) are two
// independent copies of the same baseline fixture content -- deliberately
// not a single shared module, since the script also provisions shared staff
// personas that a per-prospect shop never gets (see the module header in
// demoShopFixtures.ts). That duplication means a future edit to one can
// silently drift from the other: a prospect's cloned shop would then stop
// matching the template's documented demo baseline.
//
// This doesn't re-implement either file's logic. It reads both as text and
// checks that every customer/vehicle/work-order/line/inspection identifier
// demoShopFixtures.ts seeds is still present, verbatim, in the script too
// -- catching exactly the drift that matters (an entry added, removed, or
// reworded in one file but not the other) without the risk of a runtime
// extraction/refactor under this PR's time pressure.

const fixturesSource = readFileSync(
  path.join(__dirname, "../features/ops/server/demoShopFixtures.ts"),
  "utf8",
);
const scriptSource = readFileSync(
  path.join(__dirname, "../scripts/seed-demo-shop.mjs"),
  "utf8",
);

const CUSTOMER_EMAILS = [
  "dispatch@northridge.demo.profixiq.local",
  "fleetdesk@foothills.demo.profixiq.local",
  "ops@summit.demo.profixiq.local",
];

const VEHICLE_VINS = [
  "1DEMOTRAC00000001",
  "1DEMOTRAC00000002",
  "1DEMOTRAC00000003",
  "1DEMOTRAC00000004",
  "1DEMOTRLR00000001",
  "1DEMOTRLR00000002",
  "1DEMOTRLR00000003",
  "1DEMOSRVC00000001",
  "1DEMOMUNI00000001",
  "1DEMOMUNI00000002",
];

const WORK_ORDER_IDS = [
  "DEMO-WO-1001",
  "DEMO-WO-1002",
  "DEMO-WO-1003",
  "DEMO-WO-1004",
  "DEMO-WO-1005",
  "DEMO-WO-1006",
  "DEMO-WO-1007",
];

const WORK_ORDER_LINE_DESCRIPTIONS = [
  "Brake pull and noise verification from inspection findings",
  "Pressure test and leak trace",
  "Approved steering link replacement",
  "Recommended shock absorbers (deferred)",
  "Parts bottleneck - ABS wheel speed sensor backorder",
  "Municipal inspection findings review",
  "Wheel seal replacement recurrence",
];

describe("demoShopFixtures.ts / scripts/seed-demo-shop.mjs parity", () => {
  it.each(CUSTOMER_EMAILS)("both seed the customer %s", (email) => {
    expect(fixturesSource).toContain(email);
    expect(scriptSource).toContain(email);
  });

  it.each(VEHICLE_VINS)("both seed the vehicle with VIN %s", (vin) => {
    expect(fixturesSource).toContain(vin);
    expect(scriptSource).toContain(vin);
  });

  it.each(WORK_ORDER_IDS)("both seed work order %s", (customId) => {
    expect(fixturesSource).toContain(customId);
    expect(scriptSource).toContain(customId);
  });

  it.each(WORK_ORDER_LINE_DESCRIPTIONS)("both seed the line %s", (description) => {
    expect(fixturesSource).toContain(description);
    expect(scriptSource).toContain(description);
  });

  it("both seed the same inspection work order/status pairs", () => {
    expect(fixturesSource).toContain('["DEMO-WO-1003", "in_progress"');
    expect(scriptSource).toContain('["DEMO-WO-1003", "in_progress"');
    expect(fixturesSource).toContain('["DEMO-WO-1006", "in_progress"');
    expect(scriptSource).toContain('["DEMO-WO-1006", "in_progress"');
  });
});
