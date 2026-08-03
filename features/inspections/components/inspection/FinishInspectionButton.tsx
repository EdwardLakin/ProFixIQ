"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import type {
  InspectionSession,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession;
  workOrderLineId?: string | null;
  disabled?: boolean;
  beforeNavigate?: () => Promise<unknown>;
};

type ItemLike = {
  item?: string | null;
  name?: string | null;
  status?: InspectionItemStatus | string | null;
  notes?: string | null;
};

type SectionLike = {
  title?: string | null;
  items?: ItemLike[] | null;
};

function isBadStatus(s: unknown): s is "fail" | "recommend" {
  const v = String(s ?? "").toLowerCase();
  return v === "fail" || v === "recommend";
}

function countFindings(session: InspectionSession): number {
  const sections: SectionLike[] = Array.isArray(
    (session as unknown as { sections?: unknown }).sections,
  )
    ? ((session as unknown as { sections: SectionLike[] }).sections ?? [])
    : [];

  let count = 0;

  for (const sec of sections) {
    const items: ItemLike[] = Array.isArray(sec?.items) ? (sec.items ?? []) : [];
    for (const it of items) {
      if (isBadStatus(it?.status)) count += 1;
    }
  }

  return count;
}

export default function FinishInspectionButton({
  session,
  workOrderLineId,
  disabled = false,
  beforeNavigate,
}: Props) {
  const router = useRouter();

  const findingsCount = useMemo(() => countFindings(session), [session]);

  const handleFinish = async (): Promise<void> => {
    if (!workOrderLineId) {
      toast.error("Missing work order line id — can’t finish.");
      return;
    }

    try {
      await beforeNavigate?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Wait for the inspection to finish saving.",
      );
      return;
    }

    if (findingsCount > 0) {
      const params = new URLSearchParams();

      if (session.id) params.set("inspectionId", session.id);
      if (session.workOrderId) params.set("workOrderId", session.workOrderId);
      params.set("workOrderLineId", workOrderLineId);
      if (session.templateitem) params.set("template", session.templateitem);

      router.push(`/inspections/findings?${params.toString()}`);
      return;
    }

    toast.success("No findings to review. Opening review page anyway.");
    const params = new URLSearchParams();

    if (session.id) params.set("inspectionId", session.id);
    if (session.workOrderId) params.set("workOrderId", session.workOrderId);
    params.set("workOrderLineId", workOrderLineId);
    if (session.templateitem) params.set("template", session.templateitem);

    router.push(`/inspections/findings?${params.toString()}`);
  };

  return (
    <Button
      onClick={() => void handleFinish()}
      type="button"
      size="sm"
      disabled={disabled}
      className={[
        "font-semibold tracking-[0.18em] uppercase text-[11px]",
        "border border-[var(--accent-copper-light)]",
        "bg-[var(--accent-copper)] text-[color:var(--theme-text-on-accent)]",
        "hover:bg-[var(--accent-copper)]/90",
        "shadow-[var(--theme-shadow-medium)]",
      ].join(" ")}
    >
      Review findings
    </Button>
  );
}

