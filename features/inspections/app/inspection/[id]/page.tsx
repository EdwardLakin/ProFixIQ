"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import PageShell from "@/features/shared/components/PageShell";
import Card from "@/features/shared/components/ui/Card";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";

// --- Types ---
interface InspectionItem {
  name?: string;
  item?: string;
  status?: string;
  notes?: string;
  value?: string;
  unit?: string;
  photoUrls?: string[];
}

interface InspectionResultSection {
  title: string;
  items: InspectionItem[];
}

interface CanonicalInspection {
  id: string;
  updatedAt: string | null;
  templateName?: string;
  status: string;
  sections: InspectionResultSection[];
}

type LoadResponse = {
  session?: {
    id?: string | null;
    templateName?: string | null;
    templateitem?: string | null;
    status?: string | null;
    sections?: InspectionResultSection[];
  } | null;
  inspectionMeta?: {
    status?: string | null;
    updatedAt?: string | null;
  } | null;
};

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [inspection, setInspection] = useState<CanonicalInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchInspection = async () => {
      const response = await fetch(
        `/api/inspections/load?inspectionId=${encodeURIComponent(id)}`,
        { credentials: "include", cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | LoadResponse
        | null;

      if (!response.ok || !payload?.session) {
        router.push("/inspections/saved");
        return;
      }

      setInspection({
        id: payload.session.id ?? id,
        updatedAt: payload.inspectionMeta?.updatedAt ?? null,
        templateName:
          payload.session.templateName ?? payload.session.templateitem ?? undefined,
        status:
          payload.inspectionMeta?.status ?? payload.session.status ?? "draft",
        sections: payload.session.sections ?? [],
      });
      setLoading(false);
    };

    if (id) {
      fetchInspection();
    }
  }, [id, router]);

  const statusVariant = (status: string) => {
    const s = status.toLowerCase();
    if (s === "completed" || s === "done") return "success" as const;
    if (s === "in_progress" || s === "running") return "active" as const;
    if (s === "failed") return "danger" as const;
    return "neutral" as const;
  };

  if (loading) {
    return (
      <PageShell title="Inspection details" description="Loading inspection result.">
        <Card className="px-4 py-6 text-center text-sm text-[var(--theme-text-secondary,var(--theme-text-muted))]">
          Loading inspection...
        </Card>
      </PageShell>
    );
  }

  if (!inspection) {
    return (
      <PageShell title="Inspection details" description="Inspection result lookup.">
        <Card className="px-4 py-6 text-center text-sm text-rose-300">
          Inspection not found.
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Inspection"
      title={inspection.templateName || "Inspection Details"}
      description="Evidence-forward review of captured inspection findings."
      actions={<PreviousPageButton to="/inspections/saved" />}
    >
      <Card className="mb-5 px-4 py-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusBadge variant={statusVariant(inspection.status)}>
            {inspection.status}
          </StatusBadge>
          <span className="text-[var(--theme-text-secondary,var(--theme-text-muted))]">
            Updated: {inspection.updatedAt ? format(new Date(inspection.updatedAt), "PPpp") : "—"}
          </span>
        </div>
      </Card>

      <div className="space-y-4">
        {inspection.sections.map((section, index) => (
          <Card key={index} className="px-4 py-4">
            <h2 className="mb-2 text-lg font-semibold">{section.title}</h2>
            <ul className="space-y-2">
              {section.items?.map((item, i) => (
                <li key={i} className="text-sm text-[var(--theme-text-secondary,var(--theme-text-muted))]">
                  <span className="font-semibold text-[var(--theme-text-primary,var(--theme-text-primary))]">
                    {item.name ?? item.item ?? "Inspection item"}:
                  </span>{" "}
                  {item.status || "N/A"}
                  {item.notes && <span className="block">Note: {item.notes}</span>}
                  {item.value && (
                    <span className="block">
                      {item.unit ? `${item.value} ${item.unit}` : item.value}
                    </span>
                  )}
                  {(item.photoUrls?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.photoUrls?.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt="Photo"
                          className="h-24 w-24 rounded border border-[var(--theme-card-border,var(--theme-border-soft))] object-cover"
                        />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
