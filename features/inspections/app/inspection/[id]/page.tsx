"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import PageShell from "@/features/shared/components/PageShell";
import Card from "@/features/shared/components/ui/Card";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// --- Types ---
interface InspectionItem {
  name: string;
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

interface Inspection {
  id: string;
  created_at: string;
  template_name?: string;
  status: string;
  result: InspectionResultSection[];
}

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchInspection = async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("Error fetching inspection:", error);
        router.push("/inspection/saved");
        return;
      }

      setInspection(data as Inspection);
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
        <Card className="px-4 py-6 text-center text-sm text-[var(--theme-text-secondary,#94A3B8)]">
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
      title={inspection.template_name || "Inspection Details"}
      description="Evidence-forward review of captured inspection findings."
      actions={<PreviousPageButton to="/inspection/saved" />}
    >
      <Card className="mb-5 px-4 py-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusBadge variant={statusVariant(inspection.status)}>
            {inspection.status}
          </StatusBadge>
          <span className="text-[var(--theme-text-secondary,#94A3B8)]">
            Created: {format(new Date(inspection.created_at), "PPpp")}
          </span>
        </div>
      </Card>

      <div className="space-y-4">
        {inspection.result?.map((section, index) => (
          <Card key={index} className="px-4 py-4">
            <h2 className="mb-2 text-lg font-semibold">{section.title}</h2>
            <ul className="space-y-2">
              {section.items?.map((item, i) => (
                <li key={i} className="text-sm text-[var(--theme-text-secondary,#94A3B8)]">
                  <span className="font-semibold text-[var(--theme-text-primary,#E2E8F0)]">{item.name}:</span>{" "}
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
                          className="h-24 w-24 rounded border border-[var(--theme-card-border,#334155)] object-cover"
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
