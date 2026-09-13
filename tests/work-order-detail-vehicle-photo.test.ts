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
    // with room to spare, so its thumbnail is deliberately larger -- bumped
    // again after the first size (h-14) still read as small against the
    // header's whitespace.
    expect(source).toContain("h-24 w-24 shrink-0 rounded-xl");
    expect(source).not.toContain("h-10 w-10 shrink-0 rounded-lg");
    expect(source).not.toContain("h-11 w-11 shrink-0 rounded-lg");
    // No photo resolved (or none exists) must never block the header from
    // rendering the customer/vehicle text it already showed.
    expect(source).toContain("{vehiclePhotoUrl ? (");
    expect(source).toContain("No vehicle linked");
  });

  it("fills the photo's height with the header's own content instead of leaving it beside empty space", () => {
    // The 96px photo sits next to a middle column; that column now stacks
    // title+badges, the customer/vehicle line, and the state chips together
    // (vertically centered) so it occupies roughly the photo's height,
    // rather than two short lines followed by a gap before an unrelated
    // full-width row starts.
    const photoRow = source.slice(
      source.indexOf('<div className="flex items-stretch gap-3.5">'),
      source.indexOf("</WorkOrderWorkspaceCommandBar>"),
    );
    expect(photoRow).toContain("flex-col justify-center");
    expect(photoRow).toContain("State: {workOrderStatusView.label}");

    // The jobs/total figure moved out of the bottom tab row into a stat
    // tile beside the photo, so the tab row is pure navigation on wider
    // screens.
    expect(photoRow).toContain("rounded-2xl border border-[color:var(--theme-border-soft)]");
    expect(photoRow).toContain("{formatCurrency(workOrderTotal)}");
  });

  it("keeps the jobs/total figure visible below the breakpoint where the stat tile hides", () => {
    // The stat tile beside the photo is sm:flex-and-up only (hidden below
    // that breakpoint). Losing the figure entirely on narrow viewports
    // would be a regression from the old layout, where it lived in the
    // always-visible, wrapping command bar -- so a second, sm:hidden copy
    // must exist specifically for that range.
    const statTileIndex = source.indexOf("{formatCurrency(workOrderTotal)}");
    const statTileBlock = source.slice(statTileIndex - 320, statTileIndex + 400);
    expect(statTileBlock).toContain('className="hidden shrink-0 items-center sm:flex"');

    expect(source).toContain(
      'className="ml-auto inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-[color:var(--theme-text-primary)] sm:hidden"',
    );
    // Both copies read the same underlying values.
    const mobileFallbackCount = (
      source.match(/\{sortedLines\.length\} jobs/g) ?? []
    ).length;
    expect(mobileFallbackCount).toBe(2);
  });
});
