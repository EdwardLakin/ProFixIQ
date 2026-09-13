import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260912160000_surface_vehicle_photo_on_work_order_cards.sql",
);

describe("vehicle photo on work order cards", () => {
  it("stays additive: no shared storage configuration or policy changes", () => {
    // AGENTS.md requires shared integration work to land in its own PR that
    // proves backward compatibility first. Reconfiguring pre-existing buckets or
    // installing policies on the shared storage.objects table is exactly that,
    // so this feature migration must not carry any of it.
    expect(migration).not.toContain("storage.buckets");
    expect(migration).not.toContain("storage.objects");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("drop policy");
    expect(migration).not.toContain("set public = false");
  });

  it("indexes the newest-photo lookup it introduces", () => {
    // The lateral runs per board row; vehicle_media carried only a shop_id
    // index, which would leave every load scanning and sorting tenant media.
    expect(migration).toContain(
      "create index if not exists vehicle_media_vehicle_photo_recent_idx",
    );
    expect(migration).toContain(
      "on public.vehicle_media (vehicle_id, created_at desc, id desc)",
    );
    expect(migration).toContain("where type = 'photo'");
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

  it("never blocks work-order rows on Storage signing", () => {
    const hook = read("features/shared/hooks/useWorkOrderBoard.ts");

    // Signing goes through the shared probe rather than the bucket directly,
    // so both surfaces cover the legacy fallback in one place.
    expect(hook).toContain(
      'import { signVehiclePhotoPaths } from "@/features/shared/lib/storage/vehiclePhotoBuckets";',
    );
    expect(hook).toContain("await signVehiclePhotoPaths(");
    // A signing failure must leave the rows renderable without a photo.
    expect(hook).toContain("if (!signedByPath.size) return boardRows;");

    // This hook also backs surfaces that render no imagery, so rows publish
    // first and thumbnails merge in afterwards.
    const publish = hook.slice(hook.indexOf("const publishRows"));
    expect(publish).toContain("setRows(boardRows);");
    expect(publish).toContain("void signVehiclePhotos(boardRows).then(");
    expect(hook).not.toContain("await publishRows(");
  });

  it("outlives a ten-minute URL and notices photos added later", () => {
    const hook = read("features/shared/hooks/useWorkOrderBoard.ts");
    const listPage = read("features/work-orders/app/work-orders/view/page.tsx");

    // A board is open for a shift, and a lazily loaded card can request its
    // image long after the rows arrived.
    for (const surface of [hook, listPage]) {
      expect(surface).toContain("const VEHICLE_PHOTO_URL_TTL_SECONDS = 3600;");
      expect(surface).toContain("await signVehiclePhotoPaths(");
      expect(surface).toContain("supabase,");
      expect(surface).toContain("paths,");
      expect(surface).toContain("VEHICLE_PHOTO_URL_TTL_SECONDS,");
    }

    // Creation inserts the work order before uploading its media, so the board
    // has to watch the media table too or it stays thumbnail-less.
    expect(hook).toContain('table: "vehicle_media"');
  });

  it("signs against the primary bucket first, falling back to the legacy bucket only for paths it misses", () => {
    // The create page has always written to the hyphenated bucket, but the
    // customer detail page's uploader falls back to an underscore-named
    // legacy bucket whenever the primary bucket rejects an upload -- which,
    // before the bucket migration, was every upload in a fresh environment.
    // vehicle_media never records which bucket a path landed in, so both
    // board surfaces have to probe rather than assume the primary one.
    const helper = read("features/shared/lib/storage/vehiclePhotoBuckets.ts");

    expect(helper).toContain('export const VEHICLE_PHOTO_BUCKET_PRIMARY = "vehicle-photos";');
    expect(helper).toContain('export const VEHICLE_PHOTO_BUCKET_LEGACY = "vehicle_photos";');
    expect(helper).toContain(".from(VEHICLE_PHOTO_BUCKET_PRIMARY)");
    expect(helper).toContain(".from(VEHICLE_PHOTO_BUCKET_LEGACY)");
    // The legacy bucket is only probed for whichever paths the primary
    // bucket didn't resolve -- never a second request for every path.
    expect(helper).toContain("if (!unresolved.length) return signed;");

    for (const surface of [
      read("features/shared/hooks/useWorkOrderBoard.ts"),
      read("features/work-orders/app/work-orders/view/page.tsx"),
    ]) {
      expect(surface).toContain(
        'import { signVehiclePhotoPaths } from "@/features/shared/lib/storage/vehiclePhotoBuckets";',
      );
      // Neither call site should hardcode the bucket name directly anymore --
      // that would silently drop the legacy fallback again.
      expect(surface).not.toContain('.storage.from("vehicle-photos")');
    }
  });

  it("renders the photo on the Work Orders list, which is its own component", () => {
    // /work-orders renders WorkOrdersView, not the board components: it runs its
    // own query and its own vehicle column, so the board change alone would not
    // have reached the page operators actually use.
    const listPage = read("features/work-orders/app/work-orders/view/page.tsx");

    expect(listPage).toContain('.from("vehicle_media")');
    expect(listPage).toContain('.eq("type", "photo")');
    expect(listPage).toContain('.order("created_at", { ascending: false })');
    expect(listPage).toContain("await signVehiclePhotoPaths(");
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
