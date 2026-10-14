import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MarketingMediaAssetSchema,
  MarketingMediaUpdateSchema,
} from "@/features/marketing/media/types";

const read = (path: string) => readFileSync(path, "utf8");
const migrationPath =
  "supabase/migrations/20261014121000_marketing_page_media_storage.sql";

describe("Ops marketing media CMS", () => {
  it("provisions isolated private content and public media storage", () => {
    const migration = read(migrationPath);
    expect(migration).toContain("'marketing-page-content'");
    expect(migration).toContain("'marketing-page-media'");
    expect(migration).toContain("false,\n  1048576");
    expect(migration).toContain("true,\n  52428800");
    expect(migration).toContain("'video/mp4'");
    expect(migration).toContain("'video/webm'");
    expect(migration).not.toMatch(/create\s+table\s+public\./i);
    expect(migration).not.toMatch(/alter\s+table\s+public\./i);
  });

  it("keeps upload and page mutations behind canonical Ops authorization", () => {
    const mediaRoute = read("app/api/ops/marketing/media/route.ts");
    const pageRoute = read("app/api/ops/marketing/pages/[pageKey]/route.ts");

    for (const source of [mediaRoute, pageRoute]) {
      expect(source).toContain("await requireOpsOperatorApiAccess()");
    }
    expect(mediaRoute).toContain("MAX_MEDIA_BYTES = 50 * 1024 * 1024");
    expect(mediaRoute).not.toContain('"image/svg+xml"');
  });

  it("uses signed direct uploads so large reels do not traverse the Vercel function body", () => {
    const mediaRoute = read("app/api/ops/marketing/media/route.ts");
    const editor = read("features/ops/components/OpsMarketingMediaManager.tsx");

    expect(mediaRoute).toContain('payload.action === "prepare-upload"');
    expect(mediaRoute).toContain("createSignedUploadUrl(storagePath)");
    expect(mediaRoute).toContain('payload.action === "finalize-upload"');
    expect(mediaRoute).not.toContain("request.formData()");
    expect(mediaRoute).not.toContain("file.arrayBuffer()");
    expect(editor).toContain("uploadToSignedUrl");
    expect(editor).toContain("Large files upload directly to media storage.");
  });

  it("requires accessible metadata and accepts only trusted library asset ids for draft mutations", () => {
    const validAsset = {
      id: "62d7aa09-0c10-49af-bd5d-5d6790e04d1f",
      kind: "image",
      url: "https://example.com/work-order.webp",
      storagePath: "uploads/2026/10/work-order.webp",
      filename: "work-order.webp",
      contentType: "image/webp",
      alt: "ProFixIQ work order workspace",
      caption: null,
      createdAt: "2026-10-14T18:00:00.000Z",
    };

    expect(MarketingMediaAssetSchema.safeParse(validAsset).success).toBe(true);
    expect(
      MarketingMediaAssetSchema.safeParse({ ...validAsset, alt: "" }).success,
    ).toBe(false);
    expect(
      MarketingMediaUpdateSchema.safeParse({
        slotKey: "hero",
        action: "save-draft",
        assetId: validAsset.id,
      }).success,
    ).toBe(true);
    expect(
      MarketingMediaUpdateSchema.safeParse({
        slotKey: "hero",
        action: "save-draft",
        media: validAsset,
      }).success,
    ).toBe(false);

    const pageRoute = read("app/api/ops/marketing/pages/[pageKey]/route.ts");
    expect(pageRoute).toContain("getMarketingMediaAsset(assetId)");
    expect(pageRoute).not.toContain("parsed.data.media");
  });

  it("fails closed on stored read errors and isolates draft from published writes", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain("isStorageObjectMissing(error)");
    expect(server).toContain("throw new Error(`Marketing media read failed");
    expect(server).toContain("draft.json");
    expect(server).toContain("published.json");
    expect(server).toContain("saveMarketingPageMediaDraft");
    expect(server).toContain("publishMarketingPageMediaDraft");
  });

  it("paginates the complete reusable media library", () => {
    const mediaRoute = read("app/api/ops/marketing/media/route.ts");
    expect(mediaRoute).toContain("for (let offset = 0; ; offset += PAGE_SIZE)");
    expect(mediaRoute).toContain("offset,");
    expect(mediaRoute).toContain("if (page.length < PAGE_SIZE) break;");
  });

  it("exposes only published slot values to public callers and enables CDN caching", () => {
    const server = read("features/marketing/media/server.ts");
    const publicRoute = read("app/api/public/marketing/pages/[pageKey]/route.ts");
    const renderer = read("features/marketing/components/ManagedHomepageHeroMedia.tsx");

    expect(server).toContain("slot.published");
    expect(server).not.toContain("slot.draft?.url");
    expect(publicRoute).toContain("getPublishedMarketingPageMedia");
    expect(publicRoute).not.toContain("getMarketingPageMediaDocument");
    expect(publicRoute).toContain('"Vercel-CDN-Cache-Control"');
    expect(publicRoute).toContain("s-maxage=60");
    expect(renderer).not.toContain('cache: "no-store"');
  });

  it("wires the homepage hero to published managed media with a built-in fallback and pausable video", () => {
    const hero = read("features/shared/components/ui/LandingHero.tsx");
    const renderer = read(
      "features/marketing/components/ManagedHomepageHeroMedia.tsx",
    );
    const publicMedia = read(
      "features/marketing/components/publicMarketingMedia.ts",
    );

    expect(hero).toContain("<ManagedHomepageHeroMedia />");
    expect(hero).toContain("Work order EL000284");
    expect(renderer).toContain('getPublishedMarketingSlots("home")');
    expect(renderer).toContain("slots.hero");
    expect(publicMedia).toContain(
      "fetch(`/api/public/marketing/pages/${pageKey}`)",
    );
    expect(renderer).toContain("autoPlay");
    expect(renderer).toContain("controls");
    expect(renderer).toContain("object-contain object-top");
  });

  it("provides drag/drop library, accurate preview, saved-draft publish guard, and publish controls in Ops", () => {
    const editor = read("features/ops/components/OpsMarketingMediaManager.tsx");
    const shell = read("features/ops/components/OpsShell.tsx");

    expect(editor).toContain("Drop media here or choose a file");
    expect(editor).toContain("Media library");
    expect(editor).toContain("Save draft");
    expect(editor).toContain("Publish");
    expect(editor).toContain("View live page");
    expect(editor).toContain("selectedMatchesDraft");
    expect(editor).toContain("!selectedMatchesDraft");
    expect(editor).toContain("object-contain object-top");
    expect(shell).toContain(
      '{ href: "/ops/marketing", label: "Landing Media", icon: LayoutTemplate }',
    );
  });
});
