import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260721160000_inspection_live_autosave_signature_hardening.sql",
);
const loadRoute = read("app/api/inspections/load/route.ts");
const finalizeRoute = read("app/api/inspections/finalize/pdf/route.ts");
const reopenRoute = read("app/api/inspections/reopen/route.ts");

describe("inspection release-blocker hardening", () => {
  it("authorizes save retries before reading SECURITY DEFINER idempotency data", () => {
    const saveFunction = migration.slice(
      migration.indexOf(
        "create or replace function public.save_inspection_progress_atomic",
      ),
      migration.indexOf(
        "create or replace function public.finalize_inspection_pdf_atomic",
      ),
    );
    const membershipCheck = saveFunction.indexOf(
      "Actor is not a member of this shop.",
    );
    const lineCheck = saveFunction.indexOf(
      "Work-order line not found for shop.",
    );
    const idempotencyRead = saveFunction.indexOf("select mok.result");

    expect(membershipCheck).toBeGreaterThan(-1);
    expect(lineCheck).toBeGreaterThan(membershipCheck);
    expect(idempotencyRead).toBeGreaterThan(lineCheck);
    expect(saveFunction).toContain("v_now timestamptz := clock_timestamp()");
    expect(saveFunction).not.toContain(
      "v_now timestamptz := coalesce(p_at, now())",
    );
  });

  it("publishes finalization through a locked revision compare-and-swap", () => {
    const finalizeFunction = migration.slice(
      migration.indexOf(
        "create or replace function public.finalize_inspection_pdf_atomic",
      ),
      migration.indexOf("create or replace function public.sign_inspection"),
    );

    expect(finalizeFunction).toContain("p_expected_sync_revision bigint");
    expect(finalizeFunction).toContain("for update");
    expect(finalizeFunction).toContain(
      "p_expected_sync_revision <> v_revision",
    );
    expect(finalizeFunction).toContain(
      "order by s.updated_at desc nulls last, s.id desc",
    );
    expect(finalizeFunction).toContain(
      "Finalized PDF path does not match the inspection snapshot.",
    );
    expect(finalizeFunction).toContain(") to service_role;");
    expect(finalizeFunction).not.toContain(") to authenticated, service_role;");
    expect(finalizeRoute).toContain('"finalize_inspection_pdf_atomic"');
    expect(finalizeRoute).toContain(
      "storageSupabase as unknown as FinalizeRpcClient",
    );
    expect(finalizeRoute).toContain(
      "p_expected_sync_revision: expectedSyncRevision",
    );
    expect(finalizeRoute).not.toContain('.eq("updated_at", insp.updated_at)');
  });

  it("keeps finalized PDF objects immutable and content addressed", () => {
    expect(finalizeRoute).toContain('createHash("sha256")');
    expect(finalizeRoute).toContain("_${pdfHash}.pdf");
    expect(finalizeRoute).toContain("upsert: false");
    expect(finalizeRoute).not.toContain("upsert: true");
  });

  it("uses the explicitly marked canonical row for finalization", () => {
    expect(finalizeRoute).toContain('.eq("is_canonical", true)');
    expect(finalizeRoute).not.toContain('.order("updated_at"');
    expect(finalizeRoute).not.toContain('.order("id"');
  });

  it("never falls back to a non-canonical inspection row", () => {
    expect(loadRoute).toContain('.eq("is_canonical", true)');
    expect(loadRoute).not.toContain('.from("inspection_sessions")');
  });

  it("keeps role and tenant membership server-managed", () => {
    expect(migration).toContain("prevent_profile_authorization_self_write");
    expect(migration).toContain(
      "revoke update on table public.profiles from authenticated",
    );
    expect(migration).toContain(
      "Profile role and shop membership are server-managed.",
    );
    expect(migration).toContain("new.role is distinct from old.role");
    expect(migration).toContain("new.shop_id is distinct from old.shop_id");
  });

  it("makes signature evidence append-only and prevents parent cascades", () => {
    expect(migration).toContain("on delete restrict");
    expect(migration).toContain(
      "prevent_inspection_signature_evidence_mutation",
    );
    expect(migration).toContain("prevent_finalized_inspection_mutation");
    expect(migration).toContain("Finalized inspection evidence is immutable");
  });

  it("requires a real immutable storage object for technician signing", () => {
    const signingFunction = migration.slice(
      migration.indexOf("create or replace function public.sign_inspection"),
      migration.indexOf(
        "create or replace function public.prevent_inspection_signature_evidence_mutation",
      ),
    );
    expect(signingFunction).toContain("from storage.objects o");
    expect(signingFunction).toContain("o.bucket_id = 'signatures'");
    expect(signingFunction).toContain("o.name = v_effective_path");
  });

  it("reopens atomically with a database-clock signing generation", () => {
    const reopenFunction = migration.slice(
      migration.indexOf("create or replace function public.reopen_inspection"),
      migration.indexOf("create or replace function public.sign_inspection"),
    );
    const signingFunction = migration.slice(
      migration.indexOf("create or replace function public.sign_inspection"),
    );

    expect(reopenFunction).toContain("for update");
    expect(reopenFunction).toContain("clock_timestamp()");
    expect(reopenFunction).toContain("v_next_cycle := v_signing_cycle + 1");
    expect(reopenFunction).toContain("signing_cycle = v_next_cycle");
    expect(signingFunction).toContain("s.signing_cycle = v_signing_cycle");
    expect(signingFunction).toContain(
      "s.signed_sync_revision = v_inspection_revision",
    );
    expect(signingFunction).not.toContain(
      "s.signed_at >= v_inspection_reopened_at",
    );
    expect(reopenRoute).toContain('"reopen_inspection",');
    expect(reopenRoute).not.toContain('.from("inspections")');
    expect(reopenRoute).not.toContain("new Date().toISOString()");
  });
});
