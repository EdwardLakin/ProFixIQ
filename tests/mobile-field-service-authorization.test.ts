import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260811191825_make_field_service_authorization_mode_aware.sql",
  "utf8",
);

describe("Field Service mode-aware SQL authorization", () => {
  it("preserves ordinary shop roles while gating mobile Service Visits", () => {
    expect(migration).toContain("v_mode = 'mobile'");
    expect(migration).toContain(
      "public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id)",
    );
    expect(migration).toContain(
      "private.mobile_materialize_visit_work_order_mode_core",
    );
    expect(migration).toContain(
      "private.dispatch_assign_service_visit_mode_core",
    );
    expect(migration).toContain(
      "'mechanic','technician','tech','lead_hand','leadhand','foreman'",
    );
  });

  it("applies the same mobile-mode gate to follow-up RPCs and direct inserts", () => {
    expect(migration).toContain("v_requires_field_access");
    expect(migration).toContain("private.mobile_create_service_followup_mode_core");
    expect(migration).toContain("private.mobile_update_service_followup_mode_core");
    expect(migration).toContain(
      "create or replace function public.mobile_guard_service_followup_insert()",
    );
  });
});
