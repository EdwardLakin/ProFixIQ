import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260723010000_canonical_inspection_source.sql",
);
const saveRoute = read("app/api/inspections/save/route.ts");
const loadRoute = read("app/api/inspections/load/route.ts");
const autosave = read("features/inspections/hooks/useInspectionAutosave.ts");
const runner = read("features/inspections/screens/GenericInspectionScreen.tsx");
const findings = read("features/inspections/lib/inspection/findings/page.tsx");

describe("canonical inspection source contract", () => {
  it("persists progress through one versioned canonical row", () => {
    expect(migration).toContain("is_canonical boolean not null default false");
    expect(migration).toContain("sync_revision bigint not null default 0");
    expect(migration).toContain("inspections_one_canonical_per_line_idx");
    expect(saveRoute).toContain('"save_inspection_progress_v3_atomic"');
    expect(loadRoute).toContain('.eq("is_canonical", true)');
  });

  it("keeps the historical mirror read-only and out of realtime", () => {
    const writer = migration.slice(
      migration.indexOf("save_inspection_progress_v3_atomic"),
      migration.indexOf("revoke all on function"),
    );
    expect(writer).not.toContain("inspection_sessions");
    expect(migration).toContain(
      "revoke insert, update, delete on public.inspection_sessions",
    );
    expect(migration).toContain(
      "alter publication supabase_realtime drop table public.inspection_sessions",
    );
    expect(autosave).not.toContain('table: "inspection_sessions"');
  });

  it("uses IndexedDB only as device recovery, never browser storage as truth", () => {
    expect(runner).toContain("getInspectionOfflineDraft");
    expect(runner).toContain("saveInspectionOfflineDraft");
    expect(findings).toContain("getInspectionOfflineDraft");
    expect(findings).toContain("saveInspectionOfflineDraft");
    expect(runner).not.toContain("localStorage");
    expect(findings).not.toContain("localStorage");
    expect(runner).not.toContain("inspection:draft-updated");
    expect(findings).not.toContain("inspection:draft-updated");
  });
});
