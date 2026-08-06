import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const billing = read(
  "supabase/migrations/20260806181455_reconcile_production_billing_protections.sql",
);
const fleet = read(
  "supabase/migrations/20260806181502_restore_fleet_owned_unit_enrollment.sql",
);
const aliases = read(
  "supabase/migrations/20260806181508_retire_legacy_bootstrap_schema_aliases.sql",
);
const effects = read(
  "supabase/migrations/20260806181742_reconcile_migration_alias_effects.sql",
);

describe("Supabase migration reconciliation", () => {
  it("promotes the final production billing protections", () => {
    expect(billing).toContain("billing_entitlement_override");
    expect(billing).toContain("billing_grace_until");
    expect(billing).toContain("shops_insert_first_shop_only");
    expect(billing).toContain("profixiq_mark_shop_billing_sync");
    expect(billing).toContain("normalize_client_shop_billing_identity_insert");
    expect(billing).toContain(
      "shop billing, payment, and entitlement fields are server managed",
    );
    expect(billing).not.toContain(
      "new.max_users is distinct from old.max_users",
    );
  });

  it("re-applies Fleet-owned enrollment through a forward migration", () => {
    expect(fleet).toContain("f.shop_id, f.customer_id");
    expect(fleet).toContain(
      "shop_id, customer_id, unit_number, vin, license_plate",
    );
    expect(fleet).toContain(
      "v_vehicle_customer_id is distinct from v_customer_id",
    );
    expect(fleet).toContain("Enroll the unit before assigning a driver");
  });

  it("retires all 17 bootstrap aliases without dropping their data first", () => {
    const retired = [
      "updated_at",
      "email",
      "error",
      "event_type",
      "sg_event_id",
      '"timestamp"',
      "id",
      "due_at",
      "chat_id",
      "invoice_id",
      "payment_method",
      "processor",
      "processor_payment_id",
      "void_note",
      "void_reason",
      "inspection_item_id",
      "menu_item_id",
    ];

    for (const column of retired) {
      expect(aliases).toContain(`drop column if exists ${column}`);
    }
    expect(aliases).toContain("legacy_sg_event_id");
    expect(aliases).toContain("legacy_chat_id");
    expect(aliases).toContain(
      "drop function if exists public.chat_post_message",
    );
    expect(aliases).toContain("legacy_processor_payment_id");
    expect(aliases).toContain("voided_reason = trim(p_reason)");
    expect(aliases).toContain("voided_note = nullif(trim(p_note)");
  });

  it("fills the one non-identical timestamp-alias schema effect", () => {
    expect(effects).toContain("quickbooks_sync_events_entity_type_check");
    expect(effects).toContain("'invoice_version'");
    expect(effects).toContain("to authenticated");
    expect(effects).toContain(
      "canonical agent bridge integration is malformed",
    );
    expect(effects).toContain("noncanonical agent bridge integration remains");
    expect(effects).not.toContain(
      "create table public.agent_bridge_credentials",
    );
  });
});
