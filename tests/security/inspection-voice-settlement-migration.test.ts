import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261016024000_inspection_voice_usage_settlement.sql",
  "utf8",
);
const staleGuard = readFileSync(
  "supabase/migrations/20261016023000_inspection_voice_budget_compat.sql",
  "utf8",
);

const noCallRecovery = readFileSync(
  "supabase/migrations/20261016213917_inspection_voice_pre_provider_recovery.sql", "utf8",
);

const errorReceiptIndex = readFileSync(
  "supabase/migrations/20261016214607_inspection_voice_error_receipt_index.sql", "utf8",
);

const actorKeyGuard = readFileSync(
  "supabase/migrations/20261016220550_inspection_voice_actor_operation_guard.sql", "utf8",
);

describe("inspection voice settlement migration", () => {
  it("adds only service-role RPCs with a locked-down execution context", () => {
    for (const signature of [
      "public.record_inspection_voice_issuance_rate(uuid, uuid, uuid, text)",
      "public.get_inspection_voice_session_receipt(uuid, uuid, text)",
      "public.get_inspection_voice_session_receipt_for_actor(uuid, text)",
      "public.confirm_inspection_voice_closure(uuid, uuid, text, text, timestamptz)",
      "public.settle_inspection_voice_usage(uuid, uuid, text, text, numeric, numeric)",
    ]) {
      expect(migration).toContain(`alter function ${signature}\n  owner to postgres`);
      expect(migration).toContain(`revoke all on function ${signature}\n  from public, anon, authenticated, service_role`);
      expect(migration).toContain(`grant execute on function ${signature}\n  to service_role`);
    }
    expect(migration.match(/security definer\s+set search_path = ''/g)).toHaveLength(5);
    expect(migration).toContain("reservation_id uuid primary key references private.ai_budget_reservations(id) on delete cascade");
    expect(migration).toContain("revoke all on private.inspection_voice_issuance_rates");
  });

  it("binds reports to the issued tenant, actor, feature, model, and budget hold", () => {
    expect(migration.match(/'rateCardVersion', v_row.rate_card_version/g)).toHaveLength(2);
    expect(migration.match(/'reservedCostUsd', v_row.estimated_cost_usd/g)).toHaveLength(2);
    expect(migration).toContain("ledger.shop_id = p_shop_id");
    expect(migration).toContain("ledger.user_id = p_user_id");
    expect(migration).toContain("ledger.feature = 'openai_realtime_token'");
    expect(migration).toContain("ledger.endpoint = '/api/openai/inspection-transcription-token'");
    expect(migration).not.toContain("and ledger.operation in (");
    expect(migration).toContain("v_row.model is distinct from p_model");
    expect(migration).toContain("reservation.actor_id = p_user_id");
    expect(migration).toContain("reservation.pool = 'voice'");
    expect(migration).toContain("reservation.idempotency_key = v_event_key");
    expect(migration).toContain("reservation.actor_id = p_user_id");
    expect(migration).toContain("rejected.error_code = 'inspection_voice_rejected'");
    expect(migration).toContain("'operation', 'inspection_transcription_rejected'");
  });

  it("locks and atomically settles the canonical ledger with an idempotent budget commit", () => {
    expect(migration.match(/pg_catalog\.hashtextextended\('ai-budget:' \|\| p_shop_id::text, 0\)/g))
      .toHaveLength(2);
    expect(migration).toContain("for update;");
    expect(migration).toContain(
      "'inspection_transcription_settled_fallback'",
    );
    expect(migration).toContain("if v_row.operation in (");
    expect(migration).toContain("public.commit_ai_budget(");
    expect(migration).toContain("operation = 'inspection_transcription_settled'");
    expect(migration).toMatch(/begin;[\s\S]*update private\.ai_usage_ledger[\s\S]*commit;\s*$/);
  });

  it("claims actor/key credentials in the inspection issuance receipt before provider creation", () => {
    expect(actorKeyGuard).toContain("on private.inspection_voice_issuance_rates (actor_id, usage_key)");
    expect(actorKeyGuard).toContain("create unique index inspection_voice_issuance_rates_actor_key_idx");
    expect(actorKeyGuard).toContain("and reservation.actor_id = p_actor_id");
    expect(actorKeyGuard).toContain("on conflict do nothing;");
    expect(actorKeyGuard).toContain("and rate.actor_id = p_actor_id");
    expect(actorKeyGuard).not.toContain("alter table private.ai_budget_reservations");
  });

  it("indexes actor-bound errors independently of the existing successful-call lookup", () => {
    expect(errorReceiptIndex).toContain("create index if not exists idx_ai_usage_inspection_actor_error_event");
    expect(errorReceiptIndex).toContain("on private.ai_usage_ledger (user_id, event_key)");
    expect(errorReceiptIndex).toContain("and status = 'error'");
    expect(errorReceiptIndex).not.toContain("drop index");
  });

  it("recognizes only durable rejected or pre-provider receipts in the forward recovery repair", () => {
    expect(noCallRecovery).toContain("create or replace function public.get_inspection_voice_session_receipt_for_actor(");
    expect(noCallRecovery).toContain("'inspection_voice_rejected', 'inspection_voice_pre_provider_failure'");
    expect(noCallRecovery).toContain("reservation.actor_id = p_user_id");
    expect(noCallRecovery).toContain("reservation.shop_id = rejected.shop_id");
    expect(noCallRecovery).toContain("rejected.event_key = reservation.idempotency_key || ':error'");
    expect(noCallRecovery).toContain("revoke all on function public.get_inspection_voice_session_receipt_for_actor(uuid, text)");
    expect(noCallRecovery).not.toContain("'inspection_voice_timeout'");
  });

  it("conservatively adjudicates uncertain inspection holds in the preceding compatibility PR", () => {
    expect(staleGuard).toContain("reservation.idempotency_key ~ ('^inspection_voice:'");
    expect(staleGuard).toContain("and not (\n        reservation.pool = 'voice'");
    expect(staleGuard).toContain("':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')");
    expect(staleGuard).toContain("inspection_voice_provider_outcome_unknown");
  });
});
