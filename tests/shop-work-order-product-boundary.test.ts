import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20260831143918_enforce_shop_work_order_product_boundary.sql";
const RUNTIME = "tests/security/shop-work-order-product-boundary.runtime.sql";
const CLEAN_REPLAY = ".github/workflows/supabase-clean-replay-audit.yml";
const TYPES = "features/shared/types/types/supabase.ts";

describe("Shop Work Order product boundary", () => {
  it("keeps the Work Order status constraint aligned with canonical lifecycle writers", async () => {
    const source = await readFile(MIGRATION, "utf8");

    expect(source).toContain(
      "drop constraint if exists work_orders_status_check",
    );
    expect(source).toContain("add constraint work_orders_status_check");
    expect(source).toContain("'ready_to_invoice'");
    expect(source).toContain("'invoiced'");
    expect(source).toContain("'cancelled'");
    expect(source).toMatch(
      /add constraint work_orders_status_check[\s\S]+?\) not valid;/,
    );
  });

  it("binds Shop access to the current staff actor and canonical entitlement", async () => {
    const source = await readFile(MIGRATION, "utf8");

    expect(source).toContain(
      "public.workspace_actor_is_staff_for_shop(p_shop_id)",
    );
    expect(source).toContain(
      "public.profixiq_shop_has_product_access(p_shop_id, 'shop')",
    );
    expect(source).toContain("auth.uid() is not null");
    expect(source).toContain(
      "create or replace function public.profixiq_shop_has_product_access",
    );
    expect(source).toContain(
      "shop.billing_entitlement_override in ('active', 'internal_demo')",
    );
    expect(source).toContain(
      "shop.billing_entitlement_override in ('read_only', 'suspended')",
    );
    expect(source).toContain("shop.billing_grace_until > now()");
    expect(source).toContain(
      "shop.subscription_package is null\n        and shop.stripe_pricing_model <> 'product_packages_v1'",
    );
    expect(source).toContain(
      "shop.subscription_package in ('shop_operations', 'complete_operations')",
    );
    expect(source).toContain(
      "shop.subscription_package in ('field_service', 'complete_operations')",
    );
    expect(source).toContain(
      "shop.subscription_package in ('fleet_maintenance', 'complete_operations')",
    );
  });

  it("preserves only relationship-scoped Field, Fleet, and Portal reads", async () => {
    const source = await readFile(MIGRATION, "utf8");
    const runtime = await readFile(RUNTIME, "utf8");

    expect(source).toContain("visit.mode = 'mobile'");
    expect(source).toContain(
      "visit.assigned_user_id = public.dispatch_actor_profile_id",
    );
    expect(source).toContain(
      "public.dispatch_can_manage(p_shop_id, auth.uid())",
    );
    expect(source).toContain("profile.id = member.user_id");
    expect(source).not.toContain(
      "profile.id = member.user_id\n           and profile.shop_id = member.shop_id",
    );
    expect(source).toContain(
      "profile.id = auth.uid() or profile.user_id = auth.uid()",
    );
    expect(source).toContain("public.profixiq_fleet_has_product_access");
    expect(source).toContain("public.profixiq_is_portal_customer_for");
    expect(source).toContain("service_request.work_order_id = p_work_order_id");
    expect(source).toContain(
      "work_order.source_fleet_service_request_id = service_request.id",
    );
    expect(runtime).toContain("insert into public.fleet_vehicles");
    expect(runtime).toContain(
      "'Product Fleet', 'Product Fleet', 10, 'fleet_maintenance'",
    );
    expect(runtime).toContain("Product Complete Fleet Request");
  });

  it("adds restrictive read and write gates to every Work Order core relation", async () => {
    const source = await readFile(MIGRATION, "utf8");
    const tables = [
      "work_orders",
      "work_order_lines",
      "work_order_quote_lines",
      "work_order_line_technicians",
    ];
    const commands = ["select", "insert", "update", "delete"];

    for (const table of tables) {
      for (const command of commands) {
        expect(source).toContain(
          `create policy ${table}_product_${command}_boundary`,
        );
      }
    }

    expect(source.match(/as restrictive/g)).toHaveLength(27);
    expect(source).toContain(
      "public.profixiq_current_actor_has_shop_product_access(shop_id)",
    );
  });

  it("composes permissive Field and Fleet relationship reads with restrictive product gates", async () => {
    const source = await readFile(MIGRATION, "utf8");

    for (const table of [
      "work_orders",
      "work_order_lines",
      "work_order_quote_lines",
      "work_order_line_technicians",
    ]) {
      expect(source).toContain(
        `create policy ${table}_product_relationship_select`,
      );
    }

    expect(source).toContain(
      "private.workspace_is_shop_staff_role(profile.role::text)",
    );
    expect(source).toContain(
      "private.profixiq_current_actor_has_field_work_order_access",
    );
    expect(source).toContain(
      "private.profixiq_current_actor_has_fleet_work_order_access",
    );
    expect(source).toMatch(
      /create policy work_orders_estimate_select[\s\S]+?can_select_estimate_work_order[\s\S]+?profixiq_current_actor_has_field_work_order_access[\s\S]+?profixiq_current_actor_has_fleet_work_order_access[\s\S]+?\);/,
    );
    expect(source).toMatch(
      /create policy work_order_quote_lines_estimate_select[\s\S]+?can_select_estimate_quote_line[\s\S]+?profixiq_current_actor_has_field_work_order_access[\s\S]+?profixiq_current_actor_has_fleet_work_order_access[\s\S]+?\);/,
    );
  });

  it("product-scopes canonical media and grants only mutation-authorized job-photo uploads", async () => {
    const source = await readFile(MIGRATION, "utf8");

    for (const command of ["select", "insert", "update", "delete"]) {
      expect(source).toContain(
        `create policy work_order_media_product_${command}_boundary`,
      );
      expect(source).toContain(
        `create policy job_photos_product_${command}_boundary`,
      );
    }

    expect(source).toContain("as restrictive\nfor insert");
    expect(source).toContain("bucket_id <> 'job-photos'");
    expect(source).toContain(
      "private.job_photo_object_has_product_access(name)",
    );
    expect(source).toContain(
      "create policy job_photos_product_authorized_select",
    );
    expect(source).toContain(
      "create policy job_photos_product_authorized_insert",
    );
    expect(source).toContain(
      "create policy job_photos_product_authorized_update",
    );
    expect(source).toContain(
      "private.job_photo_object_has_mutation_access(name)",
    );
    expect(source).toMatch(
      /create policy job_photos_product_update_boundary[\s\S]+private\.job_photo_object_has_mutation_access\(name\)[\s\S]+with check \([\s\S]+private\.job_photo_object_has_mutation_access\(name\)/,
    );
    expect(source).not.toContain(
      "create policy job_photos_product_relationship_insert",
    );
    expect(source).not.toContain(
      "create policy work_order_media_product_relationship_insert",
    );
    expect(source).toContain(
      "create policy work_order_media_annotations_product_select_boundary",
    );
    expect(source).toContain(
      "create policy work_order_media_annotations_product_relationship_select",
    );
  });

  it("wraps authenticated definer entry points and keeps implementation cores private", async () => {
    const source = await readFile(MIGRATION, "utf8");

    for (const core of [
      "save_work_order_media_annotation_product_core",
      "create_work_order_with_custom_id_product_core",
      "work_order_delete_draft_product_core",
      "mark_work_order_ready_product_core",
      "materialize_offline_work_order_draft_product_core",
      "assign_work_order_line_technician_product_core",
      "get_work_order_assignments_product_core",
      "convert_owned_fleet_request_work_order_product_core",
      "convert_fleet_request_work_order_product_core",
      "apply_shop_quote_decision_product_core",
      "parts_void_work_order_line_product_core",
      "apply_job_punch_transition_product_core",
      "apply_offline_line_mutation_product_core",
      "parts_attach_inventory_to_request_item_product_core",
      "parts_create_and_attach_inventory_product_core",
      "import_inspection_quote_package_product_core",
    ]) {
      expect(source).toContain(`set schema private`);
      expect(source).toContain(`private.${core}`);
      expect(source).toContain(`revoke all on function private.${core}`);
    }

    expect(source).toContain("Shop product access is required.");
    expect(source).toContain("Work Order product access is required.");
    expect(source).toContain("SHOP_QUOTE_DECISION_OPERATION_CONFLICT");
    expect(source).toContain("PARTS_VOID_OPERATION_CONFLICT");
    expect(source).toContain("Line void actor mismatch.");
    expect(source).toContain(
      "from private.create_work_order_with_custom_id_product_core(",
    );
    expect(source).toContain(
      "create or replace function private.materialize_offline_work_order_draft_product_core",
    );
    expect(source).toContain(
      "extensions.digest(coalesce(p_payload, '{}'::jsonb)::text, 'sha256')",
    );
    expect(source).toContain("v_line_no := v_line_no + 1;");
    expect(source).not.toContain("jsonb_object_length(v_line_map)");
    expect(source).toContain(
      "create or replace function private.work_order_has_supplier_history",
    );
    expect(source).toContain("from public.purchase_orders purchase_order");
    expect(source).toContain(
      "from public.parts_supplier_quote_requests quote_request",
    );
    expect(source).toContain(
      "pg_catalog.to_regclass('public.supplier_orders')",
    );
    expect(source).toContain(
      "private.work_order_has_supplier_history(\n    p_shop_id,",
    );
    expect(source).toContain(
      "create or replace function private.mobile_materialize_visit_wo_v1_core",
    );
    expect(source).toContain(
      "create or replace function public.mobile_materialize_service_visit_work_order_atomic",
    );
    expect(source).toContain(
      "create or replace function public.mobile_create_service_call_atomic",
    );

    const runtime = await readFile(RUNTIME, "utf8");
    expect(runtime).toContain("product-boundary:field-handoff-positive");
    expect(runtime).toContain(
      "set_config('request.jwt.claim.role', 'authenticated', true)",
    );
    expect(
      runtime.match(/'request\.jwt\.claim\.sub'/g)?.length,
    ).toBeGreaterThanOrEqual(9);
    expect(runtime).toContain(
      "Trusted wrappers may populate the legacy scalar subject",
    );
    expect(runtime).toContain("Fleet auth subject did not switch:");
    expect(runtime).toContain(
      "set user_id = '59100000-0000-4000-8000-000000000004'\nwhere id = '59110000-0000-4000-8000-000000000004';",
    );
    expect(runtime).toContain(
      "Fleet actor did not resolve its linked Work Order relationship:",
    );
    expect(runtime).toContain(
      "Fleet actor resolved an unrelated Work Order relationship:",
    );
    expect(runtime).toContain("Product Field Attach Part");
    expect(runtime).toContain("sqlerrm = 'WORK_ORDER_MEDIA_SCOPE_MISMATCH'");
    expect(
      runtime.match(/exception when others then/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(runtime).toContain(
      "position('Unsupported job punch action' in sqlerrm) > 0",
    );
    expect(runtime).toContain(
      "position('Unsupported offline line mutation' in sqlerrm) > 0",
    );
    expect(runtime).toContain(
      "position('Inspection not found for shop' in sqlerrm) > 0",
    );
    expect(runtime).toContain(
      "Annotation product wrapper broke idempotent replay.",
    );
    expect(runtime).toContain(
      "Draft-delete product wrapper broke idempotent replay.",
    );
    expect(runtime).toContain(
      "Draft deletion ignored canonical purchase-order history.",
    );
    expect(runtime).toContain(
      "Mark-ready product wrapper broke idempotent replay.",
    );
    expect(runtime).toContain(
      "Field actor imported findings into an unrelated Work Order.",
    );
    expect(runtime).toContain(
      "Linked Field actor could not overwrite its stable job-photo path.",
    );
    expect(runtime).toContain(
      "has_schema_privilege('authenticated', 'private', 'USAGE')",
    );
    expect(runtime.indexOf("do $product_boundary_acl_contract$")).toBeLessThan(
      runtime.indexOf("set local role authenticated"),
    );

    const cleanReplay = await readFile(CLEAN_REPLAY, "utf8");
    expect(cleanReplay).toContain(
      "-f tests/security/shop-work-order-product-boundary.runtime.sql",
    );
  });

  it("keeps privileged mutation RPCs behind Shop or linked Field authority", async () => {
    const source = await readFile(MIGRATION, "utf8");
    const runtime = await readFile(RUNTIME, "utf8");

    expect(source).toContain(
      "create or replace function private.profixiq_current_actor_can_mutate_work_order_product",
    );
    expect(source).toContain(
      "public.profixiq_current_actor_has_shop_product_access(p_shop_id)",
    );
    expect(source).toContain(
      "private.profixiq_current_actor_has_field_work_order_access(\n      p_shop_id,",
    );
    expect(source).not.toContain(
      "grant execute on function private.profixiq_current_actor_can_mutate_work_order_product",
    );
    expect(source).toContain("operation.actor_user_id = auth.uid()");
    expect(source).toContain(
      "operation.work_order_line_id = p_work_order_line_id",
    );
    expect(source).toContain("receipt.actor_user_id = auth.uid()");
    expect(source).toContain("receipt.action_type = p_action_type");
    expect(source).toContain("receipt.entity_type = 'work_order_line'");
    expect(source).toContain("receipt.entity_id = p_work_order_line_id");
    expect(
      source.match(
        /errcode = 'P0002',\n\s+message = 'Fleet service request is unavailable\.'/g,
      ),
    ).toHaveLength(2);

    for (const rpc of [
      "apply_job_punch_transition_atomic",
      "apply_offline_line_mutation_atomic",
      "parts_attach_inventory_to_request_item_atomic",
      "parts_create_and_attach_inventory_atomic",
    ]) {
      expect(source).toContain(`create function public.${rpc}`);
      expect(runtime).toContain(`public.${rpc}`);
    }

    expect(source).toContain(
      "create function public.import_inspection_quote_package_atomic",
    );
    expect(source).toContain("Inspection import actor mismatch.");
    expect(source).toContain("INSPECTION_IMPORT_OPERATION_CONFLICT");
    expect(source).toContain(
      "create or replace function public.receive_po_part_and_allocate",
    );
    expect(source).toContain("v_field_restricted boolean := false");
    expect(source).toContain("where source_line.po_id = p_po_id");
    expect(source).toContain("and source_line.part_request_item_id = item.id");
    expect(source).toContain(
      "grant execute on function public.receive_po_part_and_allocate(\n  uuid, uuid, uuid, numeric, uuid\n) to authenticated, service_role",
    );

    expect(runtime).toContain(
      "Field actor reached the job-punch product core without its mature validation.",
    );
    expect(runtime).toContain(
      "Committed Field job punch was not replayable after reassignment.",
    );
    expect(runtime).toContain(
      "Committed Field offline mutation was not replayable after reassignment.",
    );
    expect(runtime).toContain(
      "Committed Field photo receipt was not replayable after reassignment.",
    );
    expect(runtime).toContain(
      "Field actor reached the offline mutation product core without its mature validation.",
    );
    expect(runtime).toContain(
      "Field actor attached inventory to its linked Work Order incorrectly.",
    );
    expect(runtime).toContain(
      "Field actor created inventory for its linked Work Order incorrectly.",
    );
    expect(runtime).toContain(
      "Field PO receipt escaped its authorized request-item identities.",
    );
    expect(runtime).toContain("set approval_state = 'approved'");
    expect(runtime).toContain("line_status = 'authorized'");
    expect(runtime).toContain(
      "Field actor received an unrelated purchase order.",
    );
    expect(runtime).toContain(
      "Fleet read authority became job-punch write authority.",
    );
    expect(runtime.match(/exception when no_data_found then/g)).toHaveLength(2);
  });

  it("keeps the actor-bound helpers represented in generated database types", async () => {
    const types = await readFile(TYPES, "utf8");

    expect(types).toContain("profixiq_current_actor_has_shop_product_access:");
    expect(types).toContain(
      "profixiq_current_actor_can_read_work_order_product:",
    );
    expect(types).toContain(
      "profixiq_current_actor_can_read_work_order_line_product:",
    );
    expect(types).toContain(
      "profixiq_current_actor_has_shop_product_for_line:",
    );
  });

  it("keeps Shop-oriented clean-replay fixtures product-explicit", async () => {
    for (const fixture of [
      "tests/parts/parts-request-purchase-order.runtime.sql",
      "tests/security/quote-review-cost-and-sell.runtime.sql",
      "tests/security/vehicle-workspace-tenant.runtime.sql",
      "tests/security/workspace-authorization.runtime.sql",
    ]) {
      const source = await readFile(fixture, "utf8");

      expect(source).toContain("subscription_package");
      expect(source).toContain("stripe_subscription_status");
      expect(source).toContain("stripe_pricing_model");
      expect(source).toContain("'shop_operations'");
      expect(source).toContain("'active'");
      expect(source).toContain("'product_packages_v1'");
    }
  });
});
