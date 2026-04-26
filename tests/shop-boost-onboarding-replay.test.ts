import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { runShopBoostImport } from "@/features/integrations/imports/runFullImport";
import type { Database } from "@shared/types/types/supabase";
import { SHOP_BOOST_ONBOARDING_REPLAY_FIXTURE } from "./fixtures/shop-boost-onboarding-replay.fixture";

type DB = Database;

type RowResultRow = DB["public"]["Tables"]["shop_boost_row_results"]["Row"];

const shouldRunReplay =
  process.env.RUN_SHOP_BOOST_REPLAY_TEST === "true" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.SHOP_BOOST_REPLAY_SHOP_ID;

const describeReplay = shouldRunReplay ? describe : describe.skip;

describeReplay("Shop Boost onboarding deterministic replay", () => {
  const supabase = shouldRunReplay
    ? createClient<DB>(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
        auth: { persistSession: false },
      })
    : null;

  const shopId = process.env.SHOP_BOOST_REPLAY_SHOP_ID as string;
  const replayRunId = randomUUID();
  const replayLabel = `replay-${replayRunId}`;
  const intakeId = replayRunId;
  const storageRoot = `replays/${shopId}/${replayLabel}`;

  beforeAll(async () => {
    const customersPath = `${storageRoot}/customers.csv`;
    const vehiclesPath = `${storageRoot}/vehicles.csv`;
    const historyPath = `${storageRoot}/history.csv`;
    const invoicesPath = `${storageRoot}/invoices.csv`;

    await Promise.all([
      supabase!.storage.from("shop-imports").upload(customersPath, SHOP_BOOST_ONBOARDING_REPLAY_FIXTURE.customersCsv, {
        contentType: "text/csv",
        upsert: true,
      }),
      supabase!.storage.from("shop-imports").upload(vehiclesPath, SHOP_BOOST_ONBOARDING_REPLAY_FIXTURE.vehiclesCsv, {
        contentType: "text/csv",
        upsert: true,
      }),
      supabase!.storage.from("shop-imports").upload(historyPath, SHOP_BOOST_ONBOARDING_REPLAY_FIXTURE.historyCsv, {
        contentType: "text/csv",
        upsert: true,
      }),
      supabase!.storage.from("shop-imports").upload(invoicesPath, SHOP_BOOST_ONBOARDING_REPLAY_FIXTURE.invoicesCsv, {
        contentType: "text/csv",
        upsert: true,
      }),
    ]);

    const { error: intakeError } = await supabase!.from("shop_boost_intakes").insert({
      id: intakeId,
      shop_id: shopId,
      questionnaire: {},
      status: "pending",
      source: "shop_boost_replay_test",
      customers_file_path: customersPath,
      vehicles_file_path: vehiclesPath,
      history_file_path: historyPath,
      intake_basics: {
        uploadManifest: {
          invoices: {
            path: invoicesPath,
            fileName: "invoices.csv",
            importMode: "staging",
          },
        },
      },
    } as DB["public"]["Tables"]["shop_boost_intakes"]["Insert"]);

    expect(intakeError).toBeNull();
  }, 120_000);

  it("materializes the canonical customer→vehicle→work order→invoice graph and truthful row outcomes", async () => {
    const summary = await runShopBoostImport({ shopId, intakeId });

    const { data: customers } = await supabase!
      .from("customers")
      .select("id,email,phone,source_intake_id")
      .eq("shop_id", shopId)
      .eq("source_intake_id", intakeId);
    expect(customers?.length).toBe(1);

    const canonicalCustomerId = customers?.[0]?.id ?? null;
    expect(canonicalCustomerId).toBeTruthy();
    expect(customers?.[0]?.email).toBe("casey.driver@example.com");

    const { data: vehicles } = await supabase!
      .from("vehicles")
      .select("id,customer_id,vin,license_plate,unit_number,source_intake_id")
      .eq("shop_id", shopId)
      .eq("source_intake_id", intakeId);
    expect(vehicles?.length).toBe(1);
    expect(vehicles?.[0]?.customer_id).toBe(canonicalCustomerId);
    expect(vehicles?.[0]?.vin).toBe("1ftfw1e50pfa00001");

    const canonicalVehicleId = vehicles?.[0]?.id ?? null;

    const { data: workOrders } = await supabase!
      .from("work_orders")
      .select("id,shop_id,customer_id,vehicle_id,status,custom_id,source_intake_id,external_id")
      .eq("shop_id", shopId)
      .eq("source_intake_id", intakeId);
    expect(workOrders?.length).toBe(1);
    expect(workOrders?.[0]?.customer_id).toBe(canonicalCustomerId);
    expect(workOrders?.[0]?.vehicle_id).toBe(canonicalVehicleId);
    expect(workOrders?.[0]?.status).toBe("completed");

    const workOrderId = workOrders?.[0]?.id ?? null;
    expect(workOrderId).toBeTruthy();

    const { data: lines } = await supabase!
      .from("work_order_lines")
      .select("id,work_order_id,description,concern,cause,correction,source_intake_id")
      .eq("shop_id", shopId)
      .eq("work_order_id", workOrderId as string)
      .eq("source_intake_id", intakeId);
    expect((lines?.length ?? 0) >= 1).toBe(true);

    const { data: invoices } = await supabase!
      .from("invoices")
      .select("id,shop_id,work_order_id,customer_id,total,labor_cost,parts_cost,invoice_number,metadata")
      .eq("shop_id", shopId)
      .eq("work_order_id", workOrderId as string)
      .contains("metadata", { source_intake_id: intakeId });
    expect(invoices?.length).toBe(1);
    expect(invoices?.[0]?.customer_id).toBe(canonicalCustomerId);
    expect(invoices?.[0]?.total).toBe(275);

    const { data: rowResults } = await supabase!
      .from("shop_boost_row_results")
      .select("source_file,source_row_index,target_domain,match_status,review_required,error_reason,match_details")
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .order("source_file", { ascending: true })
      .order("source_row_index", { ascending: true });

    expect(rowResults?.length).toBe(10);

    const customersCreated = findRow(rowResults, "customers", 1, "customer");
    expect(customersCreated?.match_status).toBe("created_new");
    expect(readLifecycle(customersCreated)).toBe("materialized_new");

    const customersLinked = findRow(rowResults, "customers", 2, "customer");
    expect(customersLinked?.match_status).toBe("matched_existing");
    expect(readLifecycle(customersLinked)).toBe("linked_existing");

    const customersInvalid = findRow(rowResults, "customers", 3, "customer");
    expect(customersInvalid?.match_status).toBe("invalid");
    expect(customersInvalid?.review_required).toBe(true);
    expect(readLifecycle(customersInvalid)).toBe("review_required");

    const vehiclesLinked = findRow(rowResults, "vehicles", 2, "vehicle");
    expect(vehiclesLinked?.match_status).toBe("matched_existing");
    expect(readLifecycle(vehiclesLinked)).toBe("linked_existing");

    const vehiclesUnmatched = findRow(rowResults, "vehicles", 3, "vehicle");
    expect(vehiclesUnmatched?.match_status).toBe("unmatched");
    expect(vehiclesUnmatched?.review_required).toBe(true);

    const historyRow = findRow(rowResults, "history", 1, "work_order");
    expect(historyRow?.match_status === "created_new" || historyRow?.match_status === "matched_existing").toBe(true);
    expect(readLifecycle(historyRow)).toMatch(/materialized_new|updated_existing/);

    const invoiceUpdated = findRow(rowResults, "invoices", 1, "invoice");
    expect(invoiceUpdated?.match_status).toBe("matched_existing");
    expect(readLifecycle(invoiceUpdated)).toBe("updated_existing");

    const invoiceSkipped = findRow(rowResults, "invoices", 2, "invoice");
    expect(invoiceSkipped?.match_status).toBe("ignored");
    expect(readLifecycle(invoiceSkipped)).toBe("skipped");

    const invoiceReview = findRow(rowResults, "invoices", 3, "invoice");
    expect(invoiceReview?.match_status).toBe("unmatched");
    expect(invoiceReview?.review_required).toBe(true);
    expect(readLifecycle(invoiceReview)).toBe("review_required");

    expect(summary.rowResults.domainDiagnostics?.customers.uploaded).toBe(3);
    expect(summary.rowResults.domainDiagnostics?.vehicles.uploaded).toBe(3);
    expect(summary.rowResults.domainDiagnostics?.history.uploaded).toBe(1);
    expect(summary.rowResults.domainDiagnostics?.invoices.uploaded).toBe(3);
    expect(summary.rowResults.domainDiagnostics?.customers.materialized_new).toBeGreaterThanOrEqual(1);
    expect(summary.rowResults.domainDiagnostics?.vehicles.linked_existing).toBeGreaterThanOrEqual(1);
    expect(summary.rowResults.domainDiagnostics?.invoices.skipped).toBeGreaterThanOrEqual(1);
    expect(summary.rowResults.outcomeBuckets?.mismatch).toBe(0);
  }, 120_000);
});

function findRow(
  rows: Pick<
    RowResultRow,
    "source_file" | "source_row_index" | "target_domain" | "match_status" | "review_required" | "match_details"
  >[] | null | undefined,
  sourceFile: string,
  sourceRowIndex: number,
  targetDomain: string,
) {
  return (rows ?? []).find(
    (row) => row.source_file === sourceFile && row.source_row_index === sourceRowIndex && row.target_domain === targetDomain,
  );
}

function readLifecycle(row: Pick<RowResultRow, "match_details"> | undefined): string | null {
  const details = row?.match_details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const stage = (details as Record<string, unknown>).lifecycle_stage;
  return typeof stage === "string" ? stage : null;
}
