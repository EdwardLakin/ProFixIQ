// features/inspections/screens/GenericInspectionScreen.tsx (FULL FILE REPLACEMENT)
"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import PauseResumeButton from "@inspections/lib/inspection/PauseResume";
import StartListeningButton from "@inspections/lib/inspection/StartListeningButton";
import ProgressTracker from "@inspections/lib/inspection/ProgressTracker";
import useInspectionSession from "@inspections/hooks/useInspectionSession";
import { useInspectionAutosave } from "@inspections/hooks/useInspectionAutosave";

import { handleTranscriptFn } from "@inspections/lib/inspection/handleTranscript";
import { interpretCommand } from "@inspections/components/inspection/interpretCommand";
import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";
import { addWorkOrderLineFromSuggestion } from "@inspections/lib/inspection/addWorkOrderLine";
import { useRealtimeVoice } from "@inspections/lib/inspection/useRealtimeVoice";
import { buildVoiceBrainFeedback } from "@inspections/lib/inspection/voice/voiceBrain";
import VoiceControlsPanel from "@inspections/components/inspection/VoiceControlsPanel";
import { prepareSectionsWithCornerGrid } from "@inspections/lib/inspection/prepareSectionsWithCornerGrid";

import type {
  ParsedCommand,
  InspectionItemStatus,
  InspectionStatus,
  InspectionSection,
  InspectionSession,
  SessionCustomer,
  SessionVehicle,
  QuoteLineItem,
  VoiceMeta,
  VoiceTraceEvent,
  VoiceCommandApplyResult,
} from "@inspections/lib/inspection/types";

import SectionDisplay from "@inspections/lib/inspection/SectionDisplay";
import CornerGrid from "@inspections/lib/inspection/ui/CornerGrid";
import AirCornerGrid from "@inspections/lib/inspection/ui/AirCornerGrid";
import TireGrid from "@inspections/lib/inspection/ui/TireCornerGrid";
import TireGridHydraulic from "@inspections/lib/inspection/ui/TireGridHydraulic";
import BatteryGrid from "@inspections/lib/inspection/ui/BatteryGrid";

import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import CustomerVehicleHeader from "@inspections/lib/inspection/ui/CustomerVehicleHeader";
import InspectionSignaturePanel from "@inspections/components/inspection/InspectionSignaturePanel";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";
import { cn } from "@shared/lib/utils";
import {
  getInspectionOfflineDraft,
  removeInspectionOfflineDraft,
  saveInspectionOfflineDraft,
  type InspectionDraftRecoveryState,
} from "@inspections/lib/inspection/offlineDrafts";

/* -------------------------- helpers -------------------------- */

type GenericInspectionScreenProps = {
  embed?: boolean;
  template?: string | null;
  params?: Record<string, string | number | boolean | null | undefined>;
  onSpecHint?: (payload: {
    source: "air_corner" | "corner" | "tire" | "item" | "battery" | "other";
    label: string;
    specCode?: string | null;
    meta?: Record<string, string | number | boolean | null | undefined>;
  }) => void;
};

function toHeaderCustomer(c?: SessionCustomer | null) {
  return {
    first_name: c?.first_name ?? "",
    last_name: c?.last_name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    city: c?.city ?? "",
    province: c?.province ?? "",
    postal_code: c?.postal_code ?? "",
  };
}

function toHeaderVehicle(v?: SessionVehicle | null) {
  return {
    year: v?.year ?? "",
    make: v?.make ?? "",
    model: v?.model ?? "",
    vin: v?.vin ?? "",
    license_plate: v?.license_plate ?? "",
    mileage: v?.mileage ?? "",
    color: v?.color ?? "",
    unit_number: v?.unit_number ?? "",
    engine_hours: v?.engine_hours ?? "",
  };
}

function unitHintGeneric(label: string, mode: "metric" | "imperial"): string {
  const l = (label || "").toLowerCase();

  // ✅ pressure ALWAYS psi
  if (l.includes("pressure")) return "psi";

  // ✅ tread + thickness metrics follow toggle
  if (l.includes("tread")) return mode === "metric" ? "mm" : "in";
  if (l.includes("pad") || l.includes("lining") || l.includes("shoe"))
    return mode === "metric" ? "mm" : "in";
  if (l.includes("rotor") || l.includes("drum"))
    return mode === "metric" ? "mm" : "in";
  if (l.includes("push rod")) return mode === "metric" ? "mm" : "in";

  // torque can still follow toggle (your call)
  if (l.includes("torque")) return mode === "metric" ? "N·m" : "ft·lb";

  // leak rate / gov cut can be whatever you want — leaving as-is
  if (l.includes("leak rate")) return mode === "metric" ? "kPa/min" : "psi/min";
  if (l.includes("gov cut") || l.includes("warning"))
    return mode === "metric" ? "kPa" : "psi";

  return "";
}

function readStaged<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

type NormalizedItem = {
  item: string;
  unit: string | null;
  status?: InspectionItemStatus;
  notes?: string;
  note?: string;
  value?: string | number | null;
  photoUrls?: string[];
  recommend?: string[];
  parts?: Array<{ description: string; qty: number }>;
  laborHours?: number | null;

  // ✅ estimate state (optional)
  estimateSubmitted?: boolean;
  estimateSubmittedAt?: string | null;
  estimateLastUpdatedAt?: string | null;
  estimateWorkOrderLineId?: string | null;
  estimateQuoteLineId?: string | null;
};

function normalizeSections(input: unknown): InspectionSection[] {
  try {
    const arr = Array.isArray(input) ? input : [];
    const byTitle = new Map<string, InspectionSection>();

    for (const s of arr) {
      const sObj = (s ?? {}) as { title?: unknown; items?: unknown };
      const title = String(sObj.title ?? "").trim();
      if (!title) continue;

      const itemsRaw = Array.isArray(sObj.items) ? sObj.items : [];
      const normalized: NormalizedItem[] = [];

      for (const it of itemsRaw) {
        const itObj = (it ?? {}) as Record<string, unknown>;
        const label = String(itObj.item ?? itObj.name ?? "").trim();
        if (!label) continue;

        normalized.push({
          ...(itObj as object),
          item: label,
          unit:
            (itObj.unit as string | null | undefined) === undefined
              ? null
              : ((itObj.unit as string | null) ?? null),
        } as NormalizedItem);
      }

      if (!byTitle.has(title)) {
        byTitle.set(title, { title, items: [] });
      }

      const bucket = byTitle.get(title)!;
      const existing = Array.isArray(bucket.items) ? bucket.items : [];

      const seen = new Set<string>(
        existing.map((x) =>
          String((x as { item?: unknown }).item ?? "").toLowerCase(),
        ),
      );

      const merged: Array<InspectionSection["items"][number]> = [...existing];

      for (const it of normalized) {
        const key = String(it.item ?? "").toLowerCase();
        if (!key || seen.has(key)) continue;
        merged.push(it);
        seen.add(key);
      }

      bucket.items = merged;
    }

    return Array.from(byTitle.values()).filter(
      (s) => (s.items?.length ?? 0) > 0,
    );
  } catch {
    return [];
  }
}

/* -------- smarter grid detectors -------- */

const AIR_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const HYD_ABBR_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const HYD_FULL_RE =
  /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;
const BRAKE_SIGNAL_RE = /(lining|shoe|pad|drum|rotor|push\s*rod|torque)/i;

const BATTERY_SIGNAL_RE =
  /(battery|voltage|v\b|cca|cranking|load\s*test|alternator|charging|charge\s*rate|state\s*of\s*charge|soc)/i;

function isBatterySection(
  title: string | undefined,
  items: Array<{ item?: string | null; name?: string | null }> = [],
): boolean {
  const t = (title || "").toLowerCase();
  if (t.includes("battery grid")) return true;
  if (t.includes("battery")) return true;

  let hits = 0;
  for (const it of items) {
    const label = String(it.item ?? it.name ?? "").trim();
    if (!label) continue;
    if (BATTERY_SIGNAL_RE.test(label)) hits += 1;
    if (hits >= 2) return true;
  }

  return false;
}

function isAirCornerSection(
  title: string | undefined,
  items: { item?: string | null }[] = [],
): boolean {
  const t = (title || "").toLowerCase();

  // Explicit titles always win
  if (t.includes("air corner") || t.includes("air corner grid")) return true;
  if (t.includes("tires & brakes") && t.includes("air")) return true;

  // Otherwise: must look like an air layout AND contain brake-only metrics
  const hasAirLayout = items.some((it) => AIR_RE.test(it.item ?? ""));
  const hasBrakeMetric = items.some((it) => BRAKE_SIGNAL_RE.test(it.item ?? ""));

  return hasAirLayout && hasBrakeMetric;
}

function isTireGridSection(
  title: string | undefined,
  items: { item?: string | null }[] = [],
): boolean {
  const t = (title || "").toLowerCase();
  if (t.includes("tire grid") || t.includes("tires grid")) return true;
  if (t.includes("tires") && t.includes("corner")) return true;

  const tireSignals = items.filter((it) => {
    const l = (it.item ?? "").toLowerCase();
    return (
      l.includes("tire pressure") ||
      l.includes("tire tread") ||
      l.includes("tread depth")
    );
  });

  if (tireSignals.length >= 2) {
    return tireSignals.some(
      (it) =>
        AIR_RE.test(it.item ?? "") ||
        HYD_ABBR_RE.test(it.item ?? "") ||
        HYD_FULL_RE.test(it.item ?? ""),
    );
  }

  return false;
}

function isHydraulicCornerSection(
  title: string | undefined,
  items: { item?: string | null }[] = [],
): boolean {
  const t = (title || "").toLowerCase();

  // IMPORTANT: if this is a Tire Grid section, it is NOT the hydraulic corner grid
  if (isTireGridSection(title, items)) return false;

  if (t.includes("corner grid") || t.includes("tires & brakes — truck"))
    return true;
  if (t.includes("axle grid")) return true;

  if (!items || items.length < 4) return false;

  return items.some((it) => {
    const label = it.item ?? "";
    return HYD_ABBR_RE.test(label) || HYD_FULL_RE.test(label);
  });
}

/* --------------------------------- constants --------------------------------- */

const UNIT_OPTIONS = ["", "mm", "psi", "kPa", "in", "ft·lb"] as const;

function inspectionDraftKey(args: {
  inspectionId: string;
  workOrderLineId?: string | null;
  workOrderId?: string | null;
  templateName?: string | null;
}) {
  const t = (args.templateName || "Inspection").toLowerCase().trim();
  if (args.workOrderLineId)
    return `inspection-draft:line:${args.workOrderLineId}`;
  if (args.workOrderId) return `inspection-draft:wo:${args.workOrderId}:${t}`;
  return `inspection-draft:template:${t}:${args.inspectionId}`;
}

function buildCauseCorrectionFromSession(s: unknown): {
  cause: string;
  correction: string;
} {
  const sess = s as { sections?: unknown };
  const sections: unknown[] = Array.isArray(sess?.sections)
    ? (sess.sections as unknown[])
    : [];

  const failed: string[] = [];
  const rec: string[] = [];

  for (const secRaw of sections) {
    const sec = secRaw as { title?: unknown; items?: unknown };
    const title = String(sec?.title ?? "").trim();
    const items: unknown[] = Array.isArray(sec?.items)
      ? (sec.items as unknown[])
      : [];

    for (const itRaw of items) {
      const it = itRaw as Record<string, unknown>;
      const st = String(it?.status ?? "").toLowerCase();
      if (st !== "fail" && st !== "recommend") continue;

      const label = String(
        it?.item ?? it?.name ?? it?.description ?? "Item",
      ).trim();
      const note = String(it?.notes ?? "").trim();
      const chunk = note ? `${label} — ${note}` : label;
      const line = title ? `${title}: ${chunk}` : chunk;

      if (st === "fail") failed.push(line);
      if (st === "recommend") rec.push(line);
    }
  }

  if (failed.length === 0 && rec.length === 0) {
    return {
      cause: "Inspection completed.",
      correction:
        "Inspection completed. No failed or recommended items were recorded.",
    };
  }

  const parts: string[] = [];
  if (failed.length) parts.push(`Failed items: ${failed.join("; ")}.`);
  if (rec.length) parts.push(`Recommended items: ${rec.join("; ")}.`);

  return {
    cause: "Inspection found items requiring attention.",
    correction: parts.join(" "),
  };
}

/* ---------------------- voice follow-up helpers ---------------------- */

function normalizeSpeech(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localFallbackCommands(text: string): ParsedCommand[] {
  const n = normalizeSpeech(text);

  const ok = /\b(ok|okay|pass|good)\b/.test(n);
  const fail = /\b(fail|bad)\b/.test(n);
  const rec = /\b(recommend|rec)\b/.test(n);

  const lf = /\b(left front|lf|driver front)\b/.test(n);
  const rf = /\b(right front|rf|passenger front)\b/.test(n);
  const lr = /\b(left rear|lr|driver rear)\b/.test(n);
  const rr = /\b(right rear|rr|passenger rear)\b/.test(n);

  const corner =
    lf ? "Steer 1 Left"
    : rf ? "Steer 1 Right"
    : lr ? "Rear 1 Left"
    : rr ? "Rear 1 Right"
    : "";

  const numMatch = n.match(/\b(\d+(?:\.\d+)?)\b/);
  const num = numMatch ? Number(numMatch[1]) : null;

  const out: ParsedCommand[] = [];

  if (corner && /\b(tire pressure|pressure)\b/.test(n) && num != null) {
    out.push({
      type: "measurement",
      section: "__auto__",
      item: `${corner} Tire Pressure`,
      value: num,
      unit: "psi",
    });
    return out;
  }

  if (corner && /\b(tread depth|tread)\b/.test(n) && num != null) {
    const inner = /\b(inner)\b/.test(n);
    const outer = /\b(outer)\b/.test(n);

    out.push({
      type: "measurement",
      section: "__auto__",
      item: `${corner} ${
        inner ? "Tread Depth (Inner)" : outer ? "Tread Depth (Outer)" : "Tread Depth"
      }`,
      value: num,
      unit: /\b(inch|inches)\b/.test(n) ? "in" : "mm",
    });
    return out;
  }

  if (/\b(brake shoes|lining|pads?|pad)\b/.test(n) && (ok || fail || rec)) {
    out.push({
      type: "status",
      section: "__auto__",
      item: "Lining/Shoe",
      status: ok ? "ok" : fail ? "fail" : "recommend",
    });
    return out;
  }

  if ((ok || fail || rec) && n.length >= 4) {
    const label = n
      .replace(/\b(ok|okay|pass|good|fail|bad|recommend|rec)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (label.length >= 3) {
      out.push({
        type: "status",
        section: "__auto__",
        item: label,
        status: ok ? "ok" : fail ? "fail" : "recommend",
      });
      return out;
    }
  }

  return [];
}

function speakLocal(text: string): void {
  try {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    synth.cancel();
    synth.speak(u);
  } catch {
    // ignore
  }
}

/* ---------------------- section picker for strict_context (NO FOCUS) ---------------------- */

function normalizeForMatch(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestSectionIndexFromSpeech(
  speech: string,
  sections: InspectionSection[],
  fallbackIndex: number,
): number {
  const n = normalizeForMatch(speech);
  if (!n) return fallbackIndex;

  const wantsSection =
    /\b(section|all\s+(ok|na|fail|rec)|mark\s+.*\b(ok|na|fail|rec)\b)\b/i.test(n);

  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < sections.length; i++) {
    const title = normalizeForMatch(String(sections[i]?.title ?? ""));
    if (!title) continue;

    const titleTokens = new Set(title.split(" ").filter((t) => t.length >= 3));
    const speechTokens = n.split(" ").filter((t) => t.length >= 3);

    let score = 0;
    for (const tok of speechTokens) {
      if (titleTokens.has(tok)) score += 2;
    }

    if (title.includes("tire") && n.includes("tire")) score += 4;
    if (title.includes("brake") && n.includes("brake")) score += 4;
    if (title.includes("air") && n.includes("air")) score += 3;
    if (title.includes("battery") && n.includes("battery")) score += 4;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (wantsSection && bestIdx >= 0 && bestScore >= 2) return bestIdx;
  return fallbackIndex;
}


function itemKey(sectionIndex: number, itemIndex: number): string {
  return `${sectionIndex}:${itemIndex}`;
}

function safeTrimLocal(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asVehicleForSmartMatch(v: SessionVehicle | null | undefined) {
  if (!v) return null;
  return {
    year: (v as { year?: unknown }).year ?? null,
    make: (v as { make?: unknown }).make ?? null,
    model: (v as { model?: unknown }).model ?? null,
    engine: (v as { engine?: unknown }).engine ?? null,
    drivetrain: (v as { drivetrain?: unknown }).drivetrain ?? null,
    transmission: (v as { transmission?: unknown }).transmission ?? null,
    fuel_type: (v as { fuel_type?: unknown }).fuel_type ?? null,
  };
}

function buildInterpretCtxForSpeech(args: {
  speech: string;
  session: InspectionSession;
  fallbackSectionIndex: number;
}): { sectionTitle: string; sectionTitles: string[]; items: string[] } | null {
  const { speech, session, fallbackSectionIndex } = args;
  const sections = session.sections ?? [];
  if (!sections.length) return null;

  const chosenIdx = pickBestSectionIndexFromSpeech(
    speech,
    sections,
    fallbackSectionIndex,
  );

  const section = sections[chosenIdx];

  const sectionTitles = sections
    .map((s) => String(s.title ?? "").trim())
    .filter((v) => v.length > 0);

  const items = sections
    .flatMap((s) => s.items ?? [])
    .map((it) => String(it.item ?? it.name ?? "").trim())
    .filter((v) => v.length > 0);

  return {
    sectionTitle: String(section?.title ?? ""),
    sectionTitles,
    items,
  };
}

/* -------------------------------------------------------------------- */
/* Component                                                            */
/* -------------------------------------------------------------------- */

export default function GenericInspectionScreen(
  props: GenericInspectionScreenProps,
): JSX.Element {
  const routeSp = useSearchParams();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);

  type ItemPatch = Partial<InspectionSection["items"][number]>;

type SmartMatchRow = {
  id: string;
  label: string;
  complaint?: string | null;
  correction?: string | null;
  laborHours?: number | null;
  parts?: Array<{ name: string; qty?: number }>;
  score?: number | null;
  confidence?: number | null;
  menuItemId?: string | null;
  menuRepairItemId?: string | null;
  autoAcceptReady?: boolean;
  matchTier?: "high" | "medium" | "low";
  acceptedCount?: number | null;
  acceptanceRate?: number | null;
  pricingStatus?: "fresh" | "stale" | "expired";
  pricingValidUntil?: string | null;
};

  const sp = useMemo(() => {
    const merged = new URLSearchParams();
    const staged = readStaged<Record<string, string>>("inspection:params");

    // Direct-route params form the base. The mobile runner stages its context
    // because it prepares the template client-side. A desktop modal passes the
    // exact inspection source as props and must win over any stale staged run.
    routeSp.forEach((value, key) => merged.set(key, value));
    Object.entries(staged ?? {}).forEach(([key, value]) => {
      if (value != null) merged.set(key, String(value));
    });
    Object.entries(props.params ?? {}).forEach(([key, value]) => {
      if (value != null) merged.set(key, String(value));
    });

    return merged;
  }, [props.params, routeSp]);

  const isEmbed = useMemo(
    () =>
      props.embed === true ||
      ["1", "true", "yes"].includes(
        (sp.get("embed") || sp.get("compact") || "").toLowerCase(),
      ),
    [props.embed, sp],
  );

  const workOrderId = sp.get("workOrderId") || null;
  const workOrderLineId = sp.get("workOrderLineId") || "";

  const showMissingLineWarning = isEmbed && !workOrderLineId;


  const templateName =
    (typeof window !== "undefined"
      ? sessionStorage.getItem("inspection:title")
      : null) ||
    sp.get("templateName") ||
    sp.get("template_name") ||
    props.template ||
    sp.get("template") ||
    "Inspection";

  const customer = useMemo<SessionCustomer>(
    () => ({
      first_name: sp.get("first_name") || "",
      last_name: sp.get("last_name") || "",
      phone: sp.get("phone") || "",
      email: sp.get("email") || "",
      address: sp.get("address") || "",
      city: sp.get("city") || "",
      province: sp.get("province") || "",
      postal_code: sp.get("postal_code") || "",
    }),
    [sp],
  );

  const vehicle = useMemo<SessionVehicle>(
    () => ({
      year: sp.get("year") || "",
      make: sp.get("make") || "",
      model: sp.get("model") || "",
      vin: sp.get("vin") || "",
      license_plate: sp.get("license_plate") || "",
      mileage: sp.get("mileage") || "",
      color: sp.get("color") || "",
      unit_number: sp.get("unit_number") || "",
      engine_hours: sp.get("engine_hours") || "",
    }),
    [sp],
  );




  const bootSections = useMemo<InspectionSection[]>(() => {
    const stagedParams = readStaged<Record<string, string>>("inspection:params") ?? {};

    const vehicleType =
      stagedParams.vehicleType ??
      sp.get("vehicleType") ??
      sp.get("vehicle_type") ??
      "";

    const gridParam =
      stagedParams.grid ??
      sp.get("grid") ??
      null;

    const finalize = (rawSections: InspectionSection[]): InspectionSection[] =>
      prepareSectionsWithCornerGrid(
        normalizeSections(rawSections) as unknown as Array<{
          title: string;
          items: Array<{ item: string; unit?: string | null }>;
        }>,
        vehicleType,
        gridParam,
      ) as unknown as InspectionSection[];

    const staged = readStaged<InspectionSection[]>("inspection:sections");
    if (Array.isArray(staged) && staged.length) return finalize(staged);

    try {
      const legacy =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:sections")
          : null;
      if (legacy) {
        const parsed = JSON.parse(legacy) as InspectionSection[];
        return finalize(parsed);
      }
    } catch {}

    return finalize([
      {
        title: "General",
        items: [
          { item: "Visual walkaround" },
          { item: "Record warning lights" },
        ],
      },
    ]);
  }, [sp]);

  const inspectionId = useMemo(() => {
    const fromUrl = sp.get("inspectionId");
    if (fromUrl) return fromUrl;
    return uuidv4();
  }, [sp]);

  const draftKey = useMemo(
    () =>
      inspectionDraftKey({
        inspectionId,
        workOrderLineId: workOrderLineId || null,
        workOrderId,
        templateName,
      }),
    [inspectionId, workOrderLineId, workOrderId, templateName],
  );

  const [unit, setUnit] = useState<"metric" | "imperial">("metric");

  const [isPaused, setIsPaused] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const applyLockedState = (nextLocked: boolean): void => {
    // Update the ref synchronously so in-flight async handlers are blocked even
    // before React commits the state update from a Realtime event.
    isLockedRef.current = nextLocked;
    setIsLocked(nextLocked);
  };

  const [newItemLabels, setNewItemLabels] = useState<Record<number, string>>(
    {},
  );
  const [newItemUnits, setNewItemUnits] = useState<Record<number, string>>({});

  const [collapsedSections, setCollapsedSections] = useState<
    Record<number, boolean>
  >({});
  const [smartMatchByKey, setSmartMatchByKey] = useState<
    Record<string, SmartMatchRow | null>
  >({});
  const [smartMatchLoadingByKey, setSmartMatchLoadingByKey] = useState<
    Record<string, boolean>
  >({});
  const smartMatchTimers = useRef<Record<string, number>>({});

  const [voiceControlsOpen, setVoiceControlsOpen] = useState(false);
  const [voiceHeld, setVoiceHeld] = useState(false);
  const voiceHeldRef = useRef(false);
  const lastVoiceTargetRef = useRef<{
    sectionIndex: number;
    itemIndex: number;
  } | null>(null);

  const [voiceState, setVoiceState] = useState<
    "idle" | "connecting" | "listening" | "error"
  >("idle");

  const isListening =
    voiceState === "listening" || voiceState === "connecting";

  const [voicePulse, setVoicePulse] = useState(false);
  const pulseTimerRef = useRef<number | null>(null);
  const [draftBootLoaded, setDraftBootLoaded] = useState(false);
  const [recoveryState, setRecoveryState] =
    useState<InspectionDraftRecoveryState>("editing");
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const recoveryOperationKeyRef = useRef<string | undefined>(undefined);
  const queuedSessionRef = useRef<InspectionSession | null>(null);
  const skipNextQueuedEditCheckRef = useRef(false);
  const inspectionCompletedRef = useRef(false);

  const triggerVoicePulse = (): void => {
    setVoicePulse(true);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => setVoicePulse(false), 700);
  };

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = null;
    };
  }, []);

  const initialSession = useMemo<Partial<InspectionSession>>(
    () => ({
      id: inspectionId,
      templateitem: templateName,
      workOrderId,
      workOrderLineId: workOrderLineId || null,
      status: "not_started" as InspectionStatus,
      isPaused: false,
      transcript: "",
      quote: [],
      customer,
      vehicle,
      sections: [],
      currentSectionIndex: 0,
      currentItemIndex: 0,
      started: false,
      completed: false,
    }),
    [inspectionId, templateName, workOrderId, workOrderLineId, customer, vehicle],
  );

  const {
    session,
    updateInspection: updateSessionInspection,
    updateItem: updateSessionItem,
    updateSection: updateSessionSection,
    replaceSession,
    finishSession: finishInspectionSession,
    resumeSession: resumeInspectionSession,
    pauseSession: pauseInspectionSession,
    addQuoteLine: addSessionQuoteLine,
    updateQuoteLine: updateSessionQuoteLine,
  } = useInspectionSession(initialSession)