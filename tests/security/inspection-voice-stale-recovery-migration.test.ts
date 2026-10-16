import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261016030000_settle_stale_inspection_voice_holds.sql",
  ),
  "utf8",
);

describe("stale inspection voice budget recovery migration", () => {
  it("bounds the expiry index to canonical inspection holds", () => {
    const index = migration.slice(0, migration.indexOf("-- A conflicting"));
    expect(index).toContain("and pool = 'voice'");
    expect(index).toContain("and feature = 'openai_realtime_token'");
    expect(index).toContain("and idempotency_key ~ ('^inspection_voice:'");
  });

  it("keeps scheduled recovery private and leaves the shared release RPC untouched", () => {
    expect(migration).not.toContain(
      "create or replace function public.release_stale_ai_budget_holds(",
    );
    expect(migration).not.toContain("perform public.release_stale_ai_budget_holds(");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain(
      "revoke all on function private.reconcile_stale_inspection_voice_holds()\n  from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(");
  });

  it("records uncertainty when the provider receipt is missing", () => {
    expect(migration).toContain("ledger.quota_receipt_id = v_reservation.id");
    expect(migration).toContain("ledger.shop_id = v_shop_id");
    expect(migration).toContain("ledger.event_key = v_reservation.idempotency_key");
    expect(migration).toContain(
      "ledger.endpoint = '/api/openai/inspection-transcription-token'",
    );
    expect(migration).toContain("inspection_voice_provider_outcome_unknown");
    expect(migration).toContain("inspection_transcription_rejected_reconciled");
    expect(migration).toContain("v_shop_id, v_actor_id, pg_catalog.jsonb_build_object(");
    expect(migration).toContain("profile.shop_id = v_shop_id");
    expect(migration).toContain("create table if not exists private.inspection_voice_reconciliation_conflicts");
    expect(migration.match(/not exists \(\s*select 1 from private\.inspection_voice_reconciliation_conflicts quarantine/g))
      .toHaveLength(2);
    expect(migration).toContain("'INSPECTION_VOICE_FALLBACK_LEDGER_CONFLICT'");
    expect(migration).toContain("exception when insufficient_privilege then");
    expect(migration).toContain("v_actor_id := null;");
    expect(migration).not.toContain("'RECORDER_' || SQLSTATE");
    expect(migration).toContain("and ledger.status = 'error'");
    expect(migration).toContain("and ledger.error_code = 'inspection_voice_provider_outcome_unknown'");
    expect(migration).toContain("and ledger.estimated_cost_usd = v_reservation.reserved_usd");
    expect(migration).toContain("from private.inspection_voice_issuance_rates rate");
    expect(migration).toContain("coalesce(v_rate_card_version, 'inspection-issuance-rate-unknown')");
    expect(migration).toContain("on delete cascade");
    expect(migration).toContain("revoke all on private.inspection_voice_reconciliation_conflicts");
  });

  it("settles confirmed closures by duration and unknown calls at the ceiling", () => {
    expect(migration).toContain("v_ledger.operation = 'inspection_transcription_closed'");
    expect(migration).toContain("v_ledger.duration_seconds / 3600, 6");
    expect(migration).toContain("cost_basis = 'actual'");
    expect(migration).toContain("operation = 'inspection_transcription_settled'");
    expect(migration).toContain("INSPECTION_VOICE_CLOSURE_EVIDENCE_INVALID");
    expect(migration).toContain("actual_usd = reservation.reserved_usd");
    expect(migration).toContain("cost_basis = 'reserved_fallback'");
    expect(migration).toContain(
      "operation = 'inspection_transcription_settled_fallback'",
    );
    expect(migration).toContain("status = 'released', actual_usd = 0");
    expect(migration).toContain("'inspection_voice_rejected', 'inspection_voice_pre_provider_failure'");
    expect(migration).toContain("reservation.pool = 'voice'");
    expect(migration).toContain("reservation.feature = 'openai_realtime_token'");
    expect(migration).toContain(
      "committed_usd = budget.committed_usd + v_fallback_usd + v_confirmed_actual_usd",
    );
  });

  it("schedules durable server-side reconciliation", () => {
    expect(migration).toContain(
      "create or replace function private.reconcile_stale_inspection_voice_holds()",
    );
    expect(migration).toContain(
      "'inspection-voice-budget-reconciliation-minute'",
    );
    expect(migration).toContain("'* * * * *'");
    expect(migration).toContain("order by reservation.expires_at, reservation.shop_id\n  limit 1;");
    expect(migration).toContain(
      "$command$select private.reconcile_stale_inspection_voice_holds();$command$",
    );
  });
});
