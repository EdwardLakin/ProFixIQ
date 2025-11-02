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
        router.replace("/inspections/templates");
        return;
      }

      const { data, error } = await supabase
        .from("inspection_templates")
        .select("template_name, sections, vehicle_type")
        .eq("id", templateId)
        .maybeSingle();

      if (error || !data) {
        toast.error("Template not found.");
        router.replace("/inspections/templates");
        return;
      }

      const sections = data.sections ?? [];
      const title = data.template_name ?? "Inspection";
      const vehicleType = String(data.vehicle_type ?? "");

      // Write session keys (kept for compatibility)
      sessionStorage.setItem("inspection:sections", JSON.stringify(sections));
      sessionStorage.setItem("inspection:title", title);
      sessionStorage.setItem("inspection:vehicleType", vehicleType);
      sessionStorage.setItem("inspection:template", "generic");
      sessionStorage.setItem("inspection:params", JSON.stringify(Object.fromEntries(sp)));

      // Also write legacy custom* keys so older flows don't bounce
      sessionStorage.setItem("customInspection:sections", JSON.stringify(sections));
      sessionStorage.setItem("customInspection:title", title);
      sessionStorage.setItem("customInspection:includeOil", JSON.stringify(false));

      // Forward to fill AND include template=generic in the URL
      const next = new URLSearchParams(sp.toString());
      next.delete("templateId");
      next.set("template", "generic"); // <- critical so /inspections/fill never bounces
      router.replace(`/inspections/fill?${next.toString()}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  return <div className="p-4 text-white">Preparing inspection…</div>;
}
