"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import { Button } from "@shared/components/ui/Button";
import { Textarea } from "@shared/components/ui/textarea";
import { Input } from "@shared/components/ui/input";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

import InspectionGroupList from "@inspections/components/InspectionGroupList";
import type { InspectionCategory } from "@inspections/lib/inspection/types";
import { toInspectionCategories } from "@inspections/lib/inspection/normalize";
import useVoiceGenerate from "@inspections/hooks/useVoiceGenerate";
import { MicrophoneIcon } from "@heroicons/react/24/solid";

type DB = Database;
type TemplatesRow = DB["public"]["Tables"]["inspection_templates"]["Row"];
type TemplatesInsert = DB["public"]["Tables"]["inspection_templates"]["Insert"];

const DRAFT_KEY = "customInspectionDraft:v1";

export default function CustomInspectionPage() {
  const supabase = createClientComponentClient<DB>();

  // --- Authoring state
  const [prompt, setPrompt] = useState("");
  const [sections, setSections] = useState<InspectionCategory[]>([]);
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

  // Auth + load my recent templates
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

  // Autosave → localStorage
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

  // Resume draft
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
    } catch { /* ignore */ }
  }, []);

  // Generate sections from a prompt
  async function generateInspection() {
    if (!prompt.trim()) return;
    setLoadingGen(true);
    try {
      const res = await fetch("/api/generate-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json: unknown = await res.json();
      setSections(toInspectionCategories((json as any)?.categories));
      if (!templateName.trim()) {
        // quick sensible default
        setTemplateName("Custom Inspection");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Generate failed:", err);
    } finally {
      setLoadingGen(false);
    }
  }

  async function generateFromText(text: string) {
    const t = text.trim();
    if (!t) return;
    setPrompt(t);
    await generateInspection();
  }

  // Voice capture
  const { listening, start, stop } = useVoiceGenerate({
    live: (t) => setPrompt(t),
    onFinal: (t) => void generateFromText(t),
    autoStopMs: 1200,
  });

  // Save template
  async function saveTemplate() {
    if (!userId) return alert("Not signed in.");
    if (!templateName.trim()) return alert("Template name is required.");
    if (sections.length === 0) return alert("No sections to save.");

    setSaving(true);
    try {
      const payload: TemplatesInsert = {
        user_id: userId,
        template_name: templateName,
        sections: sections as unknown as TemplatesInsert["sections"],
        description: description || null,
        tags: tags
          ? tags.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
        vehicle_type: vehicleType || null,
        is_public: isPublic,
      };

      const { error } = await supabase.from("inspection_templates").insert(payload);
      if (error) {
        console.error(error.message);
        alert("Failed to save template.");
        return;
      }

      localStorage.removeItem(DRAFT_KEY);

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

  // Load/Delete existing templates
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
    setSaved(prev => prev.filter(x => x.id !== id));
  }

  // ---------------- UI ----------------
  return (
    <div className="min-h-screen px-4 py-6 text-white">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PreviousPageButton to="/inspection" />
          <div>
            <h1 className="text-2xl font-semibold">
              {templateName || "New Inspection Template"}
            </h1>
            <p className="text-sm text-neutral-400">
              Build a checklist with AI, then fine-tune sections and save.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex select-none items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs">
            <input
              type="checkbox"
              className="accent-orange-500"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            Share publicly
          </label>
          <Button onClick={saveTemplate} disabled={saving || sections.length === 0}>
            {saving ? "Saving…" : "Save Template"}
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT: Builder */}
        <div className="space-y-6">
          {/* Generate card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 p-4">
              <h2 className="text-lg font-semibold">Generate with AI</h2>
              <p className="text-sm text-neutral-400">
                Tell us what to include (e.g., “brakes, tires, lights, fluids”).
              </p>
            </div>

            <div className="p-4 space-y-3">
              <Textarea
                className="w-full text-black"
                rows={4}
                placeholder="Describe sections/items you want in this inspection…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={generateInspection} disabled={loadingGen}>
                  {loadingGen ? "Generating…" : "Generate Sections"}
                </Button>

                <button
                  type="button"
                  onClick={() => (listening ? stop() : start())}
                  className={
                    "rounded border px-3 py-2 text-sm transition " +
                    (listening
                      ? "border-red-500 text-red-400"
                      : "border-white/20 text-white hover:border-orange-500")
                  }
                  title={listening ? "Stop voice" : "Speak prompt"}
                  aria-pressed={listening}
                >
                  <span className="inline-flex items-center gap-2">
                    <MicrophoneIcon className="h-4 w-4" />
                    {listening ? "Listening…" : "Use Voice"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Meta card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 p-4">
              <h2 className="text-lg font-semibold">Template details</h2>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <Input
                className="text-black md:col-span-2"
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
                className="text-black"
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
            </div>
          </div>

          {/* Sections editor */}
          {sections.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900">
              <div className="border-b border-neutral-800 p-4">
                <h2 className="text-lg font-semibold">
                  Sections ({sections.length})
                </h2>
                <p className="text-sm text-neutral-400">
                  Drag, rename, or edit items in each group.
                </p>
              </div>
              <div className="p-4">
                <InspectionGroupList
                  categories={sections}
                  editable
                  onChange={(next) => setSections(next)}
                />
              </div>
            </div>
          )}

          {/* Spacer to avoid sticky overlap */}
          <div className="h-20" />
        </div>

        {/* RIGHT: Preview / Saved */}
        <aside className="space-y-6">
          {/* Preview card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-300">
              Preview
            </h3>
            <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-lg font-medium">
                {templateName || "Untitled template"}
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                {vehicleType ? `Vehicle: ${vehicleType} • ` : ""}
                {isPublic ? "Public" : "Private"}
              </div>
              {description ? (
                <p className="mt-3 text-sm text-neutral-300">{description}</p>
              ) : null}
              <div className="mt-3 text-xs text-neutral-400">
                {sections.length} section{sections.length === 1 ? "" : "s"} •{" "}
                {sections.reduce((n, s) => n + (s.items?.length ?? 0), 0)} item
                {sections.reduce((n, s) => n + (s.items?.length ?? 0), 0) === 1 ? "" : "s"}
              </div>
              {tags && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((t) => (
                      <span
                        key={t}
                        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300"
                      >
                        #{t}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Saved list */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">
              My recent templates
            </h3>
            {saved.length === 0 ? (
              <p className="text-xs text-neutral-500">No saved templates yet.</p>
            ) : (
              <ul className="space-y-2">
                {saved.slice(0, 8).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-950 p-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {t.template_name}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {t.created_at
                          ? new Date(t.created_at).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-2">
                      <button
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-orange-500"
                        onClick={() => loadTemplate(t)}
                      >
                        Load
                      </button>
                      <button
                        className="rounded border border-red-600/60 px-2 py-1 text-xs text-red-300 hover:border-red-500"
                        onClick={() => deleteTemplate(t.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto max-w-screen-2xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-neutral-400">
              {sections.length} section{sections.length === 1 ? "" : "s"} •{" "}
              {sections.reduce((n, s) => n + (s.items?.length ?? 0), 0)} item
              {sections.reduce((n, s) => n + (s.items?.length ?? 0), 0) === 1 ? "" : "s"} in template
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded border border-neutral-700 px-3 py-2 text-sm hover:border-orange-500"
                onClick={() => localStorage.removeItem(DRAFT_KEY)}
                title="Clear draft from this device"
              >
                Clear draft
              </button>
              <Button onClick={saveTemplate} disabled={saving || sections.length === 0}>
                {saving ? "Saving…" : "Save Template"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}