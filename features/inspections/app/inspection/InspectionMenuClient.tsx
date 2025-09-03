// features/inspections/app/inspection/InspectionMenuClient.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import InspectionGroupList from "@inspections/components/InspectionGroupList";
import type { InspectionCategory } from "@inspections/lib/inspection/masterInspectionList";
import { toInspectionCategories } from "@/features/inspections/lib/inspection/normalize";
import { Button } from "@shared/components/ui/Button";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

export default function InspectionMenuClient() {
  const supabase = createClientComponentClient<DB>();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [active, setActive] = useState<InspectionCategory[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("inspection_templates")
        .select("*")
        .order("created_at", { ascending: false });
      setTemplates(data ?? []);
    })();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Inspection Templates</h1>

      <div className="grid gap-3 md:grid-cols-2">
        {templates.map((t) => (
          <div key={t.id} className="rounded border border-neutral-700 p-3">
            <div className="mb-2 text-white">{t.template_name ?? "Untitled"}</div>
            <Button
              onClick={() =>
                setActive(toInspectionCategories(t.sections as unknown))
              }
            >
              Preview
            </Button>
          </div>
        ))}
      </div>

      {active && (
        <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4">
          <h2 className="mb-3 text-lg font-semibold text-orange-400">
            Preview
          </h2>
          <InspectionGroupList categories={active} />
        </div>
      )}
    </div>
  );
}