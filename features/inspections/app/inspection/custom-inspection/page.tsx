"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database, InspectionSection } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import { Textarea } from "@shared/components/ui/textarea";
import { Input } from "@shared/components/ui/input";
import InspectionGroupList from "@inspections/components/InspectionGroupList";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];
type TemplateInsert = DB["public"]["Tables"]["inspection_templates"]["Insert"];

const DRAFT_KEY = "customInspectionDraft:v1";

export default function CustomInspectionPage() {
  const supabase = createClientComponentClient<DB>();

  // authoring state
  const [prompt, setPrompt] = useState("");
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [tags, setTags] = useState<string>("");
  const [isPublic, setIsPublic] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // load user id
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, [supabase]);

  // autosave draft (debounced to 500ms)
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
    const id = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, draftJson);
    }, 500);
    return () => clearTimeout(id);
  }, [draftJson]);

  // resume draft on mount
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as {
        prompt?: string;
        sections?: InspectionSection[];
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
    } catch {}
  }, []);

  // generate sections from prompt (same endpoint you used before)
  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/generate-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      // Expecting { categories: InspectionSection[] } shape
      const cats: InspectionSection[] = Array.isArray(data?.categories)
        ? data.categories
        : [];
      setSections(cats);
    } catch (e) {
      console.error("Generate failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!userId) return alert("Not signed in.");
    if (!templateName.trim()) return alert("Template name is required.");
    if (sections.length === 0) return alert("No sections to save.");

    setSaving(true);
    try {
      const insert: TemplateInsert = {
        user_id: userId,
        template_name: templateName,
        sections,                         // JSONB array, strongly typed
        description: description || null,
        tags: tags
          ? tags
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
        vehicle_type: vehicleType || null,
        is_public: isPublic,
        // optional: version defaults to 1 in SQL
      };

      const { error } = await supabase
        .from("inspection_templates")
        .insert(insert);
      if (error) {
        console.error(error.message);
        alert("Failed to save template.");
        return;
      }
      // clear draft once successfully saved
      localStorage.removeItem(DRAFT_KEY);
      alert("Template saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 text-white">
      <h1 className="mb-4 text-3xl font-bold">Custom Inspection</h1>

      {/* Prompt → Generate */}
      <Textarea
        className="w-full text-black"
        rows={4}
        placeholder="Describe what to include (e.g., brakes, lights, fluids)…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <Button className="mt-3" onClick={generate} disabled={loading}>
        {loading ? "Generating…" : "Generate Sections"}
      </Button>

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
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Button onClick={saveTemplate} disabled={saving}>
          {saving ? "Saving…" : "Save Template"}
        </Button>
      </div>
    </div>
  );
}