import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260726222401_retire_legacy_inspection_session_writes.sql",
  "utf8",
);
const optimizer = readFileSync(
  "features/optimization/server/buildOptimizationOpportunities.ts",
  "utf8",
);

describe("canonical inspection completion", () => {
  it("removes the bidirectional legacy session trigger chain", () => {
    expect(migration).toContain(
      "drop trigger if exists trg_enforce_inspection_session_consistency_on_inspections",
    );
    expect(migration).toContain(
      "drop trigger if exists trg_enforce_inspection_session_consistency_on_sessions",
    );
    expect(migration).toContain(
      "drop trigger if exists trg_sync_inspections_from_sessions",
    );
    expect(migration).toContain(
      "drop function if exists\n  public.sync_inspections_from_inspection_sessions()",
    );
  });

  it("stops creating legacy sessions for new inspection lines", () => {
    expect(migration).toContain(
      "drop trigger if exists trg_wol_autocreate_inspection_ins",
    );
    expect(migration).toContain(
      "drop trigger if exists trg_wol_autocreate_inspection_upd",
    );
    expect(migration).toContain(
      "drop trigger if exists trg_wol_create_inspection_session_before",
    );
    expect(migration).toContain(
      "drop trigger if exists trg_wol_link_inspection_session_after",
    );
    expect(migration).toContain(
      "work_order_lines_inspection_or_template_requires_session_chk",
    );
    expect(migration).toContain(
      "revoke insert, update on public.inspection_sessions",
    );
    expect(migration).toContain("from anon, authenticated, service_role");
  });

  it("finalizes only the canonical inspection snapshot and revision", () => {
    const finalize = migration.slice(
      migration.indexOf(
        "create or replace function public.finalize_inspection_pdf_atomic",
      ),
      migration.indexOf(
        "revoke all on function public.finalize_inspection_pdf_atomic",
      ),
    );

    expect(finalize).toContain("and i.is_canonical");
    expect(finalize).toContain("coalesce(i.sync_revision, 0)");
    expect(finalize).toContain(
      "p_expected_sync_revision <> v_revision",
    );
    expect(finalize).toContain("and sync_revision = v_revision");
    expect(finalize).not.toContain("inspection_sessions");
  });

  it("preserves historical rows while removing them from live decisions", () => {
    expect(migration).not.toContain("drop table public.inspection_sessions");
    expect(migration).not.toContain("delete from public.inspection_sessions");
    expect(optimizer).toContain('| "job_type"');
    expect(optimizer).toContain(
      'slugify(line.job_type ?? "") === "inspection"',
    );
    expect(optimizer).not.toContain('| "inspection_session_id"');
    expect(optimizer).not.toContain(
      "inspection_template_id, inspection_session_id, created_at",
    );
  });
});
