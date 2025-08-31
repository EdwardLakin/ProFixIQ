// features/inspections/app/inspection/custom-inspection/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import { Textarea } from "@shared/components/ui/textarea";
import { Input } from "@shared/components/ui/input";
import InspectionGroupList from "@inspections/components/InspectionGroupList";
import type { InspectionCategory } from "@inspections/lib/inspection/masterInspectionList";

type DB = Database;
type TemplatesRow   = DB["public"]["Tables"]["inspection_templates"]["Row"];
type TemplatesInsert= DB["public"]["Tables"]["inspection_templates"]["Insert"];

export default function CustomInspectionPage() {
  const supabase = createClientComponentClient<DB>();

  // prompt -> generate sections (your UI model)
  const [prompt, setPrompt] = useState("");
  const [sections, setSections] = useState<InspectionCategory[]>([]);

  // minimal template meta
  const [templateName, setTemplateName] = useState("");

  // saved (mine)
  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Pick<TemplatesRow, "id" | "template_name" | "sections">[]>([]);

  const [loading, setLoading] = useState(false);

  // auth + load my recent templates
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("inspection_templates")
        .select("id, template_name, sections")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setSaved(data ?? []);
    })();
  }, [supabase]);

  async function generateInspection() {
    setLoading(true);
    try {
      const res = await fetch("/api/generate-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data: { categories: InspectionCategory[] } = await res.json();
      setSections(data?.categories ?? []);
    } catch (err) {
      console.error("Error generating inspection:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    if (!userId || !templateName || sections.length === 0) return;

    const payload: TemplatesInsert = {
      user_id: userId,
      template_name: templateName,
      // cast UI model to DB json[] column
      sections: (sections as unknown) as TemplatesInsert["sections"],
      description: null,
      tags: null,
      vehicle_type: null,
      is_public: false,
    };

    const { error } = await supabase.from("inspection_templates").insert([payload]);
    if (error) {
      console.error("Save error:", error.message);
      return;
    }

    // refresh list
    const { data } = await supabase
      .from("inspection_templates")
      .select("id, template_name, sections")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    setSaved(data ?? []);
  }

  function loadTemplate(t: Pick<TemplatesRow, "id" | "template_name" | "sections">) {
    setTemplateName(t.template_name ?? "");
    setSections(((t.sections ?? []) as unknown) as InspectionCategory[]);
  }

  async function deleteTemplate(id: string) {
    if (!userId) return;
    const { error } = await supabase.from("inspection_templates").delete().eq("id", id);
    if (error) {
      console.error("Delete error:", error.message);
      return;
    }
    setSaved((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-3xl font-bold text-white">Custom Inspection Generator</h1>

      <Textarea
        placeholder="e.g. Create an inspection for brakes, lights, and fluids"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="w-full text-black"
        rows={4}
      />
      <Button onClick={generateInspection} disabled={loading} className="mt-4">
        {loading ? "Generating..." : "Generate Inspection"}
      </Button>

      {sections.length > 0 && (
        <div className="mt-6">
          <Input
            className="mb-2 w-full text-black"
            placeholder="Name your template"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <Button onClick={saveTemplate}>Save Template</Button>

          <div className="mt-8">
            <InspectionGroupList categories={sections} editable />
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-2 text-2xl font-semibold text-white">Saved Templates</h2>
          <ul className="space-y-2">
            {saved.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded bg-gray-800 p-4"
              >
                <span className="font-medium text-white">{t.template_name}</span>
                <div className="space-x-2">
                  <Button onClick={() => loadTemplate(t)}>Load</Button>
                  <Button variant="destructive" onClick={() => deleteTemplate(t.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}