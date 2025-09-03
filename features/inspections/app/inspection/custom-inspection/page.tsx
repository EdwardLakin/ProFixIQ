// features/inspections/app/inspection/custom-inspection/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import { Button } from "@shared/components/ui/Button";
import { Textarea } from "@shared/components/ui/textarea";
import { Input } from "@shared/components/ui/input";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

import InspectionGroupList from "@inspections/components/InspectionGroupList";
import type {
  InspectionCategory,
} from "@inspections/lib/inspection/masterInspectionList";
import { toInspectionCategories } from "@inspections/lib/inspection/normalize";

type DB = Database;
type TemplatesRow     = DB["public"]["Tables"]["inspection_templates"]["Row"];
type TemplatesInsert  = DB["public"]["Tables"]["inspection_templates"]["Insert"];

const DRAFT_KEY = "customInspectionDraft:v1";

export default function CustomInspectionPage() {
  const supabase = createClientComponentClient<DB>();

  // ---- Authoring state ------------------------------------------------------
  const [prompt, setPrompt] = useState("");
  const [sections, setSections] = useState<InspectionCategory[]>([]);

  // Template metadata
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [tags, setTags] = useState<string>("");
  const [isPublic, setIsPublic] = useState(false);

  // Saved templates (mine)
  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState<
    Pick<TemplatesRow, "id" | "template_name" | "sections" | "created_at">[]
  >([]);

  // UI state
  const [loadingGen, setLoadingGen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- Auth + load my recent templates -------------------------------------
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("inspection_templates")
        .select("id, template_name, sections, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setSaved(data ?? []);
    })();
  }, [supabase]);

  // ---- Autosave draft to localStorage (debounced) ---------------------------
  const draftJson = useMemo(
    () =>
      JSON.stringify({
        prompt,
        sections,
        templateName,
        description,
        vehicleType,
        tags,
        isPublic,
      }),
    [prompt, sections, templateName, description, vehicleType, tags, isPublic],
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, draftJson);
    }, 500);
    return () => clearTimeout(id);
  }, [draftJson]);

  // Resume draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        prompt?: string;
        sections?: InspectionCategory[];
        templateName?: string;
        description?: string;
        vehicleType?: string;
        tags?: string;
        isPublic?: boolean;
      };
      if (d.prompt) setPrompt(d.prompt);
      if (Array.isArray(d.sections)) setSections(d.sections);
      if (d.templateName) setTemplateName(d.templateName);
      if (d.description) setDescription(d.description);
      if (d.vehicleType) setVehicleType(d.vehicleType);
      if (typeof d.tags === "string") setTags(d.tags);
      if (typeof d.isPublic === "boolean") setIsPublic(d.isPublic);
    } catch {
      /* ignore */
    }
  }, []);

  // ---- Generate sections from a prompt (API you already wired) --------------
  async function generateInspection() {
    if (!prompt.trim()) return;
    setLoadingGen(true);
    try {
      const res = await fetch("/api/generate-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      // Normalize to the UI shape in case the API returns a slightly different structure
      setSections(toInspectionCategories(json?.categories));
    } catch (err) {
      console.error("Generate failed:", err);
    } finally {
      setLoadingGen(false);
    }
  }

  // ---- Save template to DB --------------------------------------------------
  async function saveTemplate() {
    if (!userId) return alert("Not signed in.");
    if (!templateName.trim()) return alert("Template name is required.");
    if (sections.length === 0) return alert("No sections to save.");

    setSaving(true);
    try {
      const payload: TemplatesInsert = {
        user_id: userId,
        template_name: templateName,
        sections: (sections as unknown) as TemplatesInsert["sections"], // JSONB[]
        description: description || null,
        tags: tags
          ? tags.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
        vehicle_type: vehicleType || null,
        is_public: isPublic,
      };

      const { error } = await supabase
        .from("inspection_templates")
        .insert(payload);
      if (error) {
        console.error(error.message);
        alert("Failed to save template.");
        return;
      }

      // Clear draft once saved
      localStorage.removeItem(DRAFT_KEY);

      // Refresh list
      const { data } = await supabase
        .from("inspection_templates")
        .select("id, template_name, sections, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      setSaved(data ?? []);

      alert("Template saved.");
    } finally {
      setSaving(false);
    }
  }

  // ---- Load/Delete existing templates --------------------------------------
  function loadTemplate(t: Pick<TemplatesRow, "id" | "template_name" | "sections">) {
    setTemplateName(t.template_name ?? "");
    setSections(toInspectionCategories(t.sections as unknown));
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="min-h-screen px-4 py-6 text-white">
      <div className="mb-4 flex items-center justify-between">
        <PreviousPageButton to="/inspection" />
        <h1 className="text-3xl font-bold">Custom Inspection</h1>
      </div>

      {/* Prompt → Generate */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <label className="mb-2 block text-sm font-semibold text-neutral-300">
          Describe what to include
        </label>
        <Textarea
          className="w-full text-black"
          rows={4}
          placeholder="e.g. brakes, lights, fluids…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button className="mt-3" onClick={generateInspection} disabled={loadingGen}>
          {loadingGen ? "Generating…" : "Generate Sections"}
        </Button>
      </div>

      {/* Template meta */}
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input
          className="text-black"
          placeholder="Template name"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
        <Input
          className="text-black"
          placeholder="Vehicle type (optional)"
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
        />
        <Input
          className="text-black md:col-span-2"
          placeholder="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <Textarea
          className="text-black md:col-span-2"
          rows={3}
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex items-center gap-2 md:col-span-2">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          <span>Share template publicly</span>
        </label>
      </div>

      {/* Sections editor */}
      {sections.length > 0 && (
        <div className="mt-6">
          <InspectionGroupList
            categories={sections}
            editable
            onChange={(next) => setSections(next)}
          />
          <div className="mt-4 flex gap-3">
            <Button onClick={saveTemplate} disabled={saving}>
              {saving ? "Saving…" : "Save Template"}
            </Button>
          </div>
        </div>
      )}

      {/* Saved templates list */}
      {saved.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-2 text-2xl font-semibold text-white">Saved Templates</h2>
          <ul className="space-y-2">
            {saved.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-2 rounded border border-neutral-800 bg-neutral-900 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium">{t.template_name}</div>
                  <div className="text-xs text-neutral-400">
                    {t.created_at
                      ? new Date(t.created_at).toLocaleString()
                      : "—"}
                  </div>
                </div>
                <div className="flex gap-2">
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