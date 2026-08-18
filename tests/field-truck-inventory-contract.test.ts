import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { aggregateRecentPartUses } from "@/features/mobile/service/truckInventoryContracts";

const read = (path: string) => readFileSync(path, "utf8");
const migration = [
  "supabase/migrations/20260812230000_field_integration_identity_core.sql",
  "supabase/migrations/20260812230100_field_part_identity_commands.sql",
  "supabase/migrations/20260812230200_field_truck_inventory_snapshot.sql",
  "supabase/migrations/20260812230300_field_truck_inventory_movement_commands.sql",
  "supabase/migrations/20260812230400_field_truck_inventory_work_order_commands.sql",
  "supabase/migrations/20260815050000_field_part_identity_review_hardening.sql",
  "supabase/migrations/20260815050100_field_truck_line_review_hardening.sql",
  "supabase/migrations/20260815050200_field_truck_receipt_review_hardening.sql",
  "supabase/migrations/20260818153429_field_truck_inventory_activity.sql",
  "supabase/migrations/20260818161654_field_truck_transfer_additive_authorization.sql",
  "supabase/migrations/20260818184534_field_truck_inventory_consistent_activity.sql",
]
  .map(read)
  .join("\n");
const additiveHardening = [
  "supabase/migrations/20260818153429_field_truck_inventory_activity.sql",
  "supabase/migrations/20260818161654_field_truck_transfer_additive_authorization.sql",
]
  .map(read)
  .join("\n");
const consistentActivity = read(
  "supabase/migrations/20260818184534_field_truck_inventory_consistent_activity.sql",
);
const inventoryUi = [
  "features/mobile/service/MobileTruckInventory.tsx",
  "features/mobile/service/MobileTruckInventoryScreen.tsx",
  "features/mobile/service/TruckStockPanel.tsx",
  "features/mobile/service/TruckLoadPanel.tsx",
  "features/mobile/service/TruckReceivePanel.tsx",
  "features/mobile/service/TruckHistoryPanel.tsx",
  "features/mobile/service/truckInventoryClient.ts",
  "features/mobile/service/useTruckInventorySnapshot.ts",
  "features/mobile/service/useTruckInventoryUsage.ts",
  "features/mobile/service/useTruckInventoryStocking.ts",
]
  .map(read)
  .join("\n");
const scanner = read("features/mobile/service/FieldBarcodeScanner.tsx");
const offline = read(
  "features/mobile/service/truckInventoryOffline.ts",
);
const replay = read("features/shared/lib/offline/replay.ts");
const integrationCore = read(
  "features/integrations/core/contracts.ts",
);
const partsIntegration = read("features/integrations/parts/index.ts");
const snapshotApi = read(
  "app/api/mobile/service/truck-inventory/route.ts",
);
const useApi = read(
  "app/api/mobile/service/truck-inventory/use/route.ts",
);
const transferApi = read(
  "app/api/mobile/service/truck-inventory/transfer/route.ts",
);
const receiveApi = read(
  "app/api/mobile/service/truck-inventory/receive/route.ts",
);
const runtime = read("tests/mobile/field-truck-inventory.runtime.sql");
const workflow = read(".github/workflows/mobile-v1-validation.yml");
const contracts = read(
  "features/mobile/service/truckInventoryContracts.ts",
);
const identityReview = read(
  "supabase/migrations/20260815050000_field_part_identity_review_hardening.sql",
);
const lineReview = read(
  "supabase/migrations/20260815050100_field_truck_line_review_hardening.sql",
);
const receiptReview = read(
  "supabase/migrations/20260815050200_field_truck_receipt_review_hardening.sql",
);

describe("Field Service truck inventory", () => {
  it("uses one canonical part identity across providers, barcodes, PO, stock, work order, and invoice truth", () => {
    expect(migration).toContain(
      "create table if not exists public.part_external_identities",
    );
    expect(migration).toContain("part_id uuid not null references public.parts(id)");
    expect(migration).toContain(
      "field_resolve_or_create_part_identity_atomic",
    );
    expect(migration).toContain("extensions.digest(");
    expect(migration).not.toContain("encode(digest(");
    expect(migration).toContain("insert into public.parts_barcodes");
    expect(migration).toContain("'canonical_part_id', p_part_id");
    expect(partsIntegration.replace(/\s*\*\s*/g, " ")).toContain(
      "Every selected result must resolve to one canonical ProFixIQ parts.id",
    );
    expect(partsIntegration).not.toContain("MockPartsProvider");
    expect(partsIntegration).not.toContain("demo-123");
  });

  it("transfers physical stock onto the truck as one paired and idempotent ledger operation", () => {
    expect(migration).toContain("field_transfer_stock_to_truck_atomic");
    expect(migration).toContain("'transfer_out'");
    expect(migration).toContain("'transfer_in'");
    expect(migration).toContain("'paired_stock_move_id'");
    expect(migration).toContain("FIELD_TRUCK_TRANSFER_KEY_CONFLICT");
    expect(migration).toContain("public.parts_available(");
    expect(transferApi).toContain('requiredCapability: "canManageParts"');
    expect(transferApi).toContain(
      "field_transfer_stock_to_truck_authorized_atomic",
    );
    expect(snapshotApi).toContain("p_service_vehicle_id");
    expect(contracts).toContain("trucks: FieldTruck[]");
    expect(inventoryUi).toContain("Select service truck");
    expect(migration).toContain(
      "field_transfer_stock_to_truck_authorized_atomic",
    );
    expect(migration).toContain(
      "return public.field_transfer_stock_to_truck_atomic(",
    );
    expect(migration).not.toContain("rename to field_transfer_stock_to_truck");
    expect(migration).not.toContain("set schema private");
    expect(additiveHardening).not.toMatch(
      /drop\s+(?:function|table|column|type)/i,
    );
    expect(migration).toContain("not v_actor.can_manage_parts");
    expect(migration).toContain("Parts management permission is required.");
  });

  it("exposes a tenant-scoped truck ledger activity projection", () => {
    expect(migration).toContain("field_truck_inventory_activity");
    expect(migration).toContain("stock_moves_shop_location_created_idx");
    expect(migration).toContain("move.shop_id = p_shop_id");
    expect(migration).toContain("move.location_id = v_truck.stock_location_id");
    expect(snapshotApi).toContain(
      "field_truck_inventory_snapshot_with_activity",
    );
    expect(snapshotApi).not.toContain('"field_truck_inventory_activity"');
    expect(snapshotApi.match(/fieldInventoryRpc\(/g)).toHaveLength(1);
    expect(consistentActivity).toContain(
      "alter function public.field_truck_inventory_snapshot(uuid,uuid,uuid,uuid,text)",
    );
    expect(consistentActivity).toContain(
      "field_truck_inventory_snapshot_with_activity",
    );
    expect(consistentActivity).toContain(
      "when move.reason in ('wo_allocate', 'wo_release')",
    );
    expect(consistentActivity).toContain(
      "then abs(coalesce(move.lifecycle_quantity, 0))",
    );
    expect(consistentActivity).toContain(
      "when move.reason = 'wo_allocate' then 'out'",
    );
    expect(consistentActivity).toContain(
      "when move.reason = 'wo_release' then 'in'",
    );
    expect(contracts).toContain("movements: FieldTruckInventoryMovement[]");
    expect(inventoryUi).toContain("Truck movement history");
  });

  it("receives canonical or free-text PO lines directly to the truck without a setup detour", () => {
    expect(migration).toContain("field_receive_po_part_to_truck_atomic");
    expect(migration).toContain("p_purchase_order_line_id uuid");
    expect(migration).toContain("public.receive_po_part_and_allocate(");
    expect(migration).toContain("'purchase_order'");
    expect(migration).toContain("public.parts_ensure_work_order_part(");
    expect(receiptReview).toContain("profixiq_receive_po_line_to_location_atomic");
    expect(receiptReview).toContain("'purchase_order_line_id', p_purchase_order_line_id");
    expect(receiptReview).toContain("PARTS_PO_NOT_RECEIVABLE");
    expect(migration).toContain("'direct_to_truck', true");
    expect(receiveApi).toContain("p_purchase_order_line_id");
    expect(receiveApi).toContain("field_receive_po_part_to_truck_atomic");
    expect(contracts).toContain("requiresCanonicalIdentity: boolean");
    expect(inventoryUi).toContain("Receive PO directly to truck");
    expect(inventoryUi).toContain(
      "Free-text PO lines are canonicalized here automatically.",
    );
    expect(inventoryUi).toContain(
      "Receipt, request, work-order part, and inventory ledger retain the same part ID.",
    );
  });

  it("issues and returns parts through the existing exactly-once work-order lifecycle", () => {
    expect(migration).toContain("field_use_truck_part_atomic");
    expect(migration).toContain("public.parts_issue_by_line_part_atomic(");
    expect(migration).toContain("field_return_truck_part_atomic");
    expect(migration).toContain("public.parts_return_to_stock(");
    expect(lineReview).toContain("line.approval_state::text");
    expect(lineReview).toContain("The repair line is not approved and actionable");
    expect(useApi).toContain("requireMobileServiceOperatorApiAccess");
    expect(useApi).toContain("field_use_truck_part_atomic");
    expect(inventoryUi).toContain("handleUse(part.partId)");
    expect(inventoryUi).toMatch(/Use\s+\{quantityLabel\(quantity\)\}\s+on call/);
    expect(inventoryUi).toContain("handleReturn(use)");
    expect(inventoryUi).toContain("Return ${quantityLabel(returnable)} to truck");
    expect(inventoryUi).not.toContain("Create stock item");
    expect(inventoryUi).not.toContain("Map it in Parts");
  });

  it("makes barcode resolution inline instead of redirecting to inventory setup", () => {
    expect(scanner).toContain('@ericblade/quagga2');
    expect(scanner).toContain("Barcode scanner could not be loaded.");
    expect(inventoryUi).toContain("Confirm new canonical part");
    expect(inventoryUi).toContain("There is no separate stock-item setup step.");
    expect(inventoryUi).toContain("createIfMissing: true");
    expect(migration).toContain("'requiresDetails', true");
    expect(identityReview).not.toContain("coalesce(v_supplier_sku, v_code)");
    expect(identityReview).not.toContain("coalesce(v_part_number, v_code)");
    expect(identityReview).toContain(
      "case when v_actor.can_manage_parts then p_unit_cost else null end",
    );
  });

  it("caches the assigned truck and replays use/return once in the visit dependency chain", () => {
    expect(offline).toContain('const SNAPSHOT_KIND = "field-truck-inventory"');
    expect(offline).toContain('actionType: "field-inventory:use-part"');
    expect(offline).toContain('actionType: "field-inventory:return-part"');
    expect(offline).toContain("movements: stored.data.movements ?? []");
    expect(offline).toContain('orderKey: `service-visit:${args.payload.visitId}`');
    expect(offline).toContain("lastVisitMutationDependency");
    expect(offline.match(/bestEffortOnlineHistory: true/g)).toHaveLength(2);
    expect(offline).toContain("listPendingMutations(args.scope)");
    expect(replay).toContain('"field-inventory:use-part"');
    expect(replay).toContain('"field-inventory:return-part"');
    expect(replay).toContain("mutation.clientMutationId");
    expect(inventoryUi).toContain("Offline — showing the last cached truck snapshot.");
  });

  it("aggregates repeated issues before calculating the returnable quantity", () => {
    const uses = aggregateRecentPartUses([
      {
        stockMoveId: "older",
        workOrderPartId: "work-part",
        workOrderLineId: "line",
        partId: "part",
        name: "Seal",
        partNumber: "S-1",
        quantity: 2,
        createdAt: "2026-08-15T00:00:00.000Z",
        returnedQuantity: 1,
      },
      {
        stockMoveId: "newer",
        workOrderPartId: "work-part",
        workOrderLineId: "line",
        partId: "part",
        name: "Seal",
        partNumber: "S-1",
        quantity: 3,
        createdAt: "2026-08-15T01:00:00.000Z",
        returnedQuantity: 1,
      },
    ]);

    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({
      stockMoveId: "newer",
      quantity: 5,
      returnedQuantity: 1,
    });
  });

  it("adds a reusable integration core without storing provider secrets in the client contract", () => {
    expect(migration).toContain(
      "create table if not exists public.integration_connections",
    );
    expect(migration).toContain("secret_reference text");
    expect(migration).toContain(
      "create table if not exists public.integration_external_objects",
    );
    expect(migration).toContain(
      "create table if not exists public.integration_sync_events",
    );
    expect(integrationCore).toContain("export class IntegrationRegistry");
    expect(partsIntegration).toContain("PartsProviderRegistry");
    expect(partsIntegration).toContain("Nexpart, PartsTech");
  });

  it("keeps physical inventory writes out of client and route code", () => {
    for (const source of [inventoryUi, snapshotApi, useApi, transferApi, receiveApi]) {
      expect(source).not.toContain('.from("stock_moves")');
      expect(source).not.toContain('.insert({');
    }
  });

  it("proves canonicalization, paired transfer, use, return, and exact replay on a clean database", () => {
    expect(runtime).toContain("field_receive_po_part_to_truck_atomic");
    expect(runtime).toContain("free-text PO line becomes a canonical part");
    expect(runtime).toContain("field_transfer_stock_to_truck_authorized_atomic");
    expect(runtime).toContain("technician bypassed Parts permission");
    expect(runtime).toContain("field_use_truck_part_atomic");
    expect(runtime).toContain("repeated use decremented inventory twice");
    expect(runtime).toContain("field_return_truck_part_atomic");
    expect(runtime).toContain("return replay changed inventory twice");
    expect(runtime).toContain("field_truck_inventory_snapshot_with_activity");
    expect(runtime).toContain("reservation movement quantity or direction is wrong");
    expect(workflow).toContain("tests/field-truck-inventory-contract.test.ts");
    expect(workflow).toContain("tests/mobile/field-truck-inventory.runtime.sql");
    expect(workflow).toContain("Field truck inventory runtime");
  });

  it("ships every route used by the field truck workflow", () => {
    for (const path of [
      "app/mobile/service/truck-inventory/page.tsx",
      "app/api/mobile/service/truck-inventory/route.ts",
      "app/api/mobile/service/truck-inventory/resolve/route.ts",
      "app/api/mobile/service/truck-inventory/use/route.ts",
      "app/api/mobile/service/truck-inventory/return/route.ts",
      "app/api/mobile/service/truck-inventory/transfer/route.ts",
      "app/api/mobile/service/truck-inventory/receive/route.ts",
      "features/mobile/service/MobileTruckInventoryScreen.tsx",
      "features/mobile/service/TruckStockPanel.tsx",
      "features/mobile/service/TruckLoadPanel.tsx",
      "features/mobile/service/TruckReceivePanel.tsx",
      "features/mobile/service/TruckHistoryPanel.tsx",
      "features/mobile/service/truckInventoryClient.ts",
      "features/mobile/service/useTruckInventorySnapshot.ts",
      "features/mobile/service/useTruckInventoryUsage.ts",
      "features/mobile/service/useTruckInventoryStocking.ts",
    ]) {
      expect(existsSync(path), path).toBe(true);
    }
  });
});
