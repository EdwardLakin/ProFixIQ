import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("vehicle photo on the work order detail page", () => {
  const source = read("app/work-orders/[id]/Client.tsx");

  it("signs through the shared probe rather than the primary bucket directly", () => {
    // Mirrors the invariant asserted for the board and list surfaces: never
    // hardcode the bucket name at this call site, or the legacy-bucket
    // fallback silently stops applying here too.
    expect(source).toContain(
      'import { signVehiclePhotoPaths } from "@/features/shared/lib/storage/vehiclePhotoBuckets";',
    );
    expect(source).toContain("await signVehiclePhotoPaths(");
    expect(source).not.toContain('.storage.from("vehicle-photos")');
  });

  it("looks up the newest photo for the linked vehicle, not any vehicle's", () => {
    expect(source).toContain('.from("vehicle_media")');
    expect(source).toContain('.eq("vehicle_id", vehicleId)');
    expect(source).toContain('.eq("type", "photo")');
    expect(source).toContain('.order("created_at", { ascending: false })');
    expect(source).toContain(".limit(1)");
  });

  it("does not persist the signed URL through useTabState", () => {
    // wo/lines/vehicle/customer are cached via useTabState (localStorage,
    // scoped per tab) to survive a tab switch without a refetch flicker.
    // A signed URL is the wrong thing to cache that way: it expires in an
    // hour, and useTabState has no mechanism to invalidate or re-sign it,
    // so a cached copy would eventually serve a broken image with nothing
    // to refresh it -- on a tab switch, or after a plain reload, long after
    // this component last ran its own effect.
    expect(source).toContain(
      "const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState<string | null>(null);",
    );
    expect(source).not.toContain(
      'useTabState<string | null>("wo:id:vehPhoto"',
    );
  });

  it("re-signs for an hour and re-runs whenever the linked vehicle changes", () => {
    expect(source).toContain("const VEHICLE_PHOTO_URL_TTL_SECONDS = 3600;");
    expect(source).toContain("VEHICLE_PHOTO_URL_TTL_SECONDS,");
    // A stale in-flight lookup from a previous vehicle must not clobber a
    // newer one -- the same cancelled-flag pattern the list page uses.
    const effect = source.slice(
      source.indexOf("Newest vehicle_media photo for the linked vehicle"),
      source.indexOf("}, [vehicle?.id]);") + 20,
    );
    expect(effect).toContain("let cancelled = false;");
    expect(effect).toContain("if (cancelled) return;");
    expect(effect).toContain("cancelled = true;");
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
    expect(source).toContain(
      "No vehicle linked",
    );
  });
});
