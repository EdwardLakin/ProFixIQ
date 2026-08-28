import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260828154913_repair_finalized_inspection_report_attachment.sql",
  "utf8",
);
const runtime = readFileSync(
  "tests/security/inspection-finalized-report-attachment.runtime.sql",
  "utf8",
);
const cleanReplay = readFileSync(
  ".github/workflows/supabase-clean-replay-audit.yml",
  "utf8",
);

describe("finalized inspection report attachment repair", () => {
  it("admits only the existing signer-bound report metadata update", () => {
    expect(migration).toContain(
      "create or replace function public.attach_signed_inspection_pdf_atomic",
    );
    expect(migration).toContain("v_auth_user_id <> p_actor_user_id");
    expect(migration).toContain(
      "Signing actor does not own current inspection evidence",
    );
    expect(migration).toContain("INSPECTION_REPORT_PATH_MISMATCH");
    expect(migration).toContain("INSPECTION_REPORT_HASH_INVALID");
    expect(migration).toContain(
      "perform set_config('profixiq.inspection_sign', 'on', true);",
    );
    expect(migration).toContain("coalesce(v_previous_sign_transition, '')");
    expect(migration).not.toContain(
      "create or replace function public.prevent_finalized_inspection_mutation",
    );
    expect(migration).not.toContain("create trigger");
  });

  it("runs authorization, immutability, and retry behavior during clean replay", () => {
    expect(runtime).toContain(
      "Initial finalized report attachment was not recorded",
    );
    expect(runtime).toContain(
      "Exact report attachment retry was not idempotent",
    );
    expect(runtime).toContain(
      "Finalized inspection accepted a non-report mutation",
    );
    expect(runtime).toContain(
      "Same-Shop non-signer attached finalized report evidence",
    );
    expect(runtime).toContain(
      "Cross-Shop actor attached finalized report evidence",
    );
    expect(cleanReplay).toContain(
      "-f tests/security/inspection-finalized-report-attachment.runtime.sql",
    );
  });
});
