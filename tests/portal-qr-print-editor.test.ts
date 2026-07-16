import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_QR_PRINT_SETTINGS,
  normalizeQrPrintSettings,
  qrPrintFontFamily,
} from "../features/portal/lib/qrPrintSettings";

const read = (path: string) => readFileSync(path, "utf8");
const builder = read("features/portal/components/CustomerPortalQrBuilder.tsx");
const route = read("app/api/portal/qr/campaign/route.ts");
const migration = read(
  "supabase/migrations/20260716153000_portal_qr_print_editor.sql",
);
const databaseTypes = read("features/shared/types/types/supabase.ts");

describe("customer portal QR print editor", () => {
  it("normalizes persisted design settings and rejects unsafe values", () => {
    expect(
      normalizeQrPrintSettings(
        {
          brandName: "  North Ridge Auto  ",
          title: "Book with confidence",
          accentColor: "#CC5500",
          primaryColor: "not-a-color",
          font: "unknown-font",
          paperTone: "kraft",
          size: "counter",
          showLogo: false,
        },
        { shopName: "Fallback shop" },
      ),
    ).toEqual(
      expect.objectContaining({
        brandName: "North Ridge Auto",
        title: "Book with confidence",
        accentColor: "#cc5500",
        primaryColor: DEFAULT_QR_PRINT_SETTINGS.primaryColor,
        font: DEFAULT_QR_PRINT_SETTINGS.font,
        paperTone: "kraft",
        size: "counter",
        showLogo: false,
      }),
    );
    expect(qrPrintFontFamily("editorial")).toContain("Georgia");
  });

  it("makes every central-card copy field directly editable", () => {
    for (const field of [
      "brandName",
      "header",
      "title",
      "accentTitle",
      "instruction",
      "footer",
    ]) {
      expect(builder).toContain(`field=\"${field}\"`);
    }
    expect(builder).toContain("id={`qr-editor-${field}`}");
    expect(builder).toContain(
      "Click any outlined text on the card to edit it.",
    );
    expect(builder).toContain("selectPreviewField");
  });

  it("provides a powerful but bounded design and print toolset", () => {
    expect(builder).toContain("QR_PRINT_COLOR_PRESETS");
    expect(builder).toContain("QR_PRINT_FONT_OPTIONS");
    expect(builder).toContain("Paper tone");
    expect(builder).toContain("Add crop marks");
    expect(builder).toContain("Download preview");
    expect(builder).toContain('import("html2canvas")');
    expect(builder).toContain("beforeunload");
  });

  it("persists validated settings in a tenant-scoped campaign update", () => {
    expect(migration).toContain(
      "add column if not exists print_settings jsonb",
    );
    expect(databaseTypes).toContain("print_settings: Json");
    expect(route).toContain("normalizeQrPrintSettings(body.printSettings)");
    expect(route).toContain('.eq("shop_id", actor.shopId)');
    expect(route).toContain("getActiveBrandForRender");
  });
});
