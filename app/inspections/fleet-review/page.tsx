//app/inspections/fleet-review/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";

type DB = Database;
type DutyClass = "light" | "medium" | "heavy";

type FleetFormUpload = DB["public"]["Tables"]["fleet_form_uploads"]["Row"];

type EditableItem = { item: string; unit?: string | null };
type EditableSection = { title: string; items: EditableItem[] };

/* ------------------------ parsed_sections normalizer ------------------------ */

function normalizeParsedSections(parsed: FleetFormUpload["parsed_sections"]): EditableSection[] {
  if (!Array.isArray(parsed)) return [];

  const sections: EditableSection[] = [];

  for (const sec of parsed) {
    if (typeof sec !== "object" || sec === null) continue;

    const sectionCandidate = sec as {
      title?: unknown;
      items?: unknown;
    };

    const rawTitle = sectionCandidate.title;
    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";

    const itemsRaw = Array.isArray(sectionCandidate.items)
      ? (sectionCandidate.items as unknown[])
      : [];

    const items: EditableItem[] = [];

    for (const item of itemsRaw) {
      if (typeof item !== "object" || item === null) continue;

      const itemCandidate = item as {
        item?: unknown;
        unit?: unknown;
      };

      const rawLabel = itemCandidate.item;
      const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
      if (!label) continue;

      const rawUnit = itemCandidate.unit;
      let unit: string | null = null;
      if (typeof rawUnit === "string" && rawUnit.trim().length > 0) {
        unit = rawUnit;
      }

      items.push({ item: label, unit });
    }

    if (!title && items.length === 0) continue;

    sections.push({
      title: title || "Section",
      items,
    });
  }

  return sections;
}

/* -------------------------------------------------------------------------- */

export default function FleetFormReviewPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(
    () => createClientComponentClient<DB>(),
    [],
  );

  const uploadId = sp.get("uploadId");
  const vehicleTypeParam = sp.get("vehicleType") || "";
  const dutyClassParam = sp.get("dutyClass") as DutyClass | "" | null;
  const titleHintParam = sp.get("titleHint") || "";

  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<FleetFormUpload | null>(null);
  const [sections, setSections] = useState<EditableSection[]>([]);
  const [templateTitle, setTemplateTitle] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadId) {
      setErrorMsg("Missing uploadId.");
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from("fleet_form_uploads")
        .select("*")
        .eq("id", uploadId)
        .maybeSingle<FleetFormUpload>();

      if (error || !data) {
        // eslint-disable-next-line no-console
        console.error("fleet_form_upload fetch error:", error);
        setErrorMsg("Unable to load fleet form.");
        setLoading(false);
        return;
      }

      setUpload(data);

      const editable = normalizeParsedSections(data.parsed_sections);
      setSections(editable);

      const defaultTitle =
        titleHintParam ||
        data.original_filename?.replace(/\.[^.]+$/, "") ||
        "Fleet Inspection Template";

      setTemplateTitle(defaultTitle);

      setLoading(false);
    })();
  }, [uploadId, supabase, titleHintParam]);

  const statusChip = useMemo(() => {
    const s = upload?.status || "";
    if (!s) return "Unknown";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [upload]);

  const dutyClass: DutyClass | "" = dutyClassParam || "";

  const handleSectionTitleChange = (index: number, title: string) => {
    setSections((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], title };
      return next;
    });
  };

  const handleItemChange = (
    sectionIndex: number,
    itemIndex: number,
    field: "item" | "unit",
    value: string,
  ) => {
    setSections((prev) => {
      const next = [...prev];
      const sec = next[sectionIndex];
      const items = [...sec.items];

      const updated: EditableItem =
        field === "item"
          ? {
              ...items[itemIndex],
              item: value,
            }
          : {
              ...items[itemIndex],
              unit: value || null,
            };

      items[itemIndex] = updated;
      next[sectionIndex] = { ...sec, items };
      return next;
    });
  };

  const handleAddSection = () => {
    setSections((prev) => [
      ...prev,
      { title: "New Section", items: [{ item: "New item", unit: null }] },
    ]);
  };

  const handleAddItem = (sectionIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      const sec = next[sectionIndex];
      next[sectionIndex] = {
        ...sec,
        items: [...sec.items, { item: "New item", unit: null }],
      };
      return next;
    });
  };

  const handleUseInDraft = () => {
    if (!sections.length) {
      setErrorMsg("Add at least one section with items before continuing.");
      return;
    }

    const cleanedSections: EditableSection[] = sections
      .map((s) => ({
        title: s.title.trim() || "Section",
        items: s.items
          .map<EditableItem>((it) => ({
            item: (it.item || "").trim(),
            unit: it.unit && it.unit.trim().length > 0 ? it.unit : null,
          }))
          .filter((it) => it.item.length > 0),
      }))
      .filter((s) => s.items.length > 0);

    if (!cleanedSections.length) {
      setErrorMsg("All sections are empty — add items before continuing.");
      return;
    }

    const title =
      templateTitle.trim() ||
      titleHintParam ||
      "Imported Fleet Inspection";

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        "customInspection:sections",
        JSON.stringify(cleanedSections),
      );
      window.sessionStorage.setItem("customInspection:title", title);
      window.sessionStorage.setItem(
        "customInspection:includeOil",
        JSON.stringify(false),
      );
      if (dutyClass) {
        window.sessionStorage.setItem("customInspection:dutyClass", dutyClass);
      }
    }

    const qs = new URLSearchParams();
    qs.set("template", title);
    if (vehicleTypeParam) qs.set("vehicleType", vehicleTypeParam);
    if (dutyClass) qs.set("dutyClass", dutyClass);
    qs.set("source", "fleet-import");
    if (uploadId) qs.set("fleetUploadId", uploadId);

    router.push(`/inspections/custom-draft?${qs.toString()}`);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-white">
      {/* metallic / copper wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      />

      {/* Header + chips */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-blackops uppercase tracking-[0.22em] text-neutral-400">
            Fleet Form Review
          </div>
          <h1 className="mt-1 text-xl font-blackops text-neutral-50 md:text-2xl">
            Map fleet form into a ProFixIQ template
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
          <span className="rounded-full border border-neutral-600 bg-black/60 px-2 py-1 text-neutral-300">
            Status:{" "}
            <span className="font-semibold text-neutral-100">
              {statusChip}
            </span>
          </span>
          {vehicleTypeParam && (
            <span className="rounded-full border border-neutral-600 bg-black/60 px-2 py-1 text-neutral-300">
              Vehicle:{" "}
              <span className="font-semibold text-neutral-100">
                {vehicleTypeParam}
              </span>
            </span>
          )}
          {dutyClass && (
            <span className="rounded-full border border-neutral-600 bg-black/60 px-2 py-1 text-neutral-300">
              Duty:{" "}
              <span className="font-semibold text-neutral-100">
                {dutyClass}
              </span>
            </span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-xl border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-6 text-sm text-neutral-300 shadow-[0_24px_80px_rgba(0,0,0,0.95)]">
          Loading fleet form…
        </div>
      ) : !upload ? (
        <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-6 text-sm text-neutral-300 shadow-[0_24px_80px_rgba(0,0,0,0.95)]">
          No fleet form found for that id.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr),minmax(0,1.4fr)]">
          {/* Left: OCR text */}
          <section
            className="
              relative rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)]
              bg-black/70 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl
            "
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-blackops uppercase tracking-[0.18em] text-neutral-400">
                  OCR Snapshot
                </div>
                <p className="mt-1 text-xs text-neutral-300">
                  Full text detected from the fleet’s inspection form.
                </p>
              </div>
              <span className="rounded-full border border-neutral-700 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Read-only
              </span>
            </div>

            <div className="h-[320px] overflow-auto rounded-xl border border-[color:var(--metal-border-soft,#374151)] bg-black/70 p-3 text-xs text-neutral-200">
              {upload.extracted_text?.trim() ? (
                upload.extracted_text.split("\n").map((line, idx) => (
                  <p key={idx} className="whitespace-pre-wrap">
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-neutral-500">
                  No OCR text stored for this form.
                </p>
              )}
            </div>

            <p className="mt-2 text-[10px] text-neutral-500">
              Use this as a reference if any sections or items look off on the
              right-hand side.
            </p>
          </section>

          {/* Right: sections + mapping */}
          <section
            className="
              relative rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)]
              bg-black/70 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl
            "
          >
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-[11px] font-blackops uppercase tracking-[0.18em] text-neutral-400">
                  Map to Template
                </div>
                <span className="rounded-full border border-neutral-700 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                  Editable
                </span>
              </div>

              <label className="flex flex-col gap-1 text-xs text-neutral-300">
                Template title
                <input
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  className="
                    rounded-xl border border-[color:var(--metal-border-soft,#374151)]
                    bg-black/75 px-3 py-2 text-xs text-white placeholder:text-neutral-500
                  "
                  placeholder="ABC Logistics – Daily Truck Inspection"
                />
              </label>
            </div>

            <div className="h-[360px] space-y-3 overflow-auto pr-1">
              {sections.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[color:var(--metal-border-soft,#374151)] bg-black/50 px-3 py-4 text-xs text-neutral-400">
                  No sections were parsed from this form. You can still build a
                  template by adding sections and items manually.
                </div>
              ) : (
                sections.map((sec, i) => (
                  <div
                    key={`${sec.title}-${i}`}
                    className="rounded-xl border border-[color:var(--metal-border-soft,#374151)] bg-black/75 px-3 py-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="flex flex-1 flex-col gap-1 text-[11px] text-neutral-300">
                        Section {i + 1} title
                        <input
                          value={sec.title}
                          onChange={(e) =>
                            handleSectionTitleChange(i, e.target.value)
                          }
                          className="
                            rounded-lg border border-[color:var(--metal-border-soft,#374151)]
                            bg-black/75 px-2 py-1.5 text-xs text-white placeholder:text-neutral-500
                          "
                          placeholder="Section title"
                        />
                      </label>
                      <span className="whitespace-nowrap text-[10px] text-neutral-500">
                        {sec.items.length} items
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {sec.items.map((it, j) => (
                        <div
                          key={`${i}-${j}-${it.item}`}
                          className="grid grid-cols-[minmax(0,1.6fr),minmax(0,0.7fr)] gap-2"
                        >
                          <input
                            value={it.item}
                            onChange={(e) =>
                              handleItemChange(i, j, "item", e.target.value)
                            }
                            className="
                              rounded-lg border border-[color:var(--metal-border-soft,#374151)]
                              bg-black/80 px-2 py-1.5 text-xs text-white placeholder:text-neutral-500
                            "
                            placeholder="Item label"
                          />
                          <input
                            value={it.unit ?? ""}
                            onChange={(e) =>
                              handleItemChange(i, j, "unit", e.target.value)
                            }
                            className="
                              rounded-lg border border-[color:var(--metal-border-soft,#374151)]
                              bg-black/80 px-2 py-1.5 text-xs text-white placeholder:text-neutral-500
                            "
                            placeholder="Unit (mm, psi, in, kPa, ft·lb…)"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => handleAddItem(i)}
                        className="
                          rounded-full border border-[color:var(--metal-border-soft,#374151)]
                          bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]
                          text-neutral-200 hover:bg-black/80
                        "
                      >
                        + Add item
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-3">
              <button
                type="button"
                onClick={handleAddSection}
                className="
                  rounded-full border border-[color:var(--metal-border-soft,#374151)]
                  bg-black/70 px-3 py-1.5 text-[10px] font-semibold uppercase
                  tracking-[0.16em] text-neutral-200 hover:bg-black/80
                "
              >
                + Add Section
              </button>

              <Button
                type="button"
                onClick={handleUseInDraft}
                className="
                  rounded-full border border-[color:var(--metal-border-soft,#374151)]
                  bg-black/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]
                  text-neutral-100 hover:bg-black/80 hover:border-neutral-500
                "
              >
                Use in Custom Draft
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}