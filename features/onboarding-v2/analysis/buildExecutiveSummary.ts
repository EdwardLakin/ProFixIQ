import "server-only";

import type { AiRecommendationRecord } from "@/features/ai/server/types";
import type { GuidedOnboardingEvidence } from "./server";

export type ReadinessLabel = "Ready to launch" | "Strong foundation" | "Good start" | "More setup recommended";
export type PriorityImpact = "high" | "medium" | "low";

export type ExecutiveSummary = {
  readiness: {
    score: number;
    label: ReadinessLabel;
    summary: string;
  };
  shopProfile: {
    headline: string;
    description: string;
  };
  analyzed: {
    customers: number;
    vehicles: number;
    historyRecords: number;
    invoices: number;
    parts: number;
    yearsOfHistory?: number;
    vendors?: number;
  };
  strengths: Array<{ title: string; description: string }>;
  observations: Array<{ title: string; description: string; supportingMetric?: string }>;
  priorities: Array<{
    rank: number;
    category: string;
    title: string;
    description: string;
    impact: PriorityImpact;
    recommendationId?: string;
  }>;
  closingSummary: string;
};

export const READINESS_SCORE_WEIGHTS = {
  customersImported: 10,
  vehiclesImported: 10,
  serviceHistoryPresent: 12,
  invoicesPresent: 8,
  partsPresent: 8,
  shopHoursConfigured: 8,
  laborRateConfigured: 10,
  taxRateConfigured: 8,
  shopSuppliesConfigured: 6,
  workflowDefaultsConfigured: 8,
  inspectionTemplatesReady: 6,
  menuItemsReady: 6,
} as const;

function readinessLabel(score: number): ReadinessLabel {
  if (score >= 90) return "Ready to launch";
  if (score >= 75) return "Strong foundation";
  if (score >= 50) return "Good start";
  return "More setup recommended";
}

export function calculateLaunchReadinessScore(evidence: GuidedOnboardingEvidence): number {
  const weights = READINESS_SCORE_WEIGHTS;
  const score =
    (evidence.customerCount > 0 ? weights.customersImported : 0) +
    (evidence.vehicleCount > 0 ? weights.vehiclesImported : 0) +
    (evidence.historyCount > 0 ? weights.serviceHistoryPresent : 0) +
    (evidence.invoiceCount > 0 ? weights.invoicesPresent : 0) +
    (evidence.partsCount > 0 ? weights.partsPresent : 0) +
    (evidence.shopSettings.hoursConfigured ? weights.shopHoursConfigured : 0) +
    (evidence.shopSettings.laborRateConfigured ? weights.laborRateConfigured : 0) +
    (evidence.shopSettings.taxRateConfigured ? weights.taxRateConfigured : 0) +
    (evidence.shopSettings.shopSuppliesConfigured ? weights.shopSuppliesConfigured : 0) +
    (evidence.shopSettings.workflowDefaultsConfigured ? weights.workflowDefaultsConfigured : 0) +
    (evidence.inspectionTemplateCount > 0 ? weights.inspectionTemplatesReady : 0) +
    (evidence.menuItemCount > 0 ? weights.menuItemsReady : 0);

  return Math.max(0, Math.min(100, score));
}

function recommendationCategory(recommendation: AiRecommendationRecord): string {
  const metadata = recommendation.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.category === "string") return metadata.category;
  return "Launch opportunity";
}

function impactFor(recommendation: AiRecommendationRecord): PriorityImpact {
  if (recommendation.priority === "urgent" || recommendation.priority === "high") return "high";
  if (recommendation.priority === "normal") return "medium";
  return "low";
}

const priorityWeight = { urgent: 4, high: 3, normal: 2, low: 1 } as const;

export function buildExecutiveSummary(evidence: GuidedOnboardingEvidence, recommendations: AiRecommendationRecord[]): ExecutiveSummary {
  const score = calculateLaunchReadinessScore(evidence);
  const label = readinessLabel(score);
  const hasHistory = evidence.historyCount > 0 || evidence.invoiceCount > 0;
  const hasServicePatterns = evidence.commonServiceCategories.length > 0 || evidence.commonJobs.length >= 3;

  const strengths: ExecutiveSummary["strengths"] = [];
  if (evidence.customerCount > 0 && evidence.vehicleCount > 0) strengths.push({ title: "Customer and vehicle foundation", description: `ProFixIQ reviewed ${evidence.customerCount} customers and ${evidence.vehicleCount} vehicles, giving the shop a usable base for launch workflows.` });
  if (evidence.historyCount >= 25 || evidence.invoiceCount >= 10) strengths.push({ title: "Historical service coverage", description: `Your imported data includes ${evidence.historyCount} service-history records and ${evidence.invoiceCount} historical invoices for launch planning.` });
  if (evidence.partsCount > 0 && evidence.partsWithVendorCount > 0) strengths.push({ title: "Inventory identity is started", description: `${evidence.partsWithVendorCount} parts include vendor information, which helps purchasing review begin from real inventory records.` });
  if (evidence.shopSettings.hoursConfigured && evidence.shopSettings.laborRateConfigured && evidence.shopSettings.taxRateConfigured) strengths.push({ title: "Core shop settings are configured", description: "Shop hours, labor rate, and tax settings are present, so launch readiness is not based on imported records alone." });
  if (hasServicePatterns) strengths.push({ title: "Recurring service patterns are visible", description: "Repeated service names or categories appear in the imported history, creating a practical starting point for reviewed templates, menu items, and packages." });

  const observations: ExecutiveSummary["observations"] = [];
  if (hasServicePatterns) observations.push({ title: "Service history contains repeatable patterns", description: `ProFixIQ found ${evidence.commonServiceCategories.length} recurring service categories and ${evidence.commonJobs.length} common job descriptions in the imported records.`, supportingMetric: `${evidence.commonServiceCategories.length + evidence.commonJobs.length} pattern signals` });
  else observations.push({ title: "Service mix is not yet clear", description: "There is not yet enough categorized service history to identify a dominant service mix.", supportingMetric: "Insufficient categorized history" });
  if (evidence.partsCount > 0) observations.push({ title: "Parts data is ready for cleanup review", description: `Your inventory includes ${evidence.partsCount} parts, with ${evidence.zeroStockPartsCount} zero-stock parts, ${evidence.lowStockPartsCount} low-stock parts, and ${evidence.partsMissingCategoryCount} missing category values.`, supportingMetric: `${evidence.partsCount} parts analyzed` });
  if (evidence.inspectionTemplateCount < 2 && hasHistory) observations.push({ title: "Inspection coverage is still light", description: `Your history is populated, but only ${evidence.inspectionTemplateCount} inspection templates were found. Standardizing inspections should come before broad canned-service rollout.`, supportingMetric: `${evidence.inspectionTemplateCount} templates` });
  if (evidence.menuItemCount < 5 && hasServicePatterns) observations.push({ title: "Menu item coverage can follow inspection review", description: `ProFixIQ found repeatable service signals and ${evidence.menuItemCount} menu items, so reviewed canned services are a logical next setup step.`, supportingMetric: `${evidence.menuItemCount} menu items` });

  const priorities = recommendations
    .slice()
    .sort((a, b) => (priorityWeight[b.priority] - priorityWeight[a.priority]) || ((b.confidence ?? 0) - (a.confidence ?? 0)))
    .slice(0, 3)
    .map((recommendation, index) => ({
      rank: index + 1,
      category: recommendationCategory(recommendation),
      title: recommendation.title,
      description: recommendation.summary || "Review this owner-approved setup opportunity in the AI Recommendations center.",
      impact: impactFor(recommendation),
      recommendationId: recommendation.id,
    }));

  return {
    readiness: { score, label, summary: `${label}: this score measures setup and data readiness only. It is based on imported records, configured shop defaults, and reviewed launch building blocks—not financial performance.` },
    shopProfile: {
      headline: hasHistory ? "ProFixIQ reviewed your imported operating history." : "ProFixIQ reviewed the setup data available so far.",
      description: hasHistory ? "Your business analysis is based on real customers, vehicles, service history, invoices, parts, and shop defaults imported during guided setup." : "Your business analysis is intentionally conservative because service history is limited or not yet imported.",
    },
    analyzed: {
      customers: evidence.customerCount,
      vehicles: evidence.vehicleCount,
      historyRecords: evidence.historyCount,
      invoices: evidence.invoiceCount,
      parts: evidence.partsCount,
      yearsOfHistory: evidence.yearsOfHistory,
      vendors: evidence.vendorCount,
    },
    strengths: strengths.slice(0, 4),
    observations: observations.slice(0, 4),
    priorities,
    closingSummary: priorities.length > 0 ? "Start with the highest-impact review items, then continue to shop activation once the owner is comfortable with the launch setup." : "Run or re-run AI Business Analysis after more setup data is available to generate owner-reviewable launch priorities.",
  };
}
