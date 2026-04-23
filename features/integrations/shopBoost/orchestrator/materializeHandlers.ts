import { runShopBoostImport, type ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";
import type { MaterializeDomain } from "./index";

export type DomainMaterializeResult = {
  domain: MaterializeDomain;
  mode: "domain_handler";
  completionState: ShopBoostImportSummary["completionState"];
  rowResults: { success: number; review: number; failed: number };
  importedCount: number;
  canonicalMaterialization: ShopBoostImportSummary["canonicalMaterialization"];
};

function importedCountForDomain(summary: ShopBoostImportSummary, domain: MaterializeDomain): number {
  if (domain === "customers") return Number(summary.customersImported ?? 0);
  if (domain === "vehicles") return Number(summary.vehiclesImported ?? 0);
  if (domain === "history") return Number(summary.workOrdersImported ?? 0);
  if (domain === "invoices") return Number(summary.invoicesImported ?? 0);
  if (domain === "parts") return Number(summary.partsImported ?? 0);
  return Number(summary.canonicalMaterialization.actual.staffSuggestions ?? 0);
}

export async function runShopBoostDomainMaterialize(args: {
  shopId: string;
  intakeId: string;
  domain: MaterializeDomain;
}): Promise<{ summary: ShopBoostImportSummary; domainResult: DomainMaterializeResult }> {
  const summary = await runShopBoostImport({
    shopId: args.shopId,
    intakeId: args.intakeId,
    options: {
      createStaffUsers: false,
      materializeDomain: args.domain,
    },
  });

  const byDomain = summary.rowResults.byDomain ?? {};
  const rowResults = byDomain[args.domain] ?? { success: 0, review: 0, failed: 0 };

  return {
    summary,
    domainResult: {
      domain: args.domain,
      mode: "domain_handler",
      completionState: summary.completionState,
      rowResults,
      importedCount: importedCountForDomain(summary, args.domain),
      canonicalMaterialization: summary.canonicalMaterialization,
    },
  };
}
