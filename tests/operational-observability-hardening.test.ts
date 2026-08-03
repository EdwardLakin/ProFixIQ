import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const failureHardening = readFileSync(
  "supabase/migrations/20260802153000_operational_observability_hardening.sql",
  "utf8",
);
const semanticsHardening = readFileSync(
  "supabase/migrations/20260802154501_operational_event_semantics_hardening.sql",
  "utf8",
);

describe("operational observability forward hardening", () => {
  it("keeps durable failures independent from notification maintenance", () => {
    expect(failureHardening).toContain(
      "insert into public.operational_event_failures",
    );
    expect(failureHardening).toContain("begin\n    insert into public.assistant_notifications");
    expect(failureHardening).toContain("exception\n    when others then\n      null;");
    expect(failureHardening).toContain(
      "create or replace function private.resolve_operational_event_failure",
    );
  });

  it("restricts the optional aggregate health RPC to service role", () => {
    expect(failureHardening).toContain(
      "create or replace function public.get_operational_observability_health",
    );
    expect(failureHardening).toContain("security invoker");
    expect(failureHardening).toContain(
      "from public, anon, authenticated",
    );
    expect(failureHardening).toContain("to service_role");
  });

  it("uses transition time and semantic event-scoped idempotency", () => {
    expect(semanticsHardening).toContain(
      "when tg_op = ''UPDATE'' then nullif(v_row ->> ''updated_at''",
    );
    expect(semanticsHardening).toContain("''operational'',");
    expect(semanticsHardening).toContain("tg_table_name");
    expect(semanticsHardening).toContain("coalesce(v_entity_id::text, ''na'')");
    expect(semanticsHardening).toContain("v_event_type");
    expect(semanticsHardening).toContain(
      "select coalesce(p.user_id, p.id), p.role",
    );
  });

  it("does not rewrite the earlier observability migration", () => {
    expect(semanticsHardening).toContain(
      "pg_get_functiondef('private.capture_operational_event()'::regprocedure)",
    );
    expect(semanticsHardening).toContain("postcondition failed");
  });
});
