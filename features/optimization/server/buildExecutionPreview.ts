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
        label: opportunity.title.replace(/^Pricing normalization:\s*/i, "").trim() || "Menu item total price",
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
          label: "Inspection template",
          before: existingTemplateId ?? null,
          after: inferredTemplateName,
        },
        {
          label: "Sections",
          before: [],
          after: opportunity.reasoning.slice(0, 5),
        },
      ],
    };
  }

  return {
    type: "revenue",
    changes: [
      {
        label: "Suggestion title",
        before: null,
        after: opportunity.title,
      },
      {
        label: "Reason shown to advisor",
        before: null,
        after: opportunity.suggestedAction ?? opportunity.summary,
      },
    ],
    warnings: ["This creates a suggestion only. Existing menu items are not modified."],
  };
}
