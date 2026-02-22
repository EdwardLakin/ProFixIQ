"use client";

import type { AISuggestion } from "@inspections/lib/inspection/aiQuote";

type AddLineArgs = {
  workOrderId: string;
  description: string;
  section?: string;
  status?: "fail" | "recommend";
  suggestion: AISuggestion;
  jobType?: "inspection" | "repair" | "maintenance" | "diagnosis" | "tech-suggested";
  stockLocationId?: string | null;
};

type AddLineResult = {
  id: string;
  stockLocationIdUsed?: string | null;
  anyMissing?: boolean;
  anyUnknown?: boolean;
  partsNeeded?: unknown;
};

export async function addWorkOrderLineFromSuggestion(
  args: AddLineArgs,
): Promise<AddLineResult> {
  const res = await fetch("/api/work-orders/add-line-inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workOrderId: args.workOrderId,
      description: args.description,
      section: args.section ?? null,
      status: args.status ?? null,
      suggestion: args.suggestion,
      jobType: args.jobType ?? "repair",
      stockLocationId: args.stockLocationId ?? null,
    }),
  });

  const data = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    const err = data as { error?: unknown } | null;
    throw new Error(
      typeof err?.error === "string" ? err.error : "Failed to add work order line",
    );
  }

  const rec = data as { id?: unknown } | null;
  const id = typeof rec?.id === "string" ? rec.id : null;

  if (!id) throw new Error("Work order line created but no id returned");

  return data as AddLineResult;
}