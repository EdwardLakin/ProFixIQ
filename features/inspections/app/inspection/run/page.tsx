// features/inspections/app/inspection/run/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import toast from "react-hot-toast";

export default function RunTemplateLoader() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();
  const templateId = sp.get("templateId");

  useEffect(() => {
    (async () => {
      if (!templateId) {
        toast.error("Missing templateId");
        router.replace("/inspections/templates"); // <-- plural
        return;
      }

      const { data, error } = await supabase
        .from("inspection_templates")
        .select("template_name, sections, vehicle_type")
        .eq("id", templateId)
        .maybeSingle();

      if (error || !data) {
        toast.error("Template not found.");
        router.replace("/inspections/templates"); // <-- plural
        return;
      }

      // Stage for the generic runtime renderer
      sessionStorage.setItem("inspection:sections", JSON.stringify(data.sections ?? []));
      sessionStorage.setItem("inspection:title", data.template_name ?? "Inspection");
      sessionStorage.setItem("inspection:vehicleType", String(data.vehicle_type ?? ""));

      // Let the fill screen/host know we're using the generic runtime
      sessionStorage.setItem("inspection:template", "generic");
      sessionStorage.setItem("inspection:params", JSON.stringify(Object.fromEntries(sp)));

      // Forward to fill, keeping any extra params (workOrderId, workOrderLineId, etc.)
      const next = new URLSearchParams(sp.toString());
      next.delete("templateId");
      router.replace(`/inspections/fill?${next.toString()}`); // <-- plural
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  return <div className="p-4 text-white">Preparing inspection…</div>;
}
