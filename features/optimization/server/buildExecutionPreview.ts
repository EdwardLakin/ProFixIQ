import type { ExecutionPreview, OptimizationOpportunity } from "@/features/optimization/types";

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseCurrentPrice(sourceBasis: string): number | null {
  const match = sourceBasis.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  return match ? toNumber(match[1]) : null;
}

function parseCurrentLaborHours(opportunity: OptimizationOpportunity): number | null {
  const meta = (opportunity.meta ?? {}) as Record<string, unknown>;
  return toNumber(meta.currentLaborHours);
}

export function buildExecutionPreview(opportunity: OptimizationOpportunity): ExecutionPreview {
  const meta = (opportunity.meta ?? {}) as Record<string, unknown>;

  if (opportunity.type === "pricing_normalization") {
    const currentPrice = toNumber(meta.currentMenuPrice) ?? parseCurrentPrice(opportunity.sourceBasis);
    const newPrice = toNumber(meta.recommendedPrice);
    const currentLaborHours = parseCurrentLaborHours(opportunity);
    const newLaborHours = toNumber(meta.recommendedLaborHours);

    const changes: ExecutionPreview["changes"] = [
      {
        label: "Menu item total price",
        before: currentPrice,
        after: newPrice,
      },
    ];

    if (newLaborHours !== null) {
      changes.push({
        label: "Labor hours",
        before: currentLaborHours,
        after: newLaborHours,
      });
    }

    return {
      type: "pricing",
      changes,
      warnings:
        opportunity.confidence < 0.75
          ? ["Labor-hour updates are only applied when confidence and sample quality are strong."]
          : undefined,
    };
  }

  if (opportunity.type === "inspection_coverage_gap") {
    const existingTemplateId = opportunity.targetRefs?.inspectionTemplateId;
    const inferredTemplateName =
      opportunity.title.replace(/^Inspection coverage gap:\s*/i, "").trim() || "Optimization Inspection Template";

    return {
      type: "inspection",
      changes: [
        {
          label: existingTemplateId ? "Inspection template" : "New inspection template",
          before: existingTemplateId ?? null,
          after: inferredTemplateName,
        },
        {
          label: "Menu item template linkage",
          before: existingTemplateId ?? null,
          after: existingTemplateId ?? "Will link newly created template",
        },
      ],
    };
  }

  return {
    type: "revenue",
    changes: [
      {
        label: "Suggestion record",
        before: null,
        after: {
          title: opportunity.title,
          reason: opportunity.suggestedAction ?? opportunity.summary,
          confidence: opportunity.confidence,
        },
      },
      {
        label: "Menu item changes",
        before: "No menu item mutation",
        after: "No menu item mutation",
      },
    ],
    warnings: ["This creates a suggestion only. Existing menu items are not modified."],
  };
}
