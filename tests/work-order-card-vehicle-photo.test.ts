import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260912160000_surface_vehicle_photo_on_work_order_cards.sql",
);

describe("vehicle photo on work order cards", () => {
  it("provisions the buckets the create page already writes to", () => {
    // The work-order create page has always uploaded to these buckets, but no
    // migration created them, so they only existed where someone made them by
    // hand and uploads failed in a freshly provisioned environment.
    expect(migration).toContain("'vehicle-photos'");
    expect(migration).toContain("'vehicle-docs'");
    expect(migration).toContain("insert into storage.buckets");
    // Vehicle imagery is customer data, so the buckets stay private and the
    // board mints signed URLs instead.
    expect(migration).toContain("set public = false");
  });

  it("scopes every storage policy to the shop that owns the vehicle", () => {
    for (const policy of [
      "vehicle_media_objects_select",
      "vehicle_media_objects_insert",
      "vehicle_media_objects_delete",
    ]) {
      expect(migration).toContain(`create policy ${policy}`);
    }
    expect(migration).toContain("public.vehicle_media_object_in_shop(");
    expect(migration).toContain("v.shop_id = public.current_shop_id()");
    // A non-uuid folder must yield null rather than raising, so a malformed
    // object name simply matches no policy.
    expect(migration).toContain("vehicle_storage_path_uuid");
    expect(migration).toContain("else null");
  });

  it("carries the newest vehicle photo through both board views", () => {
    expect(migration).toContain(
      "create or replace view public.v_work_order_board_cards_shop",
    );
    expect(migration).toContain(
      "create or replace view public.v_work_order_board_cards_fleet",
    );
    expect(migration).toContain("vphoto.storage_path as vehicle_photo_path");
    expect(migration).toContain("s.vehicle_photo_path");
    expect(migration).toContain("from public.vehicle_media m");
    expect(migration).toContain("and m.type = 'photo'");
    expect(migration).toContain(
      "order by m.created_at desc nulls last, m.id desc",
    );
    expect(migration).toContain("limit 1");
  });

  it("appends the new column last so create-or-replace accepts it", () => {
    const shopStart = migration.indexOf(
      "create or replace view public.v_work_order_board_cards_shop",
    );
    const shopBody = migration.slice(
      shopStart,
      migration.indexOf("create or replace view public.v_work_order_board_cards_fleet"),
    );
    // Postgres only allows new view columns at the end of the column list.
    const selectList = shopBody.slice(0, shopBody.indexOf("\nfrom public.work_orders w"));
    expect(selectList.trimEnd().endsWith("vphoto.storage_path as vehicle_photo_path")).toBe(true);
  });

  it("signs the private paths once per board load", () => {
    const hook = read("features/shared/hooks/useWorkOrderBoard.ts");

    expect(hook).toContain('.from("vehicle-photos")');
    expect(hook).toContain("createSignedUrls(paths, 600)");
    // One batched request for the rows on screen, not one per card.
    expect(hook).toContain("new Set(");
    // A signing failure must leave the rows renderable without a photo.
    expect(hook).toContain("if (signError || !data) return boardRows;");
    expect(hook).toContain("publishRows");
  });

  it("renders the photo on the Work Orders list, which is its own component", () => {
    // /work-orders renders WorkOrdersView, not the board components: it runs its
    // own query and its own vehicle column, so the board change alone would not
    // have reached the page operators actually use.
    const listPage = read("features/work-orders/app/work-orders/view/page.tsx");

    expect(listPage).toContain('.from("vehicle_media")');
    expect(listPage).toContain('.eq("type", "photo")');
    expect(listPage).toContain('.order("created_at", { ascending: false })');
    expect(listPage).toContain('.from("vehicle-photos")');
    expect(listPage).toContain("createSignedUrls(paths, 600)");
    expect(listPage).toContain("vehiclePhotoByVehicle");
    // Newest wins, and the list still shows its label when nothing resolves.
    expect(listPage).toContain("newestPathByVehicle.has(vehicleId)");
    expect(listPage).toContain('{vehicleLabel || "No vehicle"}');
  });

  it("renders the photo on both card surfaces with a text fallback", () => {
    const boardCard = read(
      "features/shared/components/workboard/WorkOrderBoardCard.tsx",
    );
    const boardList = read(
      "features/shared/components/workboard/WorkOrderBoard.tsx",
    );

    for (const surface of [boardCard, boardList]) {
      expect(surface).toContain("row.vehicle_photo_url ? (");
      expect(surface).toContain("object-cover");
      expect(surface).toContain('loading="lazy"');
    }
    // The vehicle label still renders whether or not a photo exists.
    expect(boardCard).toContain("row.vehicle_label");
    expect(boardList).toContain("Vehicle not listed");
  });

  it("types the row fields the board relies on", () => {
    const types = read("features/shared/lib/workboard/types.ts");
    expect(types).toContain("vehicle_photo_path?: string | null;");
    expect(types).toContain("vehicle_photo_url?: string | null;");

    const generated = read("features/shared/types/types/supabase.ts");
    expect(
      generated.match(/vehicle_photo_path: string \| null/g)?.length,
    ).toBe(2);
  });
});
