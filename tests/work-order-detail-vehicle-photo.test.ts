import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("vehicle photo on the work order detail page", () => {
  const source = read("app/work-orders/[id]/Client.tsx");

  // The scoped lookup, blank-path handling, signing, renewal, and the
  // cancelled-guard against a stale lookup all live in and are covered by
  // features/shared/hooks/useVehiclePhotoUrl.test.ts. This page's job is
  // just to call that hook correctly and render what it returns.
  it("delegates to the shared hook rather than querying inline", () => {
    expect(source).toContain(
      'import { useVehiclePhotoUrl } from "@/features/shared/hooks/useVehiclePhotoUrl";',
    );
    expect(source).toContain("const vehiclePhotoUrl = useVehiclePhotoUrl(");
    expect(source).toContain("vehicle?.id,");
    expect(source).toContain("VEHICLE_PHOTO_URL_TTL_SECONDS,");
    // Querying vehicle_media or signing directly in this file would mean
    // the blank-path and renewal fixes only apply on one of the two
    // surfaces that need them.
    expect(source).not.toContain('.from("vehicle_media")');
    expect(source).not.toContain("signVehiclePhotoPaths(");
  });

  it("does not persist the signed URL through useTabState", () => {
    // wo/lines/vehicle/customer are cached via useTabState (localStorage,
    // scoped per tab) to survive a tab switch without a refetch flicker.
    // The hook already renews the URL on its own schedule; caching its
    // output to localStorage as well would just fight that renewal with a
    // stale value on the next tab switch or reload.
    expect(source).not.toContain(
      'useTabState<string | null>("wo:id:vehPhoto"',
    );
  });

  it("renders larger than the board and list thumbnails, with a text fallback", () => {
    // The board/list surfaces intentionally stay compact (h-10/h-11) to keep
    // many cards on screen for triage. This page shows exactly one vehicle
    // with room to spare, so its thumbnail is deliberately larger.
    expect(source).toContain("h-14 w-14 shrink-0 rounded-lg");
    expect(source).not.toContain("h-10 w-10 shrink-0 rounded-lg");
    expect(source).not.toContain("h-11 w-11 shrink-0 rounded-lg");
    // No photo resolved (or none exists) must never block the header from
    // rendering the customer/vehicle text it already showed.
    expect(source).toContain("{vehiclePhotoUrl ? (");
    expect(source).toContain("No vehicle linked");
  });
});
