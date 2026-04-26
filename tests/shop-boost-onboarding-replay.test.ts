import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { runShopBoostImport } from "@/features/integrations/imports/runFullImport";
import type { Database } from "@shared/types/types/supabase";
import { SHOP_BOOST_ONBOARDING_REPLAY_FIXTURE } from "./fixtures/shop-boost-onboarding-replay.fixture";

type DB = Database;

type RowResultRow = DB["public"]["Tables"]["shop_boost_row_results"]["Row"];
type ReviewItemRow = DB["public"]["Tables"]["shop_boost_review_items"]["Row"];
type IntakeRow = DB["public"]["Tables"]["shop_boost_intakes"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];

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
    const diagnostics = await collectReplayDiagnostics({
      supabase: supabase!,
      shopId,
      intakeId,
      summary,
    });

    console.info("[shop-boost-replay] diagnostics", JSON.stringify(diagnostics, null, 2));

    const customers = diagnostics.customersByIntake;
    const canonicalCustomer = resolveCanonicalCustomerFromDiagnostics(diagnostics);
    expect(canonicalCustomer, buildCustomerFailureMessage(diagnostics)).toBeTruthy();
    expect(customers.length, buildCustomerFailureMessage(diagnostics)).toBe(1);

    const canonicalCustomerId = canonicalCustomer?.id ?? null;
    expect(canonicalCustomerId).toBeTruthy();
    expect(canonicalCustomer?.email).toBe("casey.driver@example.com");

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

function resolveCanonicalCustomerFromDiagnostics(diagnostics: ReplayDiagnostics): CustomerRow | null {
  if (diagnostics.customersByIntake.length === 1) {
    return diagnostics.customersByIntake[0];
  }
  if (diagnostics.customersByIntake.length > 1) {
    return null;
  }

  const customerLifecycleOutcomes = diagnostics.customerRowResults
    .map((row) => readLifecycle(row))
    .filter((stage): stage is string => Boolean(stage));
  const evidenceOfCustomerLinkOrCreate = customerLifecycleOutcomes.some((stage) =>
    ["materialized_new", "linked_existing", "updated_existing"].includes(stage),
  );
  if (evidenceOfCustomerLinkOrCreate && diagnostics.customersByDeterministicIdentity.length > 0) {
    return null;
  }
  return null;
}

type ReplayDiagnostics = {
  summary: Awaited<ReturnType<typeof runShopBoostImport>>;
  parserEvidence: {
    customerHeaders: string[];
    firstCustomerRowAliasValues: {
      customerId: string | null;
      email: string | null;
      phone: string | null;
      companyName: string | null;
    };
  };
  intake: IntakeRow | null;
  customersByIntake: CustomerRow[];
  customersByDeterministicIdentity: CustomerRow[];
  rowResults: Pick<
    RowResultRow,
    "source_file" | "source_row_index" | "target_domain" | "match_status" | "review_required" | "error_reason" | "match_details"
  >[];
  customerRowResults: Pick<
    RowResultRow,
    "source_file" | "source_row_index" | "target_domain" | "match_status" | "review_required" | "error_reason" | "match_details"
  >[];
  rowResultsGrouped: Record<string, number>;
  reviewItems: Pick<
    ReviewItemRow,
    "domain" | "issue_type" | "status" | "summary" | "blocking_reason" | "resolution_action" | "recommended_action"
  >[];
};

async function collectReplayDiagnostics(args: {
  supabase: ReturnType<typeof createClient<DB>>;
  shopId: string;
  intakeId: string;
  summary: Awaited<ReturnType<typeof runShopBoostImport>>;
}): Promise<ReplayDiagnostics> {
  const customerIdentity = deterministicFixtureCustomerIdentity();
  const parserEvidence = fixtureCustomerParserEvidence();

  const [intakeRes, intakeCustomersRes, deterministicCustomersRes, rowResultsRes, reviewItemsRes] = await Promise.all([
    args.supabase
      .from("shop_boost_intakes")
      .select("*")
      .eq("shop_id", args.shopId)
      .eq("id", args.intakeId)
      .maybeSingle(),
    args.supabase
      .from("customers")
      .select("*")
      .eq("shop_id", args.shopId)
      .eq("source_intake_id", args.intakeId),
    args.supabase
      .from("customers")
      .select("*")
      .eq("shop_id", args.shopId)
      .or(
        [
          `external_id.eq.${customerIdentity.externalId}`,
          `email.eq.${customerIdentity.email}`,
          `phone.eq.${customerIdentity.phone}`,
          `phone_number.eq.${customerIdentity.phone}`,
        ].join(","),
      ),
    args.supabase
      .from("shop_boost_row_results")
      .select("source_file,source_row_index,target_domain,match_status,review_required,error_reason,match_details")
      .eq("shop_id", args.shopId)
      .eq("intake_id", args.intakeId)
      .order("source_file", { ascending: true })
      .order("source_row_index", { ascending: true }),
    args.supabase
      .from("shop_boost_review_items")
      .select("domain,issue_type,status,summary,blocking_reason,resolution_action,recommended_action")
      .eq("shop_id", args.shopId)
      .eq("intake_id", args.intakeId)
      .order("domain", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const rowResults = rowResultsRes.data ?? [];
  const rowResultsGrouped = (rowResults ?? []).reduce<Record<string, number>>((acc, row) => {
    const lifecycle = readLifecycle(row) ?? "unknown";
    const key = `${row.target_domain}|${row.match_status}|${lifecycle}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    summary: args.summary,
    parserEvidence,
    intake: intakeRes.data ?? null,
    customersByIntake: intakeCustomersRes.data ?? [],
    customersByDeterministicIdentity: deterministicCustomersRes.data ?? [],
    rowResults,
    customerRowResults: rowResults.filter((row) => row.target_domain === "customer"),
    rowResultsGrouped,
    reviewItems: reviewItemsRes.data ?? [],
  };
}

function deterministicFixtureCustomerIdentity(): { email: string; phone: string; externalId: string } {
  const sourceCustomerId = "CUST-001";
  const email = "casey.driver@example.com";
  const phone = "5551112222";
  return {
    email,
    phone,
    externalId: `import:source:customer:${sha1(sourceCustomerId.trim().toLowerCase()).slice(0, 20)}`,
  };
}

function fixtureCustomerParserEvidence() {
  const [headerLine, firstDataLine] = SHOP_BOOST_ONBOARDING_REPLAY_FIXTURE.customersCsv
    .split(/\r?\n/)
    .filter((line) => line.trim().length);
  const headers = (headerLine ?? "").split(",").map((value) => value.trim());
  const firstRowValues = (firstDataLine ?? "").split(",").map((value) => value.trim());
  return {
    customerHeaders: headers,
    firstCustomerRowAliasValues: {
      customerId: firstRowValues[0] ?? null,
      email: firstRowValues[2] ?? null,
      phone: firstRowValues[3] ?? null,
      companyName: firstRowValues[4] ?? null,
    },
  };
}

function buildCustomerFailureMessage(diagnostics: ReplayDiagnostics): string {
  return [
    "Customer canonical materialization assertion failed.",
    `importSummary=${JSON.stringify(diagnostics.summary)}`,
    `intake=${JSON.stringify(diagnostics.intake)}`,
    `customersByIntake=${JSON.stringify(diagnostics.customersByIntake)}`,
    `customersByDeterministicIdentity=${JSON.stringify(diagnostics.customersByDeterministicIdentity)}`,
    `customerRowResults=${JSON.stringify(diagnostics.customerRowResults)}`,
    `rowResultsGrouped=${JSON.stringify(diagnostics.rowResultsGrouped)}`,
    `reviewItems=${JSON.stringify(diagnostics.reviewItems)}`,
    `fixtureParserEvidence=${JSON.stringify(diagnostics.parserEvidence)}`,
  ].join("\n");
}

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

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}
