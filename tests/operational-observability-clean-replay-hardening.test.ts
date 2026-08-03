import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aiSubstrate = readFileSync(
  "supabase/migrations/20260802101400_ai_operating_intelligence_substrate_reconciliation.sql",
  "utf8",
);
const semantics = readFileSync(
  "supabase/migrations/20260802161000_operational_event_semantics_hardening.sql",
  "utf8",
);
const actionIntegrity = readFileSync(
  "supabase/migrations/20260802171440_harden_ai_action_integrity.sql",
  "utf8",
);
const runtimeAuthorization = readFileSync(
  "tests/security/operational-observability.runtime.sql",
  "utf8",
);

describe("operational observability clean-replay hardening", () => {
  it("tracks the AI review-layer substrate before observability depends on it", () => {
    expect(aiSubstrate).toContain(
      "create table if not exists public.ai_evidence_snapshots",
    );
    expect(aiSubstrate).toContain(
      "create table if not exists public.ai_recommendations",
    );
    expect(aiSubstrate).toContain(
      "create table if not exists public.ai_action_previews",
    );
    expect(aiSubstrate).toContain(
      "create table if not exists public.ai_action_approvals",
    );
    expect(aiSubstrate).toContain(
      "create table if not exists public.ai_action_events",
    );
    expect(aiSubstrate).toContain("enable row level security");
    expect(aiSubstrate).toContain("is_shop_member_v2(shop_id)");
  });

  it("uses transition time and semantic event-scoped idempotency", () => {
    expect(semantics).toContain(
      "when tg_op = ''UPDATE'' then nullif(v_row ->> ''updated_at''",
    );
    expect(semantics).toContain("''operational'',");
    expect(semantics).toContain("tg_table_name");
    expect(semantics).toContain("coalesce(v_entity_id::text, ''na'')");
    expect(semantics).toContain("v_event_type");
    expect(semantics).toContain(
      "select coalesce(p.user_id, p.id), p.role",
    );
    expect(actionIntegrity).toContain(
      "Operational event transition chronology postcondition failed",
    );
    const chronologyReplacement = actionIntegrity.slice(
      actionIntegrity.indexOf("v_new text :="),
      actionIntegrity.indexOf("begin", actionIntegrity.indexOf("v_new text :=")),
    );
    expect(chronologyReplacement.indexOf("when tg_op = ''UPDATE'' then nullif(v_row ->> ''updated_at''"))
      .toBeLessThan(chronologyReplacement.indexOf("nullif(v_row ->> ''sent_at''"));
  });

  it("keeps approvals and AI audit events behind trusted server mutations", () => {
    expect(actionIntegrity).toContain(
      "drop policy if exists ai_action_approvals_shop_update",
    );
    expect(actionIntegrity).toContain(
      "drop policy if exists ai_action_events_shop_insert",
    );
    expect(actionIntegrity).toContain(
      "idx_ai_action_approvals_one_pending_per_preview",
    );
    expect(actionIntegrity).toContain("private.enforce_ai_record_tenant_links()");
    expect(actionIntegrity).toContain("evidence_snapshot_ids");
  });

  it("normalizes dedicated punch events to the same actor convention", () => {
    expect(semantics).toContain(
      "create or replace function private.capture_operational_punch_event()",
    );
    expect(semantics).toContain(
      "coalesce(p.user_id, new.user_id, auth.uid(), p.id)",
    );
    expect(semantics).toContain("'database_trigger:punch_events'");
    expect(semantics).toContain("'auth_user_id', v_actor_user_id");
  });

  it("enforces the direct database authorization boundary", () => {
    expect(runtimeAuthorization).toContain(
      "operational_events must have RLS enabled",
    );
    expect(runtimeAuthorization).toContain(
      "operational_events must remain append-only to authenticated users",
    );
    expect(runtimeAuthorization).toContain(
      "unified_events must use security_invoker",
    );
    expect(runtimeAuthorization).toContain(
      "aggregate observability health RPC must remain service-role only",
    );
    expect(runtimeAuthorization).toContain(
      "authenticated users must not invoke append_operational_event directly",
    );
  });
});
