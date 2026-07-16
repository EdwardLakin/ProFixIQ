import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("installable offline foundation", () => {
  it("publishes a standalone manifest with install icons", () => {
    const source = read("app/manifest.ts");
    expect(source).toContain('display: "standalone"');
    expect(source).toContain('start_url: "/launch?source=pwa"');
    expect(source).toContain("icon-maskable-512.png");
  });

  it("never runtime-caches authenticated API responses", () => {
    const source = read("app/sw.ts");
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).toContain("handler: new NetworkOnly()");
    expect(source).not.toContain("profixiq-api");
  });

  it("stores queues, snapshots, and blobs in shop-scoped IndexedDB stores", () => {
    const source = read("features/shared/lib/offline/database.ts");
    expect(source).toContain("[userId+shopId]");
    expect(source).toContain("mutations:");
    expect(source).toContain("snapshots:");
    expect(source).toContain("blobs:");
  });

  it("registers one replay map for every supported mobile mutation", () => {
    const source = read("features/shared/lib/offline/replay.ts");
    for (const action of [
      "inspection:save-session",
      "shift:punch-event",
      "update_work_order_line_notes",
      "upload_job_photo",
      "save_story_draft",
      "job:punch-transition",
    ]) {
      expect(source).toContain(action);
    }
  });
});
