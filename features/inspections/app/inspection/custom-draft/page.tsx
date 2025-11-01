// features/inspections/app/inspection/custom-draft/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { InspectionSection } from "@inspections/lib/inspection/types";
import toast from "react-hot-toast";

export default function CustomDraftPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [vehicleType] = useState(
    (sp.get("vehicleType") as "car" | "truck" | "bus" | "trailer" | null) || null
  );
  const [sections, setSections] = useState<InspectionSection[]>([]);

  // Load what the builder wrote into sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("customInspection:sections");
      const t = sessionStorage.getItem("customInspection:title");
      const includeOilRaw = sessionStorage.getItem("customInspection:includeOil");
      const includeOil = includeOilRaw ? JSON.parse(includeOilRaw) === true : false;

      if (t && t.trim()) setTitle(t.trim());
      if (raw) {
        const parsed = JSON.parse(raw) as InspectionSection[];
        setSections(includeOil ? [...parsed, buildOilChangeSection()] : parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const saveTemplate = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return toast.error("Please sign in.");

    const payload: Database["public"]["Tables"]["inspection_templates"]["Insert"] = {
      user_id: u.user.id,
      template_name: title || "Custom Template",
      sections: sections as any,
      description: "Created from Custom Draft",
      vehicle_type: vehicleType || undefined,
      tags: ["custom", "draft"],
      is_public: false,
    };

    const { error, data } = await supabase
      .from("inspection_templates")
      .insert(payload)
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      // eslint-disable-next-line no-console
      console.error(error);
      return toast.error("Failed to save template.");
    }

    toast.success("Template saved.");
    // optional: send them to templates list or back to WO
    router.replace(`/inspection/templates`);
  };

  return (
    <div className="px-4 py-6 text-white">
      <h1 className="mb-3 text-2xl font-bold">Template Draft</h1>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Template name</span>
          <input
            className="rounded bg-neutral-800 px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="self-end text-sm text-neutral-400">
          Vehicle type: {vehicleType ?? "—"}
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-neutral-400">
          No sections loaded. Go back to the builder.
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((sec, i) => (
            <div key={i} className="rounded border border-neutral-800 bg-neutral-900 p-3">
              <div className="mb-2 font-semibold text-orange-400">{sec.title}</div>
              <ul className="grid gap-1 text-sm text-neutral-300">
                {sec.items.map((it, j) => (
                  <li key={j} className="truncate">
                    {it.item ?? (it as any).name ?? "Item"}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={saveTemplate}
          className="rounded bg-amber-600 px-4 py-2 font-semibold text-black hover:bg-amber-500"
        >
          Save as Template
        </button>
      </div>
    </div>
  );
}

/* ——— helpers ——— */
function buildOilChangeSection(): InspectionSection {
  return {
    title: "Oil Change",
    items: [
      { item: "Drain engine oil", status: "na" },
      { item: "Replace oil filter", status: "na" },
      { item: "Refill with correct viscosity", status: "na" },
      { item: "Reset maintenance reminder", status: "na" },
      { item: "Inspect for leaks after start", status: "na" },
    ],
  };
}