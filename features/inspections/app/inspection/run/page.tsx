//features/inspections/app/inspection/run/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

export default function RunInspectionPage() {
  const sp = useSearchParams();
  const supabase = createClientComponentClient<DB>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const templateId = sp.get("templateId");
    if (!templateId) {
      setError("Missing templateId in URL.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("inspection_templates")
          .select("*")
          .eq("id", templateId)
          .maybeSingle<TemplateRow>();

        if (error || !data) {
          // eslint-disable-next-line no-console
          console.error("Failed to load inspection template:", error);
          setError("Could not load inspection template.");
          return;
        }

        if (typeof window === "undefined") return;

        // Take current query params as a base
        const params: Record<string, string> = {};
        sp.forEach((value, key) => {
          params[key] = value;
        });

        // Normalize core fields for GenericInspectionScreen
        const title =
          data.template_name ||
          params.template ||
          "Inspection";

        params.template = title;
        params.templateId = data.id;

        if (data.vehicle_type && !params.vehicleType) {
          params.vehicleType = data.vehicle_type;
        }

        // Seed everything for GenericInspectionScreen
        sessionStorage.setItem("inspection:title", title);
        sessionStorage.setItem("inspection:params", JSON.stringify(params));

        if (data.sections) {
          sessionStorage.setItem(
            "inspection:sections",
            JSON.stringify(data.sections),
          );
        }

        setReady(true);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-neutral-300">
        Loading inspection template…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!ready) {
    return null;
  }

  // At this point GenericInspectionScreen will:
  // - read inspection:params + inspection:sections from sessionStorage
  // - generate a stable inspectionId
  // - show Save Draft / Finish Inspection / Save as Template, etc.
  return <GenericInspectionScreen />;
}