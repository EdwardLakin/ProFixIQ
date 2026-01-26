// /features/inspections/app/inspection/custom-draft/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/** UI-only keys so inputs don't remount on every keystroke (fixes focus loss) */
type DraftItem = InspectionItem & { _key: string };
type DraftSection = { title: string; items: DraftItem[] };

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

  // support label/title/description keys used by grid builders
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

/* ---------------------------- UI key helpers ---------------------------- */

function stripKeys(sections: DraftSection[]): InspectionSection[] {
  return sections.map((s) => ({
    title: s.title,
    items: (s.items ?? []).map((it) => {
      const { _key: _ignored, ...rest } = it;
      return rest;
    }),
  }));
}

function coerceNumberOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

/* -------------------------------- component -------------------------------- */

export default function CustomDraftPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const nextKeyRef = useRef(1);
  const mkKey = () => `k_${Date.now().toString(36)}_${(nextKeyRef.current++).toString(36)}`;

  // if the user clicked "Edit" from the template list we expect ?templateId=...
  const templateId = sp.get("templateId");

  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(
    (sp.get("vehicleType") as VehicleType | null) || null,
  );
  const [dutyClass, setDutyClass] = useState<DutyClass | null>(
    (sp.get("dutyClass") as DutyClass | null) || null,
  );

  // track grid mode explicitly (builder can set air/hyd/none)
  const [gridMode, setGridMode] = useState<GridMode | null>(() => {
    const fromUrl = normalizeGridMode(sp.get("grid"));
    if (fromUrl) return fromUrl;

    if (typeof window !== "undefined") {
      const stored = normalizeGridMode(
        sessionStorage.getItem("customInspection:gridMode"),
      );
      if (stored) return stored;
    }

    const inferred = dutyClass === "heavy" ? "air" : dutyClass ? "hyd" : null;
    return inferred;
  });

  const [sections, setSections] = useState<DraftSection[]>([]);

  // ✅ labor hours input as string (so user can clear it)
  const [laborHoursInput, setLaborHoursInput] = useState<string>("");

  const [savingNew, setSavingNew] = useState(false);
  const [savingExisting, setSavingExisting] = useState(false);
  const [running, setRunning] = useState(false);

  // shop scope
  const [shopId, setShopId] = useState<string | null>(null);

  // per-section add-item picker UI
  const [openAddItemFor, setOpenAddItemFor] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState<string>("");
  const [customItemText, setCustomItemText] = useState<string>("");

  // add-section-from-master UI
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [sectionSearch, setSectionSearch] = useState("");

  const laborHoursNumber = useMemo(() => {
    const n = coerceNumberOrNull(laborHoursInput);
    return n ?? 0;
  }, [laborHoursInput]);

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

  const batteryPresent = useMemo(
    () => hasBatterySection(stripKeys(sections)),
    [sections],
  );

  // master lookups
  const masterByTitle = useMemo(() => {
    const out = new Map<string, { item: string; unit?: string | null }[]>();
    for (const sec of masterInspectionList) {
      out.set(sec.title.trim().toLowerCase(), sec.items);
    }
    return out;
  }, []);

  function getMasterItemsForSection(titleStr: string) {
    const key = (titleStr || "").trim().toLowerCase();
    return masterByTitle.get(key) ?? [];
  }

  function attachKeysFromNormalized(normalized: InspectionSection[]): DraftSection[] {
    return normalized.map((s) => ({
      title: s.title,
      items: (s.items ?? []).map((it) => ({
        ...it,
        _key: mkKey(),
      })),
    }));
  }

  /* ----------------------------- load shop_id ----------------------------- */

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;

      const byUser = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (byUser.data?.shop_id) {
        setShopId(byUser.data.shop_id);
        return;
      }

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

  /* ----------------------- load staged draft (session) ---------------------- */

  // load staged sections (canonical: inspection:*), fallback to legacy customInspection:*
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;

      const rawInspection = sessionStorage.getItem("inspection:sections");
      const titleInspection = sessionStorage.getItem("inspection:title");
      const paramsRaw = sessionStorage.getItem("inspection:params");

      const rawLegacy = sessionStorage.getItem("customInspection:sections");
      const titleLegacy = sessionStorage.getItem("customInspection:title");
      const includeOilRawLegacy =
        sessionStorage.getItem("customInspection:includeOil");
      const storedDutyLegacy =
        sessionStorage.getItem("customInspection:dutyClass");
      const storedGridLegacy =
        sessionStorage.getItem("customInspection:gridMode");

      const raw = rawInspection ?? rawLegacy;
      const t = titleInspection ?? titleLegacy;

      let nextDuty: DutyClass | null = dutyClass;
      let nextGrid: GridMode | null = gridMode;

      if (paramsRaw) {
        try {
          const parsed = JSON.parse(paramsRaw) as unknown;
          if (isRecord(parsed)) {
            const dc = asString(parsed.dutyClass);
            const gm = normalizeGridMode(asString(parsed.grid));
            if (dc === "light" || dc === "medium" || dc === "heavy") nextDuty = dc;
            if (gm) nextGrid = gm;
          }
        } catch {
          // ignore
        }
      }

      if (!nextDuty && storedDutyLegacy) nextDuty = storedDutyLegacy as DutyClass;
      if (!nextGrid && storedGridLegacy) {
        const g = normalizeGridMode(storedGridLegacy);
        if (g) nextGrid = g;
      }

      if (t && t.trim()) setTitle(t.trim());
      if (nextDuty) setDutyClass(nextDuty);
      if (nextGrid) setGridMode(nextGrid);

      if (raw) {
        const parsedUnknown = JSON.parse(raw) as unknown;
        const parsed = normalizeSections(parsedUnknown);

        const includeOilLegacy =
          includeOilRawLegacy ? JSON.parse(includeOilRawLegacy) === true : false;

        const hasOil = parsed.some(
          (s) => (s.title || "").trim().toLowerCase() === "oil change",
        );

        const withOil =
          includeOilLegacy && !hasOil
            ? normalizeSections([...parsed, buildOilChangeSection()])
            : parsed;

        const draft = attachKeysFromNormalized(withOil);
        setSections(draft);

        const initialHours = computeDefaultLaborHours({
          vehicleType: vehicleType ?? "truck",
          sections: withOil,
        });

        // set as string so user can clear it later
        setLaborHoursInput(Number.isFinite(initialHours) ? initialHours.toFixed(2) : "");
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

  /* ------------------- if editing existing template, load DB ------------------- */

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
      setSections(attachKeysFromNormalized(normalized));
      setTitle(data.template_name || "Custom Inspection");

      if (data.vehicle_type) setVehicleType(data.vehicle_type as VehicleType);

      if (typeof data.labor_hours === "number") {
        setLaborHoursInput(data.labor_hours.toFixed(2));
      } else {
        const hours = computeDefaultLaborHours({
          vehicleType: (data.vehicle_type as VehicleType) ?? "truck",
          sections: normalized,
        });
        setLaborHoursInput(Number.isFinite(hours) ? hours.toFixed(2) : "");
      }

      if (data.shop_id && !shopId) setShopId(data.shop_id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, supabase]);

  /* ----------------------------- editing helpers ----------------------------- */

  function addSectionBlank() {
    setSections((prev) => [
      ...prev,
      {
        title: "New Section",
        items: [
          { item: "", unit: null, status: "na", _key: mkKey() } as DraftItem,
        ],
      },
    ]);
  }

  function addSectionFromMaster(sectionTitle: string) {
    const found = masterInspectionList.find(
      (s) => s.title.trim().toLowerCase() === sectionTitle.trim().toLowerCase(),
    );
    if (!found) return;

    const items: DraftItem[] = found.items.map((it) => ({
      item: it.item,
      unit: it.unit ?? null,
      status: "na",
      _key: mkKey(),
    }));

    setSections((prev) => [...prev, { title: found.title, items }]);
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

  function addItemBlank(secIdx: number) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      next[secIdx] = {
        ...s,
        items: [
          ...(s.items ?? []),
          { item: "", unit: null, status: "na", _key: mkKey() } as DraftItem,
        ],
      };
      return next;
    });
  }

  function addItemFromMaster(secIdx: number, label: string, unit?: string | null) {
    const trimmed = (label || "").trim();
    if (!trimmed) return;

    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      const exists = (s.items ?? []).some(
        (it) => (it.item ?? "").trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (exists) return prev;

      next[secIdx] = {
        ...s,
        items: [
          ...(s.items ?? []),
          {
            item: trimmed,
            unit: unit ?? null,
            status: "na",
            _key: mkKey(),
          } as DraftItem,
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

  const saveTemplate = async () => {
    try {
      setSavingNew(true);
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        toast.error("Please sign in.");
        return;
      }

      const cleaned = normalizeSections(stripKeys(sections));
      if (cleaned.length === 0) {
        toast.error("Add at least one section with items.");
        return;
      }

      const hours = coerceNumberOrNull(laborHoursInput);

      const payload: InsertTemplate = {
        template_name: (title || "").trim() || "Custom Template",
        sections:
          cleaned as unknown as Database["public"]["Tables"]["inspection_templates"]["Insert"]["sections"],
        description: "Created from Custom Draft",
        vehicle_type: vehicleType || undefined,
        tags: ["custom", "draft"],
        is_public: false,
        labor_hours: hours,
        // user_id + shop_id injected by trigger
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

      const cleaned = normalizeSections(stripKeys(sections));
      if (cleaned.length === 0) {
        toast.error("Add at least one section with items.");
        return;
      }

      const hours = coerceNumberOrNull(laborHoursInput);

      const payload: UpdateTemplate = {
        template_name: (title || "").trim() || "Custom Template",
        sections:
          cleaned as unknown as Database["public"]["Tables"]["inspection_templates"]["Update"]["sections"],
        vehicle_type: vehicleType || undefined,
        labor_hours: hours,
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
      const cleaned = normalizeSections(stripKeys(sections));
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

  /* ------------------------------ derived pickers ------------------------------ */

  const masterSectionTitles = useMemo(() => {
    const titles = masterInspectionList.map((s) => s.title);
    return titles.sort((a, b) => a.localeCompare(b));
  }, []);

  const filteredMasterSectionTitles = useMemo(() => {
    const q = sectionSearch.trim().toLowerCase();
    if (!q) return masterSectionTitles;
    return masterSectionTitles.filter((t) => t.toLowerCase().includes(q));
  }, [masterSectionTitles, sectionSearch]);

  function closeAddItemPicker() {
    setOpenAddItemFor(null);
    setItemSearch("");
    setCustomItemText("");
  }

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
                {Number.isFinite(laborHoursNumber)
                  ? laborHoursNumber.toFixed(2)
                  : "0.00"}
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
              type="text"
              inputMode="decimal"
              className="w-40 rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              value={laborHoursInput}
              placeholder="e.g. 2.50"
              onChange={(e) => setLaborHoursInput(e.target.value)}
              onBlur={() => {
                // normalize formatting on blur (but allow empty)
                const n = coerceNumberOrNull(laborHoursInput);
                if (n === null) {
                  setLaborHoursInput("");
                } else {
                  setLaborHoursInput(n.toFixed(2));
                }
              }}
            />
          </label>
        </div>

        {/* Master section picker */}
        {showSectionPicker ? (
          <div className="mb-5 rounded-2xl border border-neutral-800 bg-neutral-950/85 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-orange-300">
                Add Section from Master List
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSectionPicker(false);
                  setSectionSearch("");
                }}
                className="rounded-full border border-neutral-700 bg-black/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-800"
              >
                Close
              </button>
            </div>

            <input
              className="mb-3 w-full rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              placeholder="Search sections…"
              value={sectionSearch}
              onChange={(e) => setSectionSearch(e.target.value)}
            />

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMasterSectionTitles.slice(0, 60).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    addSectionFromMaster(t);
                    setShowSectionPicker(false);
                    setSectionSearch("");
                  }}
                  className="rounded-xl border border-neutral-800 bg-black/60 px-3 py-2 text-left text-sm text-neutral-100 hover:bg-black/70"
                  title="Add section"
                >
                  {t}
                </button>
              ))}
              {filteredMasterSectionTitles.length > 60 ? (
                <div className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-2 text-xs text-neutral-400">
                  Showing first 60 results — refine your search to narrow down.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Sections editor */}
        <div className="space-y-4">
          {sections.map((sec, i) => {
            const masterItemsForThisSection = getMasterItemsForSection(sec.title);
            const q = itemSearch.trim().toLowerCase();
            const filteredMasterItems =
              q.length === 0
                ? masterItemsForThisSection
                : masterItemsForThisSection.filter((mi) =>
                    mi.item.toLowerCase().includes(q),
                  );

            const addPanelOpen = openAddItemFor === i;

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
                      type="button"
                      onClick={() => moveSection(i, -1)}
                      className="rounded-full border border-neutral-700 bg-black/60 px-2.5 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                      disabled={i === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(i, +1)}
                      className="rounded-full border border-neutral-700 bg-black/60 px-2.5 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                      disabled={i === sections.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSection(i)}
                      className="rounded-full border border-red-600 bg-red-900/30 px-3 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-900/60"
                      title="Remove section"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Add-item picker (dropdown + search + custom) */}
                <div className="mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (addPanelOpen) {
                          closeAddItemPicker();
                        } else {
                          setOpenAddItemFor(i);
                          setItemSearch("");
                          setCustomItemText("");
                        }
                      }}
                      className="rounded-full bg-neutral-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:bg-neutral-700"
                    >
                      + Add Item
                    </button>

                    <button
                      type="button"
                      onClick={() => addItemBlank(i)}
                      className="rounded-full border border-neutral-700 bg-black/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-800"
                      title="Add a blank item field"
                    >
                      Add blank
                    </button>

                    <span className="text-[11px] text-neutral-500">
                      {masterItemsForThisSection.length
                        ? "Master items available for this section."
                        : "No master section match — add custom items."}
                    </span>
                  </div>

                  {addPanelOpen ? (
                    <div className="mt-3 rounded-2xl border border-neutral-800 bg-black/40 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-orange-300">
                          Add items to “{sec.title || "Section"}”
                        </div>
                        <button
                          type="button"
                          onClick={closeAddItemPicker}
                          className="rounded-full border border-neutral-700 bg-black/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-800"
                        >
                          Close
                        </button>
                      </div>

                      {masterItemsForThisSection.length ? (
                        <>
                          <input
                            className="mb-3 w-full rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                            placeholder="Search master items…"
                            value={itemSearch}
                            onChange={(e) => setItemSearch(e.target.value)}
                          />

                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredMasterItems.slice(0, 45).map((mi) => (
                              <button
                                key={mi.item}
                                type="button"
                                onClick={() => addItemFromMaster(i, mi.item, mi.unit ?? null)}
                                className="rounded-xl border border-neutral-800 bg-black/60 px-3 py-2 text-left text-sm text-neutral-100 hover:bg-black/70"
                                title="Add item"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate">{mi.item}</span>
                                  <span className="rounded-full bg-neutral-800 px-2 py-[2px] text-[10px] text-neutral-300">
                                    {mi.unit ?? "—"}
                                  </span>
                                </div>
                              </button>
                            ))}
                            {filteredMasterItems.length > 45 ? (
                              <div className="rounded-xl border border-neutral-800 bg-black/30 px-3 py-2 text-xs text-neutral-400">
                                Showing first 45 results — refine your search.
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : null}

                      <div className="mt-3 grid gap-2 md:grid-cols-[1fr,140px,auto] md:items-center">
                        <input
                          className="w-full rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                          placeholder="Custom item label…"
                          value={customItemText}
                          onChange={(e) => setCustomItemText(e.target.value)}
                        />
                        <select
                          className="rounded-xl border border-neutral-700 bg-neutral-900/80 px-2 py-2 text-sm text-white"
                          value=""
                          onChange={(e) => {
                            const unit = e.target.value || null;
                            addItemFromMaster(i, customItemText, unit);
                            setCustomItemText("");
                          }}
                          title="Add custom item with unit"
                        >
                          <option value="">— unit —</option>
                          {UNIT_OPTIONS.filter((u) => u !== "").map((u) => (
                            <option key={u || "blank"} value={u}>
                              {u || "—"}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            addItemFromMaster(i, customItemText, null);
                            setCustomItemText("");
                          }}
                          className="rounded-full bg-orange-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black hover:bg-orange-500"
                        >
                          Add custom
                        </button>
                      </div>

                      <div className="mt-2 text-[11px] text-neutral-500">
                        Tip: clicking master items won’t steal focus from your text inputs anymore (stable keys).
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Items list */}
                <div className="space-y-2">
                  {(sec.items ?? []).map((it, j) => {
                    return (
                      <div
                        key={it._key}
                        className="grid grid-cols-1 gap-2 rounded-xl bg-black/55 p-2 sm:grid-cols-[minmax(0,1.4fr),140px,auto,auto] sm:items-center"
                      >
                        {/* label */}
                        <input
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500"
                          value={it.item ?? ""}
                          onChange={(e) => updateItemLabel(i, j, e.target.value)}
                          placeholder="Item label"
                        />

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
                            type="button"
                            onClick={() => moveItem(i, j, -1)}
                            className="rounded-full border border-neutral-700 bg-neutral-900/80 px-2 py-1 text-[11px] text-neutral-100 hover:bg-neutral-800 disabled:opacity-40"
                            disabled={j === 0}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
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
                          type="button"
                          onClick={() => removeItem(i, j)}
                          className="justify-self-start rounded-full border border-red-600 bg-red-900/30 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-900/60 sm:justify-self-end"
                          title="Remove item"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={addSectionBlank}
            className="rounded-full bg-neutral-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-neutral-700"
          >
            + Add Blank Section
          </button>

          <button
            type="button"
            onClick={() => setShowSectionPicker((v) => !v)}
            className="rounded-full border border-neutral-700 bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-800"
          >
            + Add Section from Master
          </button>

          {templateId && (
            <button
              type="button"
              onClick={saveChanges}
              disabled={savingExisting}
              className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black hover:bg-sky-400 disabled:opacity-60"
            >
              {savingExisting ? "Saving…" : "Save Changes"}
            </button>
          )}

          <button
            type="button"
            onClick={saveTemplate}
            disabled={savingNew}
            className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black hover:bg-amber-400 disabled:opacity-60"
          >
            {savingNew ? "Saving…" : "Save as New Template"}
          </button>

          <button
            type="button"
            onClick={saveAndRun}
            disabled={running}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black hover:bg-emerald-400 disabled:opacity-60"
            title="Stage this draft and open the Run page"
          >
            {running ? "Opening…" : "Save & Run"}
          </button>
        </div>

        {/* dev hint (kept subtle) */}
        <div className="mt-4 text-[11px] text-neutral-600">
          {shopId ? null : "Loading shop scope…"}
        </div>
      </div>
    </div>
  );
}