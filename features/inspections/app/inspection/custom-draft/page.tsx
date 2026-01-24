// /features/inspections/app/inspection/custom-draft/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type {
  InspectionSection,
  InspectionItem,
} from "@inspections/lib/inspection/types";
import { computeDefaultLaborHours } from "@inspections/lib/inspection/computeLabor";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";
import { toast } from "sonner";

const UNIT_OPTIONS = ["", "mm", "psi", "kPa", "in", "ft·lb"] as const;

type VehicleType = "car" | "truck" | "bus" | "trailer";
type DutyClass = "light" | "medium" | "heavy";
type GridMode = "hyd" | "air" | "none";

/** Narrow Insert type to include labor_hours until your generated types include it */
type InsertTemplate =
  Database["public"]["Tables"]["inspection_templates"]["Insert"] & {
    labor_hours?: number | null;
  };

type UpdateTemplate =
  Database["public"]["Tables"]["inspection_templates"]["Update"] & {
    labor_hours?: number | null;
  };

/* ---------------------------- safe type helpers ---------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeItemLike(i: unknown): {
  item: string;
  unit: InspectionItem["unit"];
  status: InspectionItem["status"] | undefined;
  notes: InspectionItem["notes"] | undefined;
  value?: InspectionItem["value"];
  laborHours?: InspectionItem["laborHours"];
  parts?: InspectionItem["parts"];
} {
  if (!isRecord(i)) {
    return { item: "", unit: null, status: "na", notes: "" };
  }

  // ✅ MAIN FIX: support label/title/description keys used by grid builders
  const label = asString(
    i.item ?? i.name ?? i.label ?? i.title ?? i.description,
  ).trim();

  const unit = (isRecord(i) ? (i.unit as InspectionItem["unit"]) : null) ?? null;

    const rawStatus = isRecord(i) ? i.status : undefined;

  const status: InspectionItem["status"] | undefined =
    rawStatus === "ok" ||
    rawStatus === "fail" ||
    rawStatus === "na" ||
    rawStatus === "recommend"
      ? rawStatus
      : rawStatus === "unset"
        ? undefined
        : "na";

  const notes = asNullableString(isRecord(i) ? i.notes : null) ?? "";

  // Preserve optional fields if present (prevents losing measurement/grid info)
  const value =
    typeof i.value === "string" || typeof i.value === "number"
      ? (i.value as InspectionItem["value"])
      : undefined;

  const laborHours =
    typeof i.laborHours === "number" ? i.laborHours : undefined;

  const parts = Array.isArray(i.parts)
    ? (i.parts as InspectionItem["parts"])
    : undefined;

  return { item: label, unit, status, notes, value, laborHours, parts };
}

/** Merge sections by title & dedupe items by label (case-insensitive) */
function normalizeSections(input: unknown): InspectionSection[] {
  if (!Array.isArray(input)) return [];
  const byTitle = new Map<string, InspectionSection>();

  for (const s of input) {
    if (!isRecord(s)) continue;
    const title = asString(s.title).trim();
    if (!title) continue;

    const itemsRaw = Array.isArray(s.items) ? (s.items as unknown[]) : [];
    const items = itemsRaw
      .map((it) => normalizeItemLike(it))
      .filter((it) => it.item.length > 0);

    if (!byTitle.has(title)) {
      byTitle.set(title, { title, items: [] });
    }
    const bucket = byTitle.get(title)!;
    const seen = new Set(
      (bucket.items ?? []).map((x) => (x.item ?? "").toLowerCase()),
    );

    for (const it of items) {
      const key = (it.item ?? "").toLowerCase();
      if (!seen.has(key)) {
        bucket.items = [...(bucket.items ?? []), it];
        seen.add(key);
      }
    }
  }

  return Array.from(byTitle.values()).filter(
    (s) => (s.items?.length ?? 0) > 0,
  );
}

function buildOilChangeSection(): InspectionSection {
  return {
    title: "Oil Change",
    items: [
      { item: "Drain engine oil", status: "na" },
      { item: "Replace oil filter", status: "na" },
      { item: "Oil Capacity", status: "na" },
      { item: "Reset maintenance reminder", status: "na" },
      { item: "Inspect for leaks after start", status: "na" },
    ],
  };
}

/** Detect if the sections already include a Battery grid (for summary chip) */
function hasBatterySection(sections: InspectionSection[] | unknown): boolean {
  const s = Array.isArray(sections) ? (sections as InspectionSection[]) : [];
  return s.some((sec) => {
    const title = (sec.title || "").toLowerCase();
    if (title.includes("battery")) return true;
    return (sec.items ?? []).some((it) =>
      (it.item ?? "").toLowerCase().includes("battery"),
    );
  });
}

function normalizeGridMode(v: string | null | undefined): GridMode | null {
  const s = (v || "").toLowerCase();
  if (s === "air" || s === "hyd" || s === "none") return s;
  return null;
}

/* -------------------------------- component -------------------------------- */

export default function CustomDraftPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  // if the user clicked "Edit" from the template list we expect ?templateId=...
  const templateId = sp.get("templateId");

  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(
    (sp.get("vehicleType") as VehicleType | null) || null,
  );
  const [dutyClass, setDutyClass] = useState<DutyClass | null>(
    (sp.get("dutyClass") as DutyClass | null) || null,
  );

  // ✅ track grid mode explicitly (builder can set air/hyd/none)
  const [gridMode, setGridMode] = useState<GridMode | null>(() => {
    // try URL first
    const fromUrl = normalizeGridMode(sp.get("grid"));
    if (fromUrl) return fromUrl;

    // then sessionStorage (what custom builder writes)
    if (typeof window !== "undefined") {
      const stored = normalizeGridMode(
        sessionStorage.getItem("customInspection:gridMode"),
      );
      if (stored) return stored;
    }

    // fallback: infer from duty class if present (legacy)
    const inferred = dutyClass === "heavy" ? "air" : dutyClass ? "hyd" : null;
    return inferred;
  });

  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [laborHours, setLaborHours] = useState<number>(0);
  const [savingNew, setSavingNew] = useState(false);
  const [savingExisting, setSavingExisting] = useState(false);
  const [running, setRunning] = useState(false);

  // 🔐 current user's shop (for shop-scoped templates)
  const [shopId, setShopId] = useState<string | null>(null);

  // Derived summary values
  const totalSections = sections.length;
  const totalItems = useMemo(
    () => sections.reduce((sum, s) => sum + (s.items?.length ?? 0), 0),
    [sections],
  );

  const dutyLabel =
    dutyClass === "light"
      ? "Light duty"
      : dutyClass === "medium"
        ? "Medium duty"
        : dutyClass === "heavy"
          ? "Heavy duty"
          : "—";

  const gridModeLabel =
    gridMode === "air"
      ? "Air brake corner grid (Steer + Drive)"
      : gridMode === "hyd"
        ? "Hydraulic brake grid (LF / RF / LR / RR)"
        : gridMode === "none"
          ? "No corner grid"
          : "Not specified";

  const vehicleLabel = vehicleType ? vehicleType : "—";

  const batteryPresent = useMemo(() => hasBatterySection(sections), [sections]);

  // build a quick lookup: normalized title -> master items (used for the add-item dropdown)
  const masterByTitle = useMemo(() => {
    const out = new Map<string, { item: string; unit?: string | null }[]>();
    for (const sec of masterInspectionList) {
      out.set(sec.title.trim().toLowerCase(), sec.items);
    }
    return out;
  }, []);

  function getMasterItemsForSection(title: string) {
    const key = (title || "").trim().toLowerCase();
    return masterByTitle.get(key) ?? [];
  }

  // 0) load current user's shop_id so new templates are shop-scoped
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;

      // try profiles.user_id first
      const byUser = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (byUser.data?.shop_id) {
        setShopId(byUser.data.shop_id);
        return;
      }

      // fallback: profiles.id == auth uid
      const byId = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", uid)
        .maybeSingle();

      if (byId.data?.shop_id) {
        setShopId(byId.data.shop_id);
      }
    })();
  }, [supabase]);

  // 1) try to load from sessionStorage (what custom builder wrote)
  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:sections")
          : null;
      const t =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:title")
          : null;
      const includeOilRaw =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:includeOil")
          : null;
      const storedDuty =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:dutyClass")
          : null;

      // ✅ also read the builder’s grid mode
      const storedGrid =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:gridMode")
          : null;

      const includeOil = includeOilRaw ? JSON.parse(includeOilRaw) === true : false;

      if (t && t.trim()) setTitle(t.trim());
      if (storedDuty) setDutyClass(storedDuty as DutyClass);
      if (storedGrid) {
        const g = normalizeGridMode(storedGrid);
        if (g) setGridMode(g);
      }

      if (raw) {
        const parsedUnknown = JSON.parse(raw) as unknown;
        const parsed = normalizeSections(parsedUnknown);

        // ✅ builder already injects oil; only add here if missing
        const hasOil = parsed.some(
          (s) => (s.title || "").trim().toLowerCase() === "oil change",
        );

        const withOil =
          includeOil && !hasOil
            ? normalizeSections([...parsed, buildOilChangeSection()])
            : parsed;

        setSections(withOil);

        const initialHours = computeDefaultLaborHours({
          vehicleType: vehicleType ?? "truck",
          sections: withOil,
        });
        setLaborHours(initialHours);
      }
    } catch {
      /* ignore bad session data */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep gridMode in sync if dutyClass changes and gridMode wasn't explicitly set
  useEffect(() => {
    if (gridMode) return;
    const inferred = dutyClass === "heavy" ? "air" : dutyClass ? "hyd" : null;
    if (inferred) setGridMode(inferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dutyClass]);

  // 2) if we came from "Edit template", pull it from Supabase and override
  useEffect(() => {
    if (!templateId) return;

    (async () => {
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("template_name, sections, vehicle_type, labor_hours, shop_id")
        .eq("id", templateId)
        .maybeSingle();

      if (error || !data) {
        console.error(error);
        toast.error("Could not load template.");
        return;
      }

      const normalized = normalizeSections(data.sections as unknown);
      setSections(normalized);
      setTitle(data.template_name || "Custom Inspection");

      if (data.vehicle_type) {
        setVehicleType(data.vehicle_type as VehicleType);
      }

      if (typeof data.labor_hours === "number") {
        setLaborHours(data.labor_hours);
      } else {
        const hours = computeDefaultLaborHours({
          vehicleType: (data.vehicle_type as VehicleType) ?? "truck",
          sections: normalized,
        });
        setLaborHours(hours);
      }

      if (data.shop_id && !shopId) {
        setShopId(data.shop_id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, supabase]);

  /* ----------------------------- editing helpers ----------------------------- */

  function addSection() {
    setSections((prev) => [
      ...prev,
      {
        title: "New Section",
        items: [{ item: "New Item", unit: null, status: "na" }],
      },
    ]);
  }

  function removeSection(idx: number) {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveSection(idx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function updateSectionTitle(idx: number, nextTitle: string) {
    setSections((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], title: nextTitle };
      return next;
    });
  }

  function addItem(secIdx: number) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      next[secIdx] = {
        ...s,
        items: [
          ...(s.items ?? []),
          { item: "New Item", unit: null, status: "na" },
        ],
      };
      return next;
    });
  }

  function removeItem(secIdx: number, itemIdx: number) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      next[secIdx] = {
        ...s,
        items: (s.items ?? []).filter((_, i) => i !== itemIdx),
      };
      return next;
    });
  }

  function updateItemLabel(secIdx: number, itemIdx: number, label: string) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      const items = [...(s.items ?? [])];
      items[itemIdx] = { ...items[itemIdx], item: label };
      next[secIdx] = { ...s, items };
      return next;
    });
  }

  function updateItemUnit(secIdx: number, itemIdx: number, unit: string) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      const items = [...(s.items ?? [])];
      items[itemIdx] = { ...items[itemIdx], unit: unit || null };
      next[secIdx] = { ...s, items };
      return next;
    });
  }

  function moveItem(secIdx: number, itemIdx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      const items = [...(s.items ?? [])];
      const j = itemIdx + dir;
      if (j < 0 || j >= items.length) return prev;
      [items[itemIdx], items[j]] = [items[j], items[itemIdx]];
      next[secIdx] = { ...s, items };
      return next;
    });
  }

  /* --------------------------------- actions -------------------------------- */

  // INSERT: Save as new template
  const saveTemplate = async () => {
    try {
      setSavingNew(true);
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        toast.error("Please sign in.");
        return;
      }

      const cleaned = normalizeSections(sections);
      if (cleaned.length === 0) {
        toast.error("Add at least one section with items.");
        return;
      }

      const payload: InsertTemplate = {
        template_name: (title || "").trim() || "Custom Template",
        sections:
          cleaned as unknown as Database["public"]["Tables"]["inspection_templates"]["Insert"]["sections"],
        description: "Created from Custom Draft",
        vehicle_type: vehicleType || undefined,
        tags: ["custom", "draft"],
        is_public: false,
        labor_hours: Number.isFinite(laborHours) ? laborHours : null,
        // user_id + shop_id are now injected by the trigger
      };

      const { error, data } = await supabase
        .from("inspection_templates")
        .insert(payload)
        .select("id")
        .maybeSingle();

      if (error || !data?.id) {
        console.error(error);
        toast.error("Failed to save template.");
        return;
      }

      toast.success("Template saved as new.");
      router.replace(`/inspections/templates`);
    } finally {
      setSavingNew(false);
    }
  };

  // UPDATE: Save changes to existing template (only if templateId present)
  const saveChanges = async () => {
    if (!templateId) {
      toast.error("No template to update.");
      return;
    }

    try {
      setSavingExisting(true);
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        toast.error("Please sign in.");
        return;
      }

      const cleaned = normalizeSections(sections);
      if (cleaned.length === 0) {
        toast.error("Add at least one section with items.");
        return;
      }

      const payload: UpdateTemplate = {
        template_name: (title || "").trim() || "Custom Template",
        sections:
          cleaned as unknown as Database["public"]["Tables"]["inspection_templates"]["Update"]["sections"],
        vehicle_type: vehicleType || undefined,
        labor_hours: Number.isFinite(laborHours) ? laborHours : null,
      };

      const { error, data } = await supabase
        .from("inspection_templates")
        .update(payload)
        .eq("id", templateId)
        .select("id")
        .maybeSingle();

      if (error || !data?.id) {
        console.error(error);
        toast.error("Failed to update template.");
        return;
      }

      toast.success("Template changes saved.");
    } finally {
      setSavingExisting(false);
    }
  };

  const saveAndRun = () => {
    try {
      setRunning(true);
      const cleaned = normalizeSections(sections);
      if (cleaned.length === 0) {
        toast.error("Add at least one section with items.");
        return;
      }
      sessionStorage.setItem("inspection:sections", JSON.stringify(cleaned));
      sessionStorage.setItem(
        "inspection:title",
        (title || "").trim() || "Inspection",
      );

      const qs = new URLSearchParams();
      qs.set("template", title || "Inspection");
      if (vehicleType) qs.set("vehicleType", vehicleType);
      if (dutyClass) qs.set("dutyClass", dutyClass);
      if (gridMode) qs.set("grid", gridMode);
      router.push(`/inspections/run?${qs.toString()}`);
    } finally {
      setRunning(false);
    }
  };

  /* ---------------------------------- UI ---------------------------------- */

  return (
    <div className="px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-black/75 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl md:p-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1
            className="text-xl font-bold tracking-[0.18em] text-orange-400 sm:text-2xl"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            Template Draft (Editable)
          </h1>

          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-neutral-600 bg-black/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-800"
          >
            ← Back
          </button>
        </div>

        {/* Summary strip */}
        <div className="mb-5 rounded-2xl border border-white/10 bg-black/70 px-3 py-3 text-xs text-neutral-200 md:flex md:items-center md:justify-between md:px-4">
          <div className="space-y-1 md:space-y-0 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Vehicle
              </span>
              <span className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-zinc-100">
                {vehicleLabel}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Duty
              </span>
              <span className="rounded-full bg-orange-500/10 px-2 py-1 text-[11px] font-semibold text-orange-300">
                {dutyLabel}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Corner Grid
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300">
                {gridModeLabel}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Batteries
              </span>
              <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-300">
                {batteryPresent ? "Battery grid present" : "No battery grid"}
              </span>
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400 md:mt-0">
            <span>
              Sections:{" "}
              <span className="font-semibold text-neutral-100">
                {totalSections}
              </span>
            </span>
            <span>
              Items:{" "}
              <span className="font-semibold text-neutral-100">
                {totalItems}
              </span>
            </span>
            <span>
              Labor:{" "}
              <span className="font-semibold text-neutral-100">
                {Number.isFinite(laborHours) ? laborHours.toFixed(2) : "0.00"}
              </span>{" "}
              hrs
            </span>
          </div>
        </div>

        {/* Header controls */}
        <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1.8fr),minmax(0,1fr),minmax(0,1fr),auto] md:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-300">Template name</span>
            <input
              className="rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-300">Vehicle type</span>
            <select
              className="rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              value={vehicleType ?? ""}
              onChange={(e) =>
                setVehicleType(
                  e.target.value ? (e.target.value as VehicleType) : null,
                )
              }
            >
              <option value="">— Not specified —</option>
              <option value="car">Car / SUV</option>
              <option value="truck">Truck</option>
              <option value="bus">Bus / Coach</option>
              <option value="trailer">Trailer</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-300">Duty class</span>
            <select
              className="rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              value={dutyClass ?? ""}
              onChange={(e) =>
                setDutyClass(
                  e.target.value ? (e.target.value as DutyClass) : null,
                )
              }
            >
              <option value="">— Not specified —</option>
              <option value="light">Light</option>
              <option value="medium">Medium</option>
              <option value="heavy">Heavy</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-300">
              Labor hours (inspection total)
            </span>
            <input
              type="number"
              min={0}
              step={0.25}
              inputMode="decimal"
              className="w-40 rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              value={Number.isFinite(laborHours) ? laborHours : 0}
              onChange={(e) => {
                const next = Number(e.target.value);
                setLaborHours(Number.isFinite(next) ? next : 0);
              }}
            />
          </label>
        </div>

        {/* Sections editor */}
        <div className="space-y-4">
          {sections.map((sec, i) => {
            const masterItemsForThisSection = getMasterItemsForSection(sec.title);
            return (
              <div
                key={`${sec.title}-${i}`}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/85 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.9)]"
              >
                {/* Section header */}
                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-orange-500/15 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-300">
                      Section {i + 1}
                    </span>
                    <input
                      className="min-w-[220px] max-w-full rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                      value={sec.title}
                      onChange={(e) => updateSectionTitle(i, e.target.value)}
                      placeholder="Section title"
                    />
                    <span className="text-[11px] text-neutral-400">
                      {(sec.items?.length ?? 0)} items
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => moveSection(i, -1)}
                      className="rounded-full border border-neutral-700 bg-black/60 px-2.5 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                      disabled={i === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                                        <button
                      onClick={() => moveSection(i, +1)}
                      className="rounded-full border border-neutral-700 bg-black/60 px-2.5 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                      disabled={i === sections.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeSection(i)}
                      className="rounded-full border border-red-600 bg-red-900/30 px-3 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-900/60"
                      title="Remove section"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Items list */}
                <div className="space-y-2">
                  {(sec.items ?? []).map((it, j) => {
                    const isPlaceholder = it.item === "New Item";
                    const hasMaster = masterItemsForThisSection.length > 0;

                    return (
                      <div
                        key={`${i}-${j}-${it.item}-${j}`}
                        className="grid grid-cols-1 gap-2 rounded-xl bg-black/55 p-2 sm:grid-cols-[minmax(0,1.4fr),140px,auto,auto] sm:items-center"
                      >
                        {/* label or dropdown */}
                        {isPlaceholder && hasMaster ? (
                          <select
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-sm text-white"
                            value=""
                            onChange={(e) =>
                              updateItemLabel(
                                i,
                                j,
                                e.target.value || "New Item",
                              )
                            }
                          >
                            <option value="">— pick an item —</option>
                            {masterItemsForThisSection.map((mi) => (
                              <option key={mi.item} value={mi.item}>
                                {mi.item}
                              </option>
                            ))}
                            <option value="Custom item…">Custom item…</option>
                          </select>
                        ) : (
                          <input
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500"
                            value={it.item}
                            onChange={(e) =>
                              updateItemLabel(i, j, e.target.value)
                            }
                            placeholder="Item label"
                          />
                        )}

                        {/* unit */}
                        <select
                          className="rounded-lg border border-neutral-700 bg-neutral-900/80 px-2 py-1.5 text-sm text-white"
                          value={it.unit ?? ""}
                          onChange={(e) => updateItemUnit(i, j, e.target.value)}
                          title="Measurement unit"
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u || "blank"} value={u}>
                              {u || "— unit —"}
                            </option>
                          ))}
                        </select>

                        {/* reorder */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => moveItem(i, j, -1)}
                            className="rounded-full border border-neutral-700 bg-neutral-900/80 px-2 py-1 text-[11px] text-neutral-100 hover:bg-neutral-800 disabled:opacity-40"
                            disabled={j === 0}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveItem(i, j, +1)}
                            className="rounded-full border border-neutral-700 bg-neutral-900/80 px-2 py-1 text-[11px] text-neutral-100 hover:bg-neutral-800 disabled:opacity-40"
                            disabled={j === (sec.items?.length ?? 0) - 1}
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>

                        {/* remove */}
                        <button
                          onClick={() => removeItem(i, j)}
                          className="justify-self-start rounded-full border border-red-600 bg-red-900/30 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-900/60 sm:justify-self-end"
                          title="Remove item"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}

                  <div>
                    <button
                      onClick={() => addItem(i)}
                      className="mt-2 rounded-full bg-neutral-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:bg-neutral-700"
                    >
                      + Add Item
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={addSection}
            className="rounded-full bg-neutral-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-neutral-700"
          >
            + Add Section
          </button>

          {templateId && (
            <button
              onClick={saveChanges}
              disabled={savingExisting}
              className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black hover:bg-sky-400 disabled:opacity-60"
            >
              {savingExisting ? "Saving…" : "Save Changes"}
            </button>
          )}

          <button
            onClick={saveTemplate}
            disabled={savingNew}
            className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black hover:bg-amber-400 disabled:opacity-60"
          >
            {savingNew ? "Saving…" : "Save as New Template"}
          </button>

          <button
            onClick={saveAndRun}
            disabled={running}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black hover:bg-emerald-400 disabled:opacity-60"
            title="Stage this draft and open the Run page"
          >
            {running ? "Opening…" : "Save & Run"}
          </button>
        </div>
      </div>
    </div>
  );
}