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

function inspectionDraftTimestamp(
  session: Partial<InspectionSession> | null,
): number {
  const value = session?.lastUpdated;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
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

    if (typeof window === "undefined") return uuidv4();

    const storageKey = workOrderLineId
      ? `inspection:activeId:line:${workOrderLineId}`
      : workOrderId
        ? `inspection:activeId:wo:${workOrderId}:${templateName}`
        : `inspection:activeId:template:${templateName}`;

    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;

    const created = uuidv4();
    sessionStorage.setItem(storageKey, created);
    return created;
  }, [sp, workOrderLineId, workOrderId, templateName]);

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

  const lockKey = `${draftKey}:locked`;

  const persistedSession = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(draftKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as InspectionSession;
    } catch {
      return null;
    }
  }, [draftKey]);

  const [unit, setUnit] = useState<"metric" | "imperial">("metric");

  const [isPaused, setIsPaused] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const applyLockedState = (
    nextLocked: boolean,
    persistEvidence = true,
  ): void => {
    // Update the ref synchronously so in-flight async handlers are blocked even
    // before React commits the state update from a Realtime event.
    isLockedRef.current = nextLocked;
    setIsLocked(nextLocked);
    if (!persistEvidence) return;
    try {
      if (nextLocked) localStorage.setItem(lockKey, "1");
      else localStorage.removeItem(lockKey);
    } catch {
      // Server metadata remains authoritative when storage is unavailable.
    }
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
  const localDraftUpdatedAtRef = useRef(0);

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
    startSession: startInspectionSession,
    replaceSession,
    finishSession: finishInspectionSession,
    resumeSession: resumeInspectionSession,
    pauseSession: pauseInspectionSession,
    addQuoteLine: addSessionQuoteLine,
    updateQuoteLine: updateSessionQuoteLine,
  } = useInspectionSession(persistedSession ?? initialSession);

  // Realtime finalization can arrive while this screen is open. Keep every
  // mutation entry point read-only as soon as the canonical row is locked.
  const updateInspection = (
    ...args: Parameters<typeof updateSessionInspection>
  ) => {
    if (!isLockedRef.current) updateSessionInspection(...args);
  };
  const updateItem = (...args: Parameters<typeof updateSessionItem>) => {
    if (!isLockedRef.current) updateSessionItem(...args);
  };
  const updateSection = (...args: Parameters<typeof updateSessionSection>) => {
    if (!isLockedRef.current) updateSessionSection(...args);
  };
  const addQuoteLine = (...args: Parameters<typeof addSessionQuoteLine>) => {
    if (!isLockedRef.current) addSessionQuoteLine(...args);
  };
  const updateQuoteLine = (
    ...args: Parameters<typeof updateSessionQuoteLine>
  ) => {
    if (!isLockedRef.current) updateSessionQuoteLine(...args);
  };
  const startSession = (
    ...args: Parameters<typeof startInspectionSession>
  ) => {
    if (!isLockedRef.current) startInspectionSession(...args);
  };
  const resumeSession = (
    ...args: Parameters<typeof resumeInspectionSession>
  ) => {
    if (!isLockedRef.current) resumeInspectionSession(...args);
  };
  const pauseSession = (
    ...args: Parameters<typeof pauseInspectionSession>
  ) => {
    if (!isLockedRef.current) pauseInspectionSession(...args);
  };
  const finishSession = (
    ...args: Parameters<typeof finishInspectionSession>
  ) => {
    if (!isLockedRef.current) finishInspectionSession(...args);
  };

  const {
    hydrated: serverBootLoaded,
    flush: flushAutosave,
    flushToServer: flushAutosaveToServer,
    label: autosaveLabel,
    lastError: autosaveError,
  } = useInspectionAutosave({
    session,
    inspectionId,
    workOrderLineId,
    enabled: draftBootLoaded && !inspectionCompletedRef.current,
    locked: isLocked,
    draftKey,
    recoveryOperationKey: recoveryOperationKeyRef.current,
    onRemoteSession: (remote) => {
      replaceSession(remote);
      localDraftUpdatedAtRef.current = inspectionDraftTimestamp(remote);
      try {
        localStorage.setItem(draftKey, JSON.stringify(remote));
      } catch {
        // IndexedDB and the server remain authoritative.
      }
    },
    onRemoteMeta: (meta) => {
      // An unversioned `locked: false` response means the canonical row has not
      // been observed yet; it must not erase durable evidence of an offline
      // signed inspection. Versioned server metadata remains authoritative.
      if (meta.updatedAt === null && !meta.locked) return;
      applyLockedState(meta.locked, meta.updatedAt !== null);
    },
    onRecoveryState: (state, operationKey) => {
      setRecoveryState(state);
      recoveryOperationKeyRef.current = operationKey;
      queuedSessionRef.current = operationKey ? session : null;
      skipNextQueuedEditCheckRef.current = false;
      setRecoveryMessage(
        state === "queued"
          ? "Inspection is safe on this device and queued for server sync."
          : state === "conflicted"
            ? "Sync paused to protect this device copy. It has not replaced the shop copy."
            : "Inspection progress is saved and available on all devices.",
      );
    },
  });

  useEffect(() => {
    let cancelled = false;
    inspectionCompletedRef.current = false;
    const recoverDraft = async () => {
      try {
        const recovered = await getInspectionOfflineDraft({
          draftKey,
          sessionHint: persistedSession ?? initialSession,
        });
        if (cancelled) return;
        if (recovered) {
          const recoveredAt = inspectionDraftTimestamp(recovered.session);
          const legacyAt = inspectionDraftTimestamp(persistedSession);
          // A conflicted IndexedDB draft is the protected device snapshot. Do
          // not let a later legacy localStorage timestamp replace it with the
          // already-loaded shop copy.
          const preferred =
            recovered.state === "conflicted"
              ? recovered.session
              : recoveredAt >= legacyAt
                ? recovered.session
                : persistedSession;
          if (preferred) {
            replaceSession(preferred);
            localDraftUpdatedAtRef.current = inspectionDraftTimestamp(preferred);
          }
          setRecoveryState(recovered.state);
          recoveryOperationKeyRef.current = recovered.operationKey;
          queuedSessionRef.current = null;
          skipNextQueuedEditCheckRef.current = Boolean(
            recovered.operationKey && recovered.state !== "editing",
          );
          setRecoveryMessage(
            recovered.state === "queued"
              ? "Recovered inspection · server save is queued."
              : recovered.state === "conflicted"
                ? "Recovered device copy · sync is paused without changing the shop copy."
                : `Recovered inspection saved ${new Date(recovered.savedAt).toLocaleString()}.`,
          );
        }
      } catch (error) {
        console.warn("[inspection] offline recovery unavailable", error);
      } finally {
        if (!cancelled) setDraftBootLoaded(true);
      }
    };
    void recoverDraft();
    return () => {
      cancelled = true;
    };
    // Recovery is intentionally keyed to the draft identity. Including startSession
    // would restart this effect on every render because the hook returns a new function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const fetchSmartMatch = async (
    sectionIndex: number,
    itemIndex: number,
  ): Promise<void> => {
    const sec = session?.sections?.[sectionIndex];
    const item = sec?.items?.[itemIndex];
    const key = itemKey(sectionIndex, itemIndex);

    const status = String(item?.status ?? "").toLowerCase();
    const note = safeTrimLocal((item as { notes?: unknown } | undefined)?.notes);
    const label = safeTrimLocal(
      (item as { item?: unknown; name?: unknown } | undefined)?.item ??
        (item as { item?: unknown; name?: unknown } | undefined)?.name,
    );
    const sectionTitle = safeTrimLocal(sec?.title);

    if (!(status === "fail" || status === "recommend") || !note) {
      setSmartMatchLoadingByKey((prev) => ({ ...prev, [key]: false }));
      setSmartMatchByKey((prev) => ({ ...prev, [key]: null }));
      return;
    }

    setSmartMatchLoadingByKey((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await fetch("/api/inspections/smart-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: label,
          notes: note,
          section: sectionTitle,
          status,
          vehicle: asVehicleForSmartMatch(vehicle),
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | {
            match?: {
              id?: string;
              label?: string;
              complaint?: string | null;
              correction?: string | null;
              laborHours?: number | null;
              parts?: Array<{ name: string; qty?: number }>;
              score?: number | null;
              confidence?: number | null;
              menuItemId?: string | null;
              menuRepairItemId?: string | null;
              acceptedCount?: number | null;
              acceptanceRate?: number | null;
              pricingStatus?: "fresh" | "stale" | "expired";
              pricingValidUntil?: string | null;
            } | null;
          }
        | null;

      const match = json?.match ?? null;

      const normalizedMatch: SmartMatchRow | null = match
        ? {
            id: String(match.id ?? `${sectionIndex}:${itemIndex}`),
            label: String(match.label ?? label ?? "Matched repair"),
            complaint: match.complaint ?? null,
            correction: match.correction ?? null,
            laborHours:
              typeof match.laborHours === "number" ? match.laborHours : null,
            parts: Array.isArray(match.parts)
              ? match.parts.map((part: { name: string; qty?: number }) => ({
                  name: String(part.name ?? "").trim(),
                  qty:
                    typeof part.qty === "number" && Number.isFinite(part.qty)
                      ? part.qty
                      : 1,
                }))
              : [],
            score: typeof match.score === "number" ? match.score : null,
            confidence:
              typeof match.confidence === "number" ? match.confidence : null,
            menuItemId: match.menuItemId ?? null,
            menuRepairItemId: match.menuRepairItemId ?? null,
            acceptedCount:
              typeof match.acceptedCount === "number"
                ? match.acceptedCount
                : null,
            acceptanceRate:
              typeof match.acceptanceRate === "number"
                ? match.acceptanceRate
                : null,
            pricingStatus: match.pricingStatus ?? "expired",
            pricingValidUntil: match.pricingValidUntil ?? null,
            autoAcceptReady:
              Boolean(match.menuRepairItemId ?? match.menuItemId) &&
              typeof match.confidence === "number" &&
              match.confidence >= 0.9 &&
              match.pricingStatus === "fresh",
            matchTier:
              typeof match.confidence === "number"
                ? match.confidence >= 0.9
                  ? "high"
                  : match.confidence >= 0.7
                    ? "medium"
                    : "low"
                : "low",
          }
        : null;

      setSmartMatchByKey((prev) => ({
        ...prev,
        [key]: normalizedMatch,
      }));
    } catch {
      setSmartMatchByKey((prev) => ({ ...prev, [key]: null }));
    } finally {
      setSmartMatchLoadingByKey((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleUpdateNoteWithSmartMatch = (
    secIdx: number,
    itemIdx: number,
    noteText: string,
  ): void => {
    if (guardLocked()) return;

    updateItem(secIdx, itemIdx, {
      notes: noteText,
    } as ItemPatch);

    const key = itemKey(secIdx, itemIdx);

    if (typeof window !== "undefined" && smartMatchTimers.current[key]) {
      window.clearTimeout(smartMatchTimers.current[key]);
    }

    if (typeof window !== "undefined") {
      smartMatchTimers.current[key] = window.setTimeout(() => {
        void fetchSmartMatch(secIdx, itemIdx);
      }, 450);
    }
  };

  const dismissSmartMatch = async (sectionIndex: number, itemIndex: number) => {
    if (guardLocked()) return;

    const key = itemKey(sectionIndex, itemIndex);
    const sec = session.sections?.[sectionIndex];
    const item = sec?.items?.[itemIndex];
    const match = smartMatchByKey[key];

    setSmartMatchByKey((prev) => ({ ...prev, [key]: null }));
    setSmartMatchLoadingByKey((prev) => ({ ...prev, [key]: false }));

    if (!match) return;

    try {
      await fetch("/api/inspections/smart-match/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemLabel:
            typeof item?.item === "string"
              ? item.item
              : typeof (item as { name?: unknown } | undefined)?.name === "string"
                ? (item as { name?: string }).name
                : null,
          note:
            typeof (item as { notes?: unknown } | undefined)?.notes === "string"
              ? (item as { notes?: string }).notes
              : null,
          suggestedMatchId: match.id,
          suggestedLabel: match.label,
          menuRepairItemId: match.menuRepairItemId ?? null,
          action: "dismissed",
          vehicle: asVehicleForSmartMatch(vehicle),
        }),
      });
    } catch {
      // fail open
    }
  };

  const acceptSmartMatch = async (
    sectionIndex: number,
    itemIndex: number,
  ): Promise<void> => {
    if (guardLocked()) return;

    const key = itemKey(sectionIndex, itemIndex);
    const match = smartMatchByKey[key];
    const sec = session?.sections?.[sectionIndex];
    const item = sec?.items?.[itemIndex] as
      | (InspectionSection["items"][number] & {
          estimateSubmitted?: boolean;
          estimateSubmittedAt?: string | null;
          estimateLastUpdatedAt?: string | null;
          estimateWorkOrderLineId?: string | null;
          estimateQuoteLineId?: string | null;
        })
      | undefined;

    if (!match || !workOrderId || !item) return;

    if (
      item.estimateSubmitted &&
      (item.estimateWorkOrderLineId || item.estimateQuoteLineId)
    ) {
      toast.message("Repair already added to Quote Review for this inspection item.");
      dismissSmartMatch(sectionIndex, itemIndex);
      return;
    }

    const note = safeTrimLocal((item as { notes?: unknown }).notes);
    const label = safeTrimLocal(
      (item as { item?: unknown; name?: unknown }).item ??
        (item as { item?: unknown; name?: unknown }).name,
    );

    try {
      if (match.menuItemId && !match.menuRepairItemId) {
        updateItem(sectionIndex, itemIndex, {
          laborHours:
            typeof match.laborHours === "number" ? match.laborHours : item.laborHours ?? null,
          parts: Array.isArray(match.parts)
            ? match.parts.map((part) => ({
                description: part.name,
                qty: part.qty ?? 1,
              }))
            : item.parts,
          smartMatch: {
            sourceType: "catalog_menu",
            label: match.label,
            menuItemId: match.menuItemId,
            menuRepairItemId: null,
            laborHours: typeof match.laborHours === "number" ? match.laborHours : null,
            parts: match.parts ?? [],
            pricingStatus: match.pricingStatus ?? null,
            pricingValidUntil: match.pricingValidUntil ?? null,
            confidence: match.confidence ?? null,
          },
        } as ItemPatch);
        setSmartMatchByKey((prev) => ({ ...prev, [key]: null }));
        setSmartMatchLoadingByKey((prev) => ({ ...prev, [key]: false }));
        toast.success("Authored menu service applied to this finding.");
        return;
      }

      let createdWorkOrderLineId: string | null = null;
      let createdQuoteLineId: string | null = null;

      if (match.menuRepairItemId) {
        const res = await fetch("/api/work-orders/quotes/add-from-menu-repair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId,
            menuRepairItemId: match.menuRepairItemId,
            notes: note || null,
            laborHours:
              typeof match.laborHours === "number" ? match.laborHours : null,
          }),
        });

        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; workOrderQuoteLineId?: string | null; quoteLineId?: string | null }
          | null;

        if (guardLocked()) return;

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to add matched repair");
        }

        createdQuoteLineId =
          typeof json?.workOrderQuoteLineId === "string" && json.workOrderQuoteLineId
            ? json.workOrderQuoteLineId
            : typeof json?.quoteLineId === "string" && json.quoteLineId
              ? json.quoteLineId
              : null;
      } else {
        const created = await addWorkOrderLineFromSuggestion({
          workOrderId,
          description: match.label || label || "Matched repair",
          section: safeTrimLocal(sec?.title),
          status: "awaiting",
          complaint: note || null,
          suggestion: {
            title: match.label,
            summary:
              match.correction ||
              match.complaint ||
              "Matched from previous repair",
            notes: note || undefined,
            laborHours:
              typeof match.laborHours === "number" ? match.laborHours : 0.5,
            parts: Array.isArray(match.parts)
              ? match.parts.map((part: { name: string; qty?: number }) => ({
                  name: part.name,
                  qty: part.qty ?? 1,
                }))
              : [],
            confidence:
              typeof match.confidence === "number"
                ? match.confidence >= 0.75
                  ? "high"
                  : match.confidence >= 0.45
                    ? "medium"
                    : "low"
                : "medium",
          },
          source: "inspection",
          jobType: "repair",
        });

        if (guardLocked()) return;

        const createdId = (created as { id?: unknown } | null)?.id;
        createdWorkOrderLineId =
          typeof createdId === "string" && createdId ? createdId : null;
      }

      const nowIso = new Date().toISOString();

      updateItem(sectionIndex, itemIndex, {
        estimateSubmitted: true,
        estimateSubmittedAt:
          typeof item.estimateSubmittedAt === "string" && item.estimateSubmittedAt
            ? item.estimateSubmittedAt
            : nowIso,
        estimateLastUpdatedAt: nowIso,
        estimateWorkOrderLineId: createdWorkOrderLineId,
        estimateQuoteLineId: createdQuoteLineId,
        smartMatch: {
          sourceType: "history_repair",
          label: match.label,
          menuItemId: null,
          menuRepairItemId: match.menuRepairItemId ?? null,
          laborHours: typeof match.laborHours === "number" ? match.laborHours : null,
          parts: match.parts ?? [],
          pricingStatus: match.pricingStatus ?? null,
          pricingValidUntil: match.pricingValidUntil ?? null,
          confidence: match.confidence ?? null,
        },
      } as ItemPatch);

      updateInspection({
        voiceMeta: {
          ...(session?.voiceMeta ?? {}),
          linesAddedToWorkOrder:
            (session?.voiceMeta?.linesAddedToWorkOrder ?? 0) + 1,
        } satisfies VoiceMeta,
      });

      if (guardLocked()) return;
      await fetch("/api/inspections/smart-match/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: session?.id,
          workOrderId,
          sectionTitle: sec?.title,
          itemLabel: label,
          note,
          match,
          createdWorkOrderLineId,
        }),
      });

      if (guardLocked()) return;
      await fetch("/api/inspections/smart-match/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemLabel: label,
          note,
          suggestedMatchId: match.id,
          suggestedLabel: match.label,
          menuRepairItemId: match.menuRepairItemId ?? null,
          action: "accepted",
          vehicle: asVehicleForSmartMatch(vehicle),
        }),
      });

      if (guardLocked()) return;

      const autoAcceptReady =
        match.autoAcceptReady === true ||
        (Boolean(match.menuRepairItemId) &&
          typeof match.confidence === "number" &&
          match.confidence >= 0.9 &&
          match.pricingStatus === "fresh");

      toast.success(
        autoAcceptReady
          ? "High-confidence matched repair added to Quote Review."
          : "Matched repair added to Quote Review.",
      );
      setSmartMatchByKey((prev) => ({ ...prev, [key]: null }));
      setSmartMatchLoadingByKey((prev) => ({ ...prev, [key]: false }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add matched repair",
      );
    }
  };


  // ✅ ensure voiceMeta exists for your UI + counters
  useEffect(() => {
    if (!session) return;
    if (!session.voiceMeta) {
      updateInspection({
        voiceMeta: { linesAddedToWorkOrder: 0 } satisfies VoiceMeta,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(lockKey);
      applyLockedState(raw === "1");
    } catch {}
    // Lock hydration is keyed only to the draft identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockKey]);

  const guardLocked = (): boolean => {
    if (!isLockedRef.current) return false;
    toast.error("This inspection is signed and locked. Editing is disabled.");
    return true;
  };

  /* ------------------------------ session boot ------------------------------ */

    useEffect(() => {
    if (persistedSession) {
      const hydratedSession: Partial<InspectionSession> & {
        workOrderLineId?: string | null;
      } = {
        ...persistedSession,
        workOrderId:
          persistedSession.workOrderId ??
          workOrderId ??
          null,
        workOrderLineId:
          (persistedSession as InspectionSession & {
            workOrderLineId?: string | null;
          }).workOrderLineId ??
          workOrderLineId ??
          null,
      };

      replaceSession(hydratedSession);
    } else {
      startSession(initialSession);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedSession, initialSession, workOrderId, workOrderLineId]);


  useEffect(() => {
    if (session && (session.sections?.length ?? 0) === 0) {
      updateInspection({ sections: bootSections });
    }
  }, [session, bootSections, updateInspection]);

  useEffect(() => {
    if (
      !session ||
      !draftBootLoaded ||
      !serverBootLoaded ||
      inspectionCompletedRef.current
    )
      return;

    let draftState = recoveryState;
    let operationKey = recoveryOperationKeyRef.current;
    let skipDraftWrite = false;
    if (operationKey && recoveryState !== "editing") {
      if (skipNextQueuedEditCheckRef.current) {
        skipNextQueuedEditCheckRef.current = false;
        queuedSessionRef.current = session;
        skipDraftWrite = true;
      } else if (queuedSessionRef.current !== session) {
        draftState = "editing";
        operationKey = undefined;
        recoveryOperationKeyRef.current = undefined;
        queuedSessionRef.current = null;
        setRecoveryState("editing");
        setRecoveryMessage(
          "Newer edits are safe on this device and will sync automatically.",
        );
      }
    }

    localDraftUpdatedAtRef.current = inspectionDraftTimestamp(session);
    try {
      localStorage.setItem(draftKey, JSON.stringify(session));
      window.dispatchEvent(
        new CustomEvent("inspection:draft-updated", {
          detail: { draftKey },
        }),
      );
    } catch {}

    if (skipDraftWrite) return;

    const timer = window.setTimeout(() => {
      if (inspectionCompletedRef.current) return;
      void saveInspectionOfflineDraft({
        draftKey,
        session,
        state: draftState,
        operationKey,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [session, draftKey, draftBootLoaded, serverBootLoaded, recoveryState]);

  useEffect(() => {
    const persistNow = () => {
      if (inspectionCompletedRef.current || !serverBootLoaded) return;
      try {
        const payload = {
          ...(session ?? initialSession),
          workOrderId:
            (session?.workOrderId ?? initialSession.workOrderId ?? workOrderId ?? null),
          workOrderLineId:
            (
              (session as (InspectionSession & { workOrderLineId?: string | null }) | null)
              ?.workOrderLineId ??
              (initialSession as Partial<InspectionSession> & { workOrderLineId?: string | null })
                .workOrderLineId ??
              workOrderLineId ??
              null
            ),
        };
        localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("beforeunload", persistNow);
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", persistNow);
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    session,
    draftKey,
    initialSession,
    workOrderId,
    workOrderLineId,
    serverBootLoaded,
  ]);

  useEffect(() => {
    const handler = (evt: Event) => {
      const e = evt as CustomEvent<{
        workOrderLineId?: unknown;
        cause?: unknown;
        correction?: unknown;
      }>;
      const detail = e.detail || {};
      const wol = String(detail.workOrderLineId || "");
      if (!wol) return;

      const merged =
        detail.cause && detail.correction
          ? {
              cause: String(detail.cause),
              correction: String(detail.correction),
            }
          : buildCauseCorrectionFromSession(session);

      window.dispatchEvent(
        new CustomEvent("causeCorrection:prefill", {
          detail: {
            workOrderLineId: wol,
            cause: merged.cause,
            correction: merged.correction,
            source: "inspection",
          },
        }),
      );

      try {
        localStorage.removeItem(draftKey);
        localStorage.removeItem(lockKey);
      } catch {}
      inspectionCompletedRef.current = true;
      void removeInspectionOfflineDraft({
        draftKey,
        session: session ?? initialSession,
      });
      recoveryOperationKeyRef.current = undefined;
      setRecoveryMessage(null);
    };

    window.addEventListener("inspection:completed", handler as EventListener);
    return () =>
      window.removeEventListener(
        "inspection:completed",
        handler as EventListener,
      );
  }, [session, draftKey, lockKey, initialSession]);

  // ✅ TS-safe label for ParsedCommand (no ".command" assumption)
  const commandLabel = (c: ParsedCommand): string => {
    const anyC = c as unknown as Record<string, unknown>;
    const cmd =
      typeof anyC.command === "string"
        ? anyC.command
        : typeof anyC.type === "string"
          ? anyC.type
          : "command";
    return cmd;
  };

  const appendVoiceTrace = (evt: {
    rawFinal: string;
    wakeCommand: string | null;
    parsed: ParsedCommand[];
    applied: VoiceCommandApplyResult[];
  }): void => {
    if (!session) return;

    const existing = Array.isArray(session.voiceTrace) ? session.voiceTrace : [];

    const next: VoiceTraceEvent = {
      id: uuidv4(),
      ts: Date.now(),
      rawFinal: evt.rawFinal,
      wakeCommand: evt.wakeCommand,
      parsed: evt.parsed,
      applied: evt.applied,
    };

    const trimmed = [...existing, next].slice(-200);
    updateInspection({ voiceTrace: trimmed });
  };

  const handleTranscript = async (text: string): Promise<void> => {
    if (!session || guardLocked()) return;

    const sess = session;

    const ensureFollowUpBase = (): VoiceMeta => {
      return (
        sess.voiceMeta ?? ({ linesAddedToWorkOrder: 0 } satisfies VoiceMeta)
      );
    };

    const setFollowUp = (
      next: NonNullable<VoiceMeta["followUp"]> | null,
    ): void => {
      updateInspection({
        voiceMeta: {
          ...ensureFollowUpBase(),
          followUp: next,
        } satisfies VoiceMeta,
      });
    };

    const clearFollowUp = (): void => setFollowUp(null);

    const followUp = sess.voiceMeta?.followUp ?? null;

    if (followUp && followUp.kind === "photo_prompt") {
      const answer = normalizeSpeech(text);

      if (/\b(yes|yeah|yep|open|photo|photos|add photos)\b/.test(answer)) {
        clearFollowUp();
        updateItem(followUp.sectionIndex, followUp.itemIndex, {
          photoRequested: true,
        } as ItemPatch);
        toast.success("Open photo capture from the item card.");
        speakLocal("Open photo capture.");
        appendVoiceTrace({
          rawFinal: text,
          wakeCommand: text,
          parsed: [],
          applied: [{ command: "photo_prompt_yes", ok: true }],
        });
        return;
      }

      if (/\b(no|nope|skip|later)\b/.test(answer)) {
        clearFollowUp();
        updateItem(followUp.sectionIndex, followUp.itemIndex, {
          photoRequested: false,
          findingReviewed: false,
        } as ItemPatch);
        toast.success("Okay, skipping photos for now.");
        speakLocal("Okay.");
        appendVoiceTrace({
          rawFinal: text,
          wakeCommand: text,
          parsed: [],
          applied: [{ command: "photo_prompt_no", ok: true }],
        });
        return;
      }
    }

    const mainText = text;

    const fallbackIdx =
      typeof sess.currentSectionIndex === "number"
        ? sess.currentSectionIndex
        : 0;

    const ctx =
      buildInterpretCtxForSpeech({
        speech: mainText,
        session: sess,
        fallbackSectionIndex: fallbackIdx,
      }) ?? {
        sectionTitle: String(sess.sections?.[fallbackIdx]?.title ?? ""),
        sectionTitles: (sess.sections ?? [])
          .map((s) => String(s.title ?? "").trim())
          .filter((v) => v.length > 0),
        items: (sess.sections ?? [])
          .flatMap((s) => s.items ?? [])
          .map((it) => String(it.item ?? it.name ?? "").trim())
          .filter((v) => v.length > 0),
      };

    let commands: ParsedCommand[] = [];
    const applied: VoiceCommandApplyResult[] = [];

    try {
      const correctionTarget = lastVoiceTargetRef.current;
      const correctionSpeech = normalizeSpeech(mainText);
      const correctionStatus =
        /\b(ok|okay|pass|good)\b/.test(correctionSpeech)
          ? "ok"
          : /\b(fail|failed|bad)\b/.test(correctionSpeech)
            ? "fail"
            : /\b(recommend|recommended|rec)\b/.test(correctionSpeech)
              ? "recommend"
              : /\b(not applicable|n a|na)\b/.test(correctionSpeech)
                ? "na"
                : null;
      const correctionNote = correctionSpeech.match(
        /^(?:add|append)\s+(?:a\s+)?note\s*(?::|that)?\s*(.+)$/,
      )?.[1];
      const correctionValueMatch = correctionSpeech.match(
        /\b(?:change|correct|correction|actually).*(?:measurement|reading|value)?\s*(?:was|is|to)?\s*(\d+(?:\.\d+)?)\b/,
      );
      const correctionValue = correctionValueMatch
        ? Number(correctionValueMatch[1])
        : null;

      if (
        correctionTarget &&
        correctionStatus &&
        /\b(change|correct|actually|make)\b/.test(correctionSpeech)
      ) {
        commands = [
          {
            command: "update_status",
            sectionIndex: correctionTarget.sectionIndex,
            itemIndex: correctionTarget.itemIndex,
            status: correctionStatus,
          } as unknown as ParsedCommand,
        ];
      } else if (correctionTarget && correctionNote) {
        commands = [
          {
            command: "add_note",
            sectionIndex: correctionTarget.sectionIndex,
            itemIndex: correctionTarget.itemIndex,
            note: correctionNote,
          } as unknown as ParsedCommand,
        ];
      } else if (
        correctionTarget &&
        correctionValue != null &&
        Number.isFinite(correctionValue)
      ) {
        commands = [
          {
            command: "update_value",
            sectionIndex: correctionTarget.sectionIndex,
            itemIndex: correctionTarget.itemIndex,
            value: correctionValue,
          } as unknown as ParsedCommand,
        ];
      } else {
        commands = await interpretCommand(mainText, ctx);
      }

      if (guardLocked()) return;

      // ✅ FALLBACK: if AI returns nothing, try local parsing
      if (!commands.length) {
        const fallback = localFallbackCommands(mainText);

        // IMPORTANT: clear "__auto__" so handleTranscript resolver can do its job
        for (const c of fallback) {
          const rec = c as unknown as Record<string, unknown>;
          if (rec.section === "__auto__") delete rec.section;
        }

        commands = fallback;
      }

      // If STILL nothing, log + stop
      if (!commands.length) {
        appendVoiceTrace({
          rawFinal: text,
          wakeCommand: text,
          parsed: [],
          applied: [
            { command: "interpret", ok: false, reason: "No commands returned" },
          ],
        });
        return;
      }

      let primaryFeedback: ReturnType<typeof buildVoiceBrainFeedback> | null = null;

      // ✅ Track the item the resolver actually applied to (NO manual focus assumptions)
      let lastAppliedTarget:
        | { sectionIndex: number; itemIndex: number }
        | null = null;

      for (const command of commands) {
        if (guardLocked()) return;

        // lightweight detection from parsed shape
        try {
          const result = await handleTranscriptFn({
            command,
            session: sess,
            updateInspection,
            updateItem,
            updateSection,
            finishSession,
            rawSpeech: mainText,
          });

          if (guardLocked()) return;

          // ✅ capture resolver-selected target (preferred)
          const r = result as unknown as {
            appliedTarget?: { sectionIndex: number; itemIndex: number };
          };

          if (r?.appliedTarget) {
            lastAppliedTarget = r.appliedTarget;
            lastVoiceTargetRef.current = r.appliedTarget;

            const okResult: VoiceCommandApplyResult = {
              command: commandLabel(command),
              ok: true,
            };

            applied.push(okResult);

            if (!primaryFeedback) {
              primaryFeedback = buildVoiceBrainFeedback({
                rawSpeech: text,
                parsed: [command],
                applied: [okResult],
              });
            }

          } else {
            applied.push({
              command: commandLabel(command),
              ok: false,
              reason: "No target resolved",
            });
          }
        } catch (err: unknown) {
          // eslint-disable-next-line no-console
          console.error("[voice] apply failed", err);
          applied.push({
            command: commandLabel(command),
            ok: false,
            reason: err instanceof Error ? err.message : "apply failed",
          });
        }
      }

      const successfulUpdates = applied.filter((result) => result.ok).length;
      const feedback =
        successfulUpdates > 1
          ? {
              spoken: `${successfulUpdates} inspection updates recorded.`,
              toast: `${successfulUpdates} inspection updates recorded`,
              followUp: { kind: "none" as const },
            }
          : primaryFeedback ??
            buildVoiceBrainFeedback({
              rawSpeech: text,
              parsed: commands,
              applied,
            });

      if (feedback.toast) {
        toast.success(feedback.toast);
      }

      if (feedback.spoken) {
        speakLocal(feedback.spoken);
      }

      if (feedback.followUp.kind === "photo_prompt" && lastAppliedTarget) {
        updateItem(lastAppliedTarget.sectionIndex, lastAppliedTarget.itemIndex, {
          photoRequested: true,
        } as ItemPatch);
        setFollowUp({
          kind: "photo_prompt",
          sectionIndex: lastAppliedTarget.sectionIndex,
          itemIndex: lastAppliedTarget.itemIndex,
        });
      } else {
        clearFollowUp();
      }

      appendVoiceTrace({
        rawFinal: text,
        wakeCommand: text,
        parsed: commands,
        applied,
      });
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error("[voice] handleTranscript failed", err);

      appendVoiceTrace({
        rawFinal: text,
        wakeCommand: text,
        parsed: commands,
        applied: [
          {
            command: "interpret",
            ok: false,
            reason: err instanceof Error ? err.message : "exception",
          },
        ],
      });
    }
  };

  function maybeHandleVoicePhrase(raw: string): string | null {
    const normalized = raw
      .toLowerCase()
      .replace(/[^\w\s.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) return null;

    const WAKE_PREFIXES = ["hey profix", "hey pro fix", "hey buster", "buster"] as const;
    let command = normalized;

    for (const prefix of WAKE_PREFIXES) {
      if (command === prefix) return null;
      if (command.startsWith(prefix + " ")) {
        command = command.slice(prefix.length).trimStart();
        break;
      }
    }

    const resumeCommand =
      /^(resume|resume listening|start listening|continue listening)$/.test(command);
    const holdCommand =
      /^(hold|hold listening|pause listening|ignore conversation)$/.test(command);
    const stopCommand =
      /^(stop|stop listening|end voice|end voice session)$/.test(command);

    if (resumeCommand) {
      voiceHeldRef.current = false;
      setVoiceHeld(false);
      toast.success("Free-form voice resumed.");
      speakLocal("Listening.");
      return null;
    }

    if (voiceHeldRef.current) return null;

    if (holdCommand) {
      voiceHeldRef.current = true;
      setVoiceHeld(true);
      toast.success("Voice is on hold. Say Buster resume to continue.");
      speakLocal("Voice on hold.");
      return null;
    }

    if (stopCommand) {
      window.setTimeout(() => stopListening(), 0);
      toast.success("Voice session stopped.");
      speakLocal("Voice stopped.");
      return null;
    }

    return command;
  }

  const voice = useRealtimeVoice(
    async (text: string) => {
      await handleTranscript(text);
    },
    (raw: string) => maybeHandleVoicePhrase(raw),
    {
      onStateChange: setVoiceState,
      onPulse: triggerVoicePulse,
      onError: (m) => {
        // eslint-disable-next-line no-console
        console.error("[Voice]", m);
        setVoiceState("error");
      },
    },
  );

  const startListening = async (): Promise<void> => {
    if (isListening) return;
    if (guardLocked()) return;

    try {
      voiceHeldRef.current = false;
      setVoiceHeld(false);
      await voice.start();
      if (guardLocked()) {
        voice.stop();
      }
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? e.message : "Unable to start voice";
      toast.error(msg);
      try {
        voice.stop();
      } catch {}
    }
  };

  const stopListening = (): void => {
    try {
      voice.stop();
    } catch {}

    voiceHeldRef.current = false;
    setVoiceHeld(false);
  };

  const inFlightRef = useRef<Set<string>>(new Set());
  const isSubmittingAI = (secIdx: number, itemIdx: number): boolean =>
    inFlightRef.current.has(`${secIdx}:${itemIdx}`);

  const submitAIForItem = async (
    secIdx: number,
    itemIdx: number,
  ): Promise<void> => {
    if (!session) return;

    if (guardLocked()) return;

    const key = `${secIdx}:${itemIdx}`;
    if (inFlightRef.current.has(key)) return;

    const it = session.sections[secIdx]?.items?.[itemIdx];
    if (!it) return;

    const status = String(it.status ?? "").toLowerCase();
    const note = String(it.notes ?? "").trim();

    if (!(status === "fail" || status === "recommend")) return;

    if (note.length === 0) {
      toast.error("Add a note before submitting.");
      return;
    }

    const itExt = it as unknown as {
      parts?: { description: string; qty: number }[];
      laborHours?: number | null;
      noPartsRequired?: boolean;
      name?: string | null;

      // ✅ estimate state (persisted on the item)
      estimateSubmitted?: boolean;
      estimateSubmittedAt?: string | null;
      estimateLastUpdatedAt?: string | null;

      // ✅ links so we UPDATE instead of creating new
      estimateWorkOrderLineId?: string | null;
      estimateQuoteLineId?: string | null;
    };

    const manualParts: { description: string; qty: number }[] = Array.isArray(
      itExt.parts,
    )
      ? itExt.parts
      : [];

    const manualLaborHours =
      typeof itExt.laborHours === "number" ? itExt.laborHours : null;
    const noPartsRequired = itExt.noPartsRequired === true;

    inFlightRef.current.add(key);

    let toastId: string | number | undefined;

    try {
      const desc = String(it.item ?? itExt.name ?? "Item");

      const existingLineId =
        typeof itExt.estimateWorkOrderLineId === "string" &&
        itExt.estimateWorkOrderLineId
          ? itExt.estimateWorkOrderLineId
          : null;

      const nowIso = new Date().toISOString();

      // ✅ reuse quote line if already submitted (avoid duplicates)
      const existingQuoteId =
        typeof itExt.estimateQuoteLineId === "string" && itExt.estimateQuoteLineId
          ? itExt.estimateQuoteLineId
          : null;

      const quoteId = existingQuoteId ?? uuidv4();

      if (!existingQuoteId) {
        const placeholder: QuoteLineItem = {
          id: quoteId,
          description: desc,
          item: desc,
          name: desc,
          status: status as "fail" | "recommend",
          notes: String(it.notes ?? ""),
          price: 0,
          laborTime: 0.5,
          laborRate: 0,
          editable: true,
          source: "inspection",
          value: (it as unknown as { value?: unknown }).value as
            | string
            | number
            | null
            | undefined,
          photoUrls: (it as unknown as { photoUrls?: unknown }).photoUrls as
            | string[]
            | undefined,
          aiState: "loading",
        };
        addQuoteLine(placeholder);
      } else {
        updateQuoteLine(quoteId, { aiState: "loading" });
      }

      toastId = toast.loading("Building estimate from inspection item…");

      const suggestion = await requestQuoteSuggestion({
        item: desc,
        notes: String(it.notes ?? ""),
        section: String(session.sections[secIdx]?.title ?? ""),
        status,
        vehicle: session.vehicle ?? undefined,
      });

      // Finalization can arrive over Realtime while AI or network work is in
      // flight. Do not continue into local or work-order mutations afterward.
      if (guardLocked()) return;

      if (!suggestion) {
        updateQuoteLine(quoteId, { aiState: "error" });
        toast.error("No AI suggestion available", { id: toastId });
        return;
      }

      const mergedParts: Array<{ name: string; qty: number; cost?: number }> =
        noPartsRequired
          ? []
          : manualParts
              .map((part) => ({
                name: String(part.description ?? "").trim(),
                qty: Number(part.qty ?? 0),
              }))
              .filter((part) => part.name.length > 0 && part.qty > 0);

      const laborTime =
        manualLaborHours != null && !Number.isNaN(manualLaborHours)
          ? manualLaborHours
          : (suggestion.laborHours ?? 0.5);

      const laborRate = suggestion.laborRate ?? 0;

      const partsTotal =
        mergedParts.reduce(
          (sum, p) => sum + (typeof p.cost === "number" ? p.cost : 0),
          0,
        ) ?? 0;

      const price = Math.max(0, partsTotal + laborRate * laborTime);

      updateQuoteLine(quoteId, {
        price,
        laborTime,
        laborRate,
        ai: {
          summary: suggestion.summary,
          confidence: suggestion.confidence,
          parts: mergedParts,
        },
        aiState: "done",
      });

      if (workOrderId) {
        const cleanParts = noPartsRequired
          ? []
          : manualParts
              .map((p) => ({
                description: String(p.description ?? "").trim(),
                qty: Number(p.qty ?? 0),
              }))
              .filter((p) => p.description.length > 0 && p.qty > 0);

        let createdJobId: string | null = null;
        let createdQuoteLineId: string | null = existingQuoteId;

        if (existingLineId) {
          if (guardLocked()) return;
          const updateRes = await fetch(
            "/api/work-orders/lines/update-from-inspection",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workOrderId,
                workOrderLineId: existingLineId,
                laborHours: laborTime,
                complaint: String(it.notes ?? "").trim() || null,
                notes: String(it.notes ?? "").trim() || null,
                aiSummary: suggestion.summary ?? null,
              }),
            },
          );

          if (guardLocked()) return;

          if (!updateRes.ok) {
            const body = (await updateRes.json().catch(() => null)) as unknown;
            // eslint-disable-next-line no-console
            console.error("Update WO line error", body);
            toast.error("Could not update existing estimate line", { id: toastId });
            return;
          }

          createdJobId = existingLineId;

          if (cleanParts.length > 0) {
            if (guardLocked()) return;
            const res = await fetch("/api/parts/requests/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workOrderId,
                jobId: existingLineId,
                notes: String(it.notes ?? "") || null,
                items: cleanParts,
              }),
            });

            if (guardLocked()) return;

            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as unknown;
              // eslint-disable-next-line no-console
              console.error("Parts request error", body);
              toast.error("Estimate updated, but parts request failed", {
                id: toastId,
              });
              return;
            }
          }

          toast.success("Estimate updated", { id: toastId });
        } else {
          const complaint = String(it.notes ?? "").trim() || null;

          if (guardLocked()) return;
          const created = await addWorkOrderLineFromSuggestion({
            workOrderId,
            description: desc,
            section: String(session.sections[secIdx]?.title ?? ""),
            status: "awaiting",
            complaint,
            suggestion: {
              ...suggestion,
              parts: noPartsRequired
                ? []
                : cleanParts.map((part) => ({
                    name: part.description,
                    qty: part.qty,
                  })),
              laborHours: laborTime,
              price: Math.max(0, laborRate * laborTime),
              notes: complaint ?? undefined,
            },
            source: "inspection",
            jobType: "repair",
          });

          if (guardLocked()) return;

          const createdId = (created as unknown as { id?: unknown })?.id;
          createdQuoteLineId = createdId ? String(createdId) : null;

          if (!createdQuoteLineId) {
            throw new Error("Quote line created without an id");
          }

          updateInspection({
            voiceMeta: {
              linesAddedToWorkOrder:
                (session.voiceMeta?.linesAddedToWorkOrder ?? 0) + 1,
            } satisfies VoiceMeta,
          });

          toast.success(
            cleanParts.length > 0 && !noPartsRequired
              ? "Added to Quote Review with parts request"
              : "Added to Quote Review — no parts required",
            { id: toastId },
          );
        }

        if (createdJobId || createdQuoteLineId) {
          updateItem(secIdx, itemIdx, {
            estimateSubmitted: true,
            estimateSubmittedAt: itExt.estimateSubmittedAt ?? nowIso,
            estimateLastUpdatedAt: nowIso,
            estimateWorkOrderLineId: createdJobId,
            estimateQuoteLineId: createdQuoteLineId ?? quoteId,
            noPartsRequired: noPartsRequired || cleanParts.length === 0,
          } as ItemPatch);
        }
      } else {
        toast.error("Missing work order id — saved locally only", { id: toastId });
      }

      } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("Submit AI failed:", e);

    // ✅ replace the loading toast if it exists
    const msg = e instanceof Error ? e.message : "Couldn't add to work order";
    if (toastId !== undefined) {
      toast.error(msg, { id: toastId });
    } else {
      toast.error(msg);
    }
  } finally {
    inFlightRef.current.delete(key);

    // ✅ ALWAYS dismiss the loading toast so it can never get stuck
    if (toastId !== undefined) {
      toast.dismiss(toastId);
    }
  }
};

  useEffect(() => {
    if (!isEmbed) return;

    const root = rootRef.current;
    if (!root) return;

    const BAD = [
      "h-screen",
      "min-h-screen",
      "max-h-screen",
      "overflow-hidden",
      "fixed",
      "inset-0",
      "w-screen",
      "overscroll-contain",
      "touch-pan-y",
    ];

    const scrub = (el: HTMLElement) => {
      if (!el.className) return;

      const classes = el.className.split(" ");
      const filtered = classes.filter((c) => c && !BAD.includes(c));

      if (filtered.length !== classes.length) {
        el.className = filtered.join(" ");
      }

      if (el.style?.overflow === "hidden") {
        el.style.overflow = "visible";
      }
    };

    root.querySelectorAll<HTMLElement>("*").forEach(scrub);

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes" && m.target instanceof HTMLElement) {
          scrub(m.target);
        }
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement) {
              scrub(n);
              n.querySelectorAll?.("*")?.forEach((child) => {
                if (child instanceof HTMLElement) scrub(child);
              });
            }
          });
        }
      }
    });

    obs.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => obs.disconnect();
  }, [isEmbed]);

  const currentSectionIndex =
    typeof session?.currentSectionIndex === "number"
      ? session.currentSectionIndex
      : 0;

  const safeSectionIndex =
    session &&
    currentSectionIndex >= 0 &&
    currentSectionIndex < session.sections.length
      ? currentSectionIndex
      : 0;

  function autoAdvanceFrom(secIdx: number, itemIdx: number): void {
    if (!session) return;
    const sections = session.sections;
    if (!sections || sections.length === 0) return;

    let sIdx = secIdx;
    let iIdx = itemIdx + 1;

    while (sIdx < sections.length) {
      const itemsLen = sections[sIdx].items?.length ?? 0;
      if (iIdx < itemsLen) break;
      sIdx += 1;
      iIdx = 0;
    }

    if (sIdx >= sections.length) {
      const lastSectionIndex = sections.length - 1;
      const lastItems = sections[lastSectionIndex].items ?? [];
      const lastItemIndex = Math.max(0, lastItems.length - 1);
      updateInspection({
        currentSectionIndex: lastSectionIndex,
        currentItemIndex: lastItemIndex,
      });
      return;
    }

    updateInspection({
      currentSectionIndex: sIdx,
      currentItemIndex: iIdx,
    });
  }

  function applyStatusToSection(
    sectionIndex: number,
    status: InspectionItemStatus,
  ): void {
    if (!session) return;
    if (guardLocked()) return;

    const section = session.sections[sectionIndex];
    if (!section) return;

    const nextItems = (section.items ?? []).map((it) => ({
      ...it,
      status,
    }));

    updateSection(sectionIndex, { ...section, items: nextItems });
    updateInspection({
      currentSectionIndex: sectionIndex,
      currentItemIndex: 0,
    });
  }

  function toggleSectionCollapsed(sectionIndex: number): void {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionIndex]: !prev[sectionIndex],
    }));
  }

  const handleAddCustomItem = (sectionIndex: number): void => {
    if (!session) return;
    if (guardLocked()) return;

    const label = (newItemLabels[sectionIndex] || "").trim();
    if (!label) {
      toast.error("Enter a label for the new item.");
      return;
    }

    const unitRaw = newItemUnits[sectionIndex] ?? "";
    const unitValue = unitRaw || null;

    const section = session.sections[sectionIndex];
    if (!section) return;

    const nextItems = [
      ...(section.items ?? []),
      { item: label, unit: unitValue, status: "na" as InspectionItemStatus },
    ];

    updateSection(sectionIndex, { ...section, items: nextItems });

    // reset inputs for just this section
    setNewItemLabels((prev) => ({ ...prev, [sectionIndex]: "" }));
    setNewItemUnits((prev) => ({ ...prev, [sectionIndex]: "" }));
  };

  /** Add axle rows to an AIR corner grid section */
  const handleAddAxleForSection = (
    sectionIndex: number,
    axleLabel: string,
  ): void => {
    if (!session) return;
    if (guardLocked()) return;

    const section = session.sections[sectionIndex];
    if (!section) return;

    const existingItems = section.items ?? [];

    const metrics: Array<{ label: string; unit: string | null }> = [
      { label: "Lining/Shoe", unit: "mm" },
      { label: "Drum/Rotor", unit: "mm" },
      { label: "Push Rod Travel", unit: "in" },
      { label: "Wheel Torque Outer", unit: "ft·lb" },
      { label: "Wheel Torque Inner", unit: "ft·lb" },
    ];

    const sides: Array<"Left" | "Right"> = ["Left", "Right"];

    const existingLabels = new Set(
      existingItems.map((it) => String(it.item ?? "").toLowerCase()),
    );

    const nextItems = [...existingItems];

    for (const side of sides) {
      for (const m of metrics) {
        const label = `${axleLabel} ${side} ${m.label}`;
        const k = label.toLowerCase();
        if (existingLabels.has(k)) continue;

        nextItems.push({
          item: label,
          unit: m.unit,
          status: "na" as InspectionItemStatus,
        });
        existingLabels.add(k);
      }
    }

    updateSection(sectionIndex, { ...section, items: nextItems });
  };

  /** Add axle rows to a TIRE grid section (tires only) */
  const handleAddTireAxleForSection = (
    sectionIndex: number,
    axleLabel: string,
  ): void => {
    if (!session) return;
    if (guardLocked()) return;

    const section = session.sections[sectionIndex];
    if (!section) return;

    const existingItems = section.items ?? [];

    const dualAxle = /^(drive|rear|tag|trailer)\b/i.test(axleLabel.trim());

    const metrics: Array<{ label: string; unit: string | null }> = dualAxle
      ? [
          { label: "Tire Pressure (Outer)", unit: "psi" },
          { label: "Tire Pressure (Inner)", unit: "psi" },
          { label: "Tread Depth (Outer)", unit: "mm" },
          { label: "Tread Depth (Inner)", unit: "mm" },
          { label: "Wheel Torque", unit: "ft·lb" },
        ]
      : [
          { label: "Tire Pressure", unit: "psi" },
          { label: "Tread Depth", unit: "mm" },
          { label: "Wheel Torque", unit: "ft·lb" },
        ];

    const sides: Array<"Left" | "Right"> = ["Left", "Right"];

    const existingLabels = new Set(
      existingItems.map((it) => String(it.item ?? "").toLowerCase()),
    );

    const nextItems = [...existingItems];

    for (const side of sides) {
      for (const m of metrics) {
        const label = `${axleLabel} ${side} ${m.label}`;
        const k = label.toLowerCase();
        if (existingLabels.has(k)) continue;

        nextItems.push({
          item: label,
          unit: m.unit,
          status: "na" as InspectionItemStatus,
        });
        existingLabels.add(k);
      }
    }

    updateSection(sectionIndex, { ...section, items: nextItems });
  };

  const handleSigned = (): void => {
    applyLockedState(true);
    toast.success("Inspection snapshot locked by signature.");
  };

  const handleReopenLockedInspection = async (): Promise<void> => {
    const canonicalInspectionId = session?.id ?? inspectionId;
    if (!canonicalInspectionId) {
      toast.error("Inspection id missing; cannot reopen.");
      return;
    }

    const reason = window.prompt("Reopen reason (required for audit trail):", "");
    if (!reason || !reason.trim()) {
      toast.error("A reopen reason is required.");
      return;
    }

    try {
      const res = await fetch("/api/inspections/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          inspectionId: canonicalInspectionId,
          reason: reason.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok || json?.error) throw new Error(json?.error ?? "Failed to reopen inspection");

      applyLockedState(false);
      toast.success("Inspection reopened. Editing is enabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reopen inspection.");
    }
  };

  const shell = isEmbed
    ? "relative mx-auto max-w-[1280px] px-3 py-4 pb-6 md:px-5 md:py-5"
    : "relative mx-auto max-w-5xl px-3 md:px-4 py-6 pb-[calc(9.5rem+env(safe-area-inset-bottom))]";

  const headerCard = `${PANEL_VARIANTS.primary} rounded-[22px] border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] px-4 py-4 shadow-[var(--theme-shadow-medium)] md:px-5 md:py-5 mb-3`;
  const sectionCard = `${PANEL_VARIANTS.primary} rounded-[22px] border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] px-3 py-3 shadow-[var(--theme-shadow-soft)] md:px-5 md:py-5 mb-4`;
  const supportCard = "space-y-3";
  const passiveCard = `${PANEL_VARIANTS.passive} rounded-xl px-3 py-2.5 md:px-4 md:py-3`;

  const sectionTitle =
    "text-lg md:text-xl font-semibold text-[var(--theme-text-primary,var(--theme-text-primary))] tracking-[-0.02em]";

  const hint =
    "mt-1 block text-xs text-[color:var(--theme-text-secondary)]";


  const findingsHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("inspectionId", inspectionId);

    if (workOrderId) params.set("workOrderId", workOrderId);
    if (workOrderLineId) params.set("workOrderLineId", workOrderLineId);
    if (templateName) params.set("template", templateName);

    return `/inspections/findings?${params.toString()}`;
  }, [inspectionId, workOrderId, workOrderLineId, templateName]);


  const allItems = (session.sections ?? []).flatMap((s) => s.items ?? []);
  const failed = allItems.filter(
    (it) => String(it.status ?? "").toLowerCase() === "fail",
  );
  const recommended = allItems.filter(
    (it) => String(it.status ?? "").toLowerCase() === "recommend",
  );
  const otherOkNa = allItems.filter((it) => {
    const st = String(it.status ?? "").toLowerCase();
    return st === "ok" || st === "na" || st === "" || st === "pass";
  });
  const linesAdded = session.voiceMeta?.linesAddedToWorkOrder ?? 0;

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="font-medium border-[color:var(--theme-border-soft)] text-[11px] tracking-[0.16em] uppercase text-[color:var(--theme-text-primary)]"
        onClick={async () => {
          try {
            await flushAutosave();
            router.push(findingsHref);
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Wait for the inspection to finish saving.",
            );
          }
        }}
        disabled={isLocked}
      >
        Open findings list
      </Button>

      {workOrderLineId && (
        <FinishInspectionButton
          session={session}
          workOrderLineId={workOrderLineId}
          disabled={isLocked}
          beforeNavigate={() => flushAutosaveToServer()}
        />
      )}

      {isLocked && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="font-medium border-amber-500/70 text-[11px] tracking-[0.16em] uppercase text-amber-100"
          onClick={() => void handleReopenLockedInspection()}
        >
          Reopen inspection
        </Button>
      )}
    </>
  );

  if (
    !draftBootLoaded ||
    !serverBootLoaded ||
    !session ||
    (session.sections?.length ?? 0) === 0
  ) {
    return (
      <div className="p-4 text-sm text-[color:var(--theme-text-secondary)]">Loading inspection…</div>
    );
  }

  const body = (
    <div ref={rootRef} className={shell + (isEmbed ? " inspection-embed" : "")}>
      {isEmbed && (
        <style jsx global>{`
          .inspection-embed,
          .inspection-embed * {
            overscroll-behavior: auto !important;
          }
        `}</style>
      )}

      {!isEmbed && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[var(--theme-gradient-panel)]"
        />
      )}

      <div className="relative space-y-3">
        {recoveryMessage && (
          <div
            role="status"
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              recoveryState === "conflicted"
                ? "border-red-400/40 bg-red-950/20 text-red-100"
                : recoveryState === "queued"
                  ? "border-amber-400/40 bg-amber-950/20 text-amber-100"
                  : "border-emerald-400/40 bg-emerald-950/20 text-emerald-100",
            )}
          >
            {recoveryMessage}
          </div>
        )}
        <div className={headerCard}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--theme-card-border,var(--theme-border-soft))] pb-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-text-muted,var(--theme-text-muted))]">
                Inspection
              </div>
              <div className="mt-0.5 text-base md:text-lg font-semibold text-[var(--theme-text-primary,var(--theme-text-primary))]">
                {session?.templateitem || templateName || "Inspection"}
              </div>
            </div>
            <ProgressTracker
              currentItem={session.currentItemIndex}
              currentSection={session.currentSectionIndex}
              totalSections={session.sections.length}
              totalItems={session.sections[safeSectionIndex]?.items?.length ?? 0}
            />
          </div>

          <CustomerVehicleHeader
            templateName=""
            customer={toHeaderCustomer(session.customer ?? null)}
            vehicle={toHeaderVehicle(session.vehicle ?? null)}
          />
        </div>

        <div className={supportCard}>
          <div className="flex flex-col gap-3 rounded-2xl bg-[#17202a] px-4 py-3 text-white shadow-[0_16px_36px_rgba(15,23,42,0.16)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--brand-primary)]", voicePulse && "ring-4 ring-orange-300/20")}>
                <span className={cn("h-2.5 w-2.5 rounded-full bg-white", voiceState === "listening" && "animate-pulse")} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold sm:text-base">
                  {voiceHeld
                    ? "Voice is on hold"
                    : voiceState === "listening"
                    ? "Free-form voice is listening…"
                    : voiceState === "connecting"
                      ? "Connecting voice capture…"
                      : voiceState === "error"
                        ? "Voice capture needs attention"
                        : isPaused
                          ? "Voice capture paused"
                          : "Voice capture ready"}
                </div>
                <div className="mt-1 flex h-3 items-center gap-0.5" aria-hidden>
                  {[4, 8, 6, 11, 7, 13, 9, 5, 10, 6, 12, 8, 4, 9, 5, 7].map((height, index) => (
                    <span key={`${height}-${index}`} className={cn("w-0.5 rounded-full bg-orange-300/80", !isListening && "opacity-25")} style={{ height }} />
                  ))}
                  {voiceHeld ? (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                      Say “Buster resume”
                    </span>
                  ) : isListening ? (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-200">
                      Any order · wake phrase optional
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/20 bg-white/5 text-[11px] font-semibold text-white hover:bg-white/10"
                onClick={() => setVoiceControlsOpen(true)}
              >
                Voice controls
              </Button>
              {!isLocked && <StartListeningButton isListening={isListening} onStart={startListening} />}
              {!isLocked && isListening && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-white/5 text-[11px] font-semibold text-white hover:bg-white/10"
                  onClick={stopListening}
                >
                  Stop
                </Button>
              )}
              {!isLocked && (isListening || isPaused) && (
                <PauseResumeButton
                  isPaused={isPaused}
                  onPause={() => {
                    setIsPaused(true);
                    pauseSession();
                    stopListening();
                  }}
                  onResume={() => {
                    setIsPaused(false);
                    resumeSession();
                    void startListening();
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] px-3 py-3 shadow-[var(--theme-shadow-soft)] sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-center text-xs font-semibold sm:justify-start"
              onClick={(): void => setUnit(unit === "metric" ? "imperial" : "metric")}
            >
              {unit === "metric" ? "Metric (mm / kPa)" : "Imperial (in / psi)"}
            </Button>

            <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:items-center">
              <span className="rounded-full bg-red-50 px-3 py-1.5 font-semibold text-red-700 dark:bg-red-950/35 dark:text-red-200">{failed.length} Fail</span>
              <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-800 dark:bg-amber-950/35 dark:text-amber-200">{recommended.length} Recommend</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-200">{otherOkNa.length} Pass / N/A</span>
              <span className="rounded-full bg-sky-50 px-3 py-1.5 font-semibold text-sky-700 dark:bg-sky-950/35 dark:text-sky-200">{linesAdded} WO lines</span>
            </div>
          </div>

          {Array.isArray(session.voiceTrace) && session.voiceTrace.length > 0 && (
            <details className={`${passiveCard} mt-2`}>
              <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                Voice log ({session.voiceTrace.length})
              </summary>
              <div className="mt-2 space-y-2">
                {session.voiceTrace
                  .slice(-6)
                  .reverse()
                  .map((e) => {
                    const okCount = (e.applied ?? []).filter((a) => a.ok).length;
                    const failCount = (e.applied ?? []).filter((a) => !a.ok).length;

                    return (
                      <div
                        key={e.id}
                        className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-[color:var(--theme-text-primary)]">{e.rawFinal}</div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                            {new Date(e.ts).toLocaleTimeString()}
                          </div>
                        </div>

                        <div className="mt-1 flex items-center gap-2 text-[11px]">
                          <span className="text-emerald-200">✓ {okCount}</span>
                          <span className="text-red-200">✕ {failCount}</span>
                          <span className="text-[color:var(--theme-text-muted)]">parsed: {(e.parsed ?? []).length}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </details>
          )}
        </div>

        <InspectionFormCtx.Provider value={{ updateItem, updateSection }}>
          {session.sections.map((section, sectionIndex) => {
            const itemsWithHints = (section.items ?? []).map((it) => {
              const stRaw = String(it.status ?? "").toLowerCase();
              const safeStatus: InspectionItemStatus =
                stRaw === "ok" ||
                stRaw === "fail" ||
                stRaw === "na" ||
                stRaw === "recommend"
                  ? (stRaw as InspectionItemStatus)
                  : "na";

              const label = String(
                (it as { item?: unknown; name?: unknown }).item ??
                  (it as { name?: unknown }).name ??
                  "",
              ).trim();

              const explicitUnit = it.unit ?? null;

              const toggleControlled =
                /tread|pad|lining|shoe|rotor|drum|push rod/i.test(label);

              return {
                ...it, // ✅ KEEP ORIGINAL SHAPE
                value: it.value ?? "",
                item: label, // ✅ CRITICAL: preserve controlled input value
                status: safeStatus,
                notes: String(it.notes ?? it.note ?? ""),
                unit: toggleControlled
                  ? unitHintGeneric(label, unit)
                  : explicitUnit || unitHintGeneric(label, unit),
              };
            });

            const batterySection = isBatterySection(section.title, itemsWithHints);
            const tireSection = isTireGridSection(section.title, itemsWithHints);
            const airSection =
              !tireSection && isAirCornerSection(section.title, itemsWithHints);
            const hydCornerSection = isHydraulicCornerSection(
              section.title,
              itemsWithHints,
            );

            const looksHydTire =
              itemsWithHints.some((it) => HYD_ABBR_RE.test(it.item ?? "")) ||
              itemsWithHints.some((it) => HYD_FULL_RE.test(it.item ?? ""));

            const useGrid =
              batterySection || airSection || tireSection || hydCornerSection;

            const collapsed = collapsedSections[sectionIndex] ?? false;

            const newLabel = newItemLabels[sectionIndex] ?? "";
            const newUnit = newItemUnits[sectionIndex] ?? "";

            return (
              <div
                key={`${section.title}-${sectionIndex}`}
                className={cn(sectionCard, safeSectionIndex === sectionIndex ? "" : "opacity-95")}
                data-section-index={sectionIndex}
              >
                {/* ✅ Only show the OUTER header for GRID sections.
                    Non-grid sections will use SectionDisplay’s header (prevents double title). */}
                {useGrid && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className={sectionTitle}>{section.title}</h2>

                    {safeSectionIndex === sectionIndex ? (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={isLocked}
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/60 dark:bg-emerald-950/35 dark:text-emerald-100"
                          onClick={() => applyStatusToSection(sectionIndex, "ok")}
                        >
                          All OK
                        </button>
                        <button
                          type="button"
                          disabled={isLocked}
                          className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/60 dark:bg-red-950/35 dark:text-red-100"
                          onClick={() => applyStatusToSection(sectionIndex, "fail")}
                        >
                          All Fail
                        </button>
                        <button
                          type="button"
                          disabled={isLocked}
                          className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-500/60 dark:bg-sky-950/35 dark:text-sky-100"
                          onClick={() => applyStatusToSection(sectionIndex, "na")}
                        >
                          All NA
                        </button>
                        <button
                          type="button"
                          disabled={isLocked}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-500/60 dark:bg-amber-950/35 dark:text-amber-100"
                          onClick={() =>
                            applyStatusToSection(sectionIndex, "recommend")
                          }
                        >
                          All REC
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.04em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-hover)]"
                          onClick={() => toggleSectionCollapsed(sectionIndex)}
                        >
                          {collapsed ? "Expand" : "Collapse"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] px-3 py-1.5 text-[10px] font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-hover)]"
                        onClick={() => toggleSectionCollapsed(sectionIndex)}
                      >
                        {collapsed ? "Expand" : "Collapse"}
                      </button>
                    )}
                  </div>
                )}

                {collapsed ? (
                  <p className="mt-2 text-center text-[11px] text-[color:var(--theme-text-secondary)]">
                    Section collapsed. Tap <span className="font-semibold">Expand</span>{" "}
                    to reopen.
                  </p>
                ) : (
                  <>
                    {useGrid && (
                      <span className={hint}>
                        {unit === "metric"
                          ? "Enter mm / kPa / N·m"
                          : "Enter in / psi / ft·lb"}
                      </span>
                    )}

                    <div className="mt-3 md:mt-4">
                      {useGrid ? (
                        <>
                          {batterySection ? (
                          <BatteryGrid
                            sectionIndex={sectionIndex}
                            items={itemsWithHints}
                            unitHint={(label: string) => unitHintGeneric(label, unit)}
                          />
                        ) : airSection ? (
                          <AirCornerGrid
                            sectionIndex={sectionIndex}
                            items={itemsWithHints}
                            unitHint={(label: string) => unitHintGeneric(label, unit)}
                            onAddAxle={(axleLabel: string) =>
                              handleAddAxleForSection(sectionIndex, axleLabel)
                            }
                            onSpecHint={(metricLabel: string) =>
                              props.onSpecHint?.({
                                source: "air_corner",
                                label: metricLabel,
                                meta: { sectionTitle: section.title },
                              })
                            }
                          />
                        ) : tireSection ? (
                          looksHydTire ? (
                            <TireGridHydraulic
                              sectionIndex={sectionIndex}
                              items={itemsWithHints}
                              unitHint={(label: string) => unitHintGeneric(label, unit)}
                              requireNoteForAI
                              onSubmitAI={(secIdx: number, itemIdx: number) => {
                                void submitAIForItem(secIdx, itemIdx);
                              }}
                              isSubmittingAI={(secIdx: number, itemIdx: number) =>
                                isSubmittingAI(secIdx, itemIdx)
                              }
                              onUpdateParts={(secIdx, itemIdx, parts) => {
                                if (guardLocked()) return;
                                updateItem(secIdx, itemIdx, { parts } as ItemPatch);
                              }}
                              onUpdateLaborHours={(secIdx, itemIdx, hours) => {
                                if (guardLocked()) return;
                                updateItem(secIdx, itemIdx, {
                                  laborHours: hours,
                                } as ItemPatch);
                              }}
                            />
                          ) : (
                            <TireGrid
                              sectionIndex={sectionIndex}
                              items={itemsWithHints}
                              unitHint={(label: string) => unitHintGeneric(label, unit)}
                              onAddAxle={(axleLabel: string) =>
                                handleAddTireAxleForSection(sectionIndex, axleLabel)
                              }
                              onSpecHint={(metricLabel: string) =>
                                props.onSpecHint?.({
                                  source: "tire",
                                  label: metricLabel,
                                  meta: { sectionTitle: section.title },
                                })
                              }
                              requireNoteForAI
                              onSubmitAI={(secIdx: number, itemIdx: number) => {
                                void submitAIForItem(secIdx, itemIdx);
                              }}
                              isSubmittingAI={(secIdx: number, itemIdx: number) =>
                                isSubmittingAI(secIdx, itemIdx)
                              }
                              smartMatchByKey={smartMatchByKey}
                              smartMatchLoadingByKey={smartMatchLoadingByKey}
                              onAcceptSmartMatch={(secIdx: number, itemIdx: number) => {
                                void acceptSmartMatch(secIdx, itemIdx);
                              }}
                              onDismissSmartMatch={dismissSmartMatch}
                              onSmartMatchNoteChange={handleUpdateNoteWithSmartMatch}
                              onUpdateParts={(secIdx, itemIdx, parts) => {
                                if (guardLocked()) return;
                                updateItem(secIdx, itemIdx, { parts } as ItemPatch);
                              }}
                              onUpdateLaborHours={(secIdx, itemIdx, hours) => {
                                if (guardLocked()) return;
                                updateItem(secIdx, itemIdx, {
                                  laborHours: hours,
                                } as ItemPatch);
                              }}
                            />
                          )
                        ) : (
                          <CornerGrid
                            sectionIndex={sectionIndex}
                            items={itemsWithHints}
                            unitHint={(label: string) => unitHintGeneric(label, unit)}
                            onSpecHint={(label: string) =>
                              props.onSpecHint?.({
                                source: "corner",
                                label,
                                meta: { sectionTitle: section.title },
                              })
                            }
                          />
                          )}
                          <SectionDisplay
                            title={section.title}
                            showGridFindings
                            section={{ ...section, items: itemsWithHints }}
                            sectionIndex={sectionIndex}
                            showNotes
                            showPhotos
                            inspectionId={inspectionId}
                            workOrderId={workOrderId}
                            workOrderLineId={workOrderLineId || null}
                            draftKey={draftKey}
                            onUpdateStatus={(
                              secIdx: number,
                              itemIdx: number,
                              statusValue: InspectionItemStatus,
                            ) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, {
                                status: statusValue,
                              } as ItemPatch);
                              autoAdvanceFrom(secIdx, itemIdx);
                            }}
                            onUpdateNote={handleUpdateNoteWithSmartMatch}
                            onUpload={(
                              photoUrl: string,
                              secIdx: number,
                              itemIdx: number,
                            ) => {
                              if (guardLocked()) return;
                              const prev =
                                session.sections[secIdx].items[itemIdx].photoUrls ??
                                [];
                              updateItem(secIdx, itemIdx, {
                                photoUrls: [...prev, photoUrl],
                              } as ItemPatch);
                            }}
                            onUpdateParts={(
                              secIdx: number,
                              itemIdx: number,
                              parts: { description: string; qty: number }[],
                            ) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, {
                                parts,
                              } as ItemPatch);
                            }}
                            onUpdateLaborHours={(
                              secIdx: number,
                              itemIdx: number,
                              hours: number | null,
                            ) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, {
                                laborHours: hours,
                              } as ItemPatch);
                            }}
                            onUpdateNoPartsRequired={(
                              secIdx: number,
                              itemIdx: number,
                              value: boolean,
                            ) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, {
                                noPartsRequired: value,
                                ...(value ? { parts: [] } : {}),
                              } as ItemPatch);
                            }}
                            requireNoteForAI
                            onSubmitAI={(secIdx: number, itemIdx: number) => {
                              void submitAIForItem(secIdx, itemIdx);
                            }}
                            isSubmittingAI={isSubmittingAI}
                            smartMatchByKey={smartMatchByKey}
                            smartMatchLoadingByKey={smartMatchLoadingByKey}
                            onAcceptSmartMatch={(secIdx: number, itemIdx: number) => {
                              void acceptSmartMatch(secIdx, itemIdx);
                            }}
                            onDismissSmartMatch={dismissSmartMatch}
                          />
                        </>
                      ) : (
                        <>
                                                    <SectionDisplay
                            title={section.title}
                            section={{ ...section, items: itemsWithHints }}
                            sectionIndex={sectionIndex}
                            showNotes
                            showPhotos
                            inspectionId={inspectionId}
                            workOrderId={workOrderId}
                            workOrderLineId={workOrderLineId || null}
                            draftKey={draftKey}
                            onUpdateStatus={(
                              secIdx: number,
                              itemIdx: number,
                              statusValue: InspectionItemStatus,
                            ) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, {
                                status: statusValue,
                              } as ItemPatch);
                              autoAdvanceFrom(secIdx, itemIdx);
                            }}
                            onUpdateNote={handleUpdateNoteWithSmartMatch}
                            onUpload={(
                              photoUrl: string,
                              secIdx: number,
                              itemIdx: number,
                            ) => {
                              if (guardLocked()) return;
                              const prev =
                                session.sections[secIdx].items[itemIdx].photoUrls ??
                                [];
                              updateItem(secIdx, itemIdx, {
                                photoUrls: [...prev, photoUrl],
                              } as ItemPatch);
                            }}
                            onUpdateParts={(
                              secIdx: number,
                              itemIdx: number,
                              parts: { description: string; qty: number }[],
                            ) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, {
                                parts,
                              } as ItemPatch);
                            }}
                            onUpdateLaborHours={(
                              secIdx: number,
                              itemIdx: number,
                              hours: number | null,
                            ) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, {
                                laborHours: hours,
                              } as ItemPatch);
                            }}
                            onUpdateNoPartsRequired={(
                              secIdx: number,
                              itemIdx: number,
                              value: boolean,
                            ) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, {
                                noPartsRequired: value,
                                ...(value ? { parts: [] } : {}),
                              } as ItemPatch);
                            }}
                            requireNoteForAI
                            onSubmitAI={(secIdx: number, itemIdx: number) => {
                              void submitAIForItem(secIdx, itemIdx);
                            }}
                            isSubmittingAI={isSubmittingAI}
                            smartMatchByKey={smartMatchByKey}
                            smartMatchLoadingByKey={smartMatchLoadingByKey}
                            onAcceptSmartMatch={(secIdx: number, itemIdx: number) => {
                              void acceptSmartMatch(secIdx, itemIdx);
                            }}
                            onDismissSmartMatch={dismissSmartMatch}
                          />

                          <div className="mt-3 rounded-xl border border-[var(--theme-card-border,var(--theme-border-soft))] bg-[color:color-mix(in_srgb,var(--theme-surface-2,var(--theme-surface-page))_65%,transparent)] px-3 py-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted,var(--theme-text-muted))]">
                                Section authoring
                              </div>
                              <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                                Add custom item
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                              <input
                                className="flex-1 rounded-lg border border-[var(--theme-card-border,var(--theme-border-soft))] bg-[color:color-mix(in_srgb,var(--theme-surface-2,var(--theme-surface-page))_80%,transparent)] px-3 py-1.5 text-sm text-[var(--theme-text-primary,var(--theme-text-primary))] placeholder:text-[var(--theme-text-muted,var(--theme-text-muted))] focus:border-[var(--brand-accent,#E39A6E)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_55%,transparent)]"
                                placeholder="Item label (e.g. Rear frame inspection)"
                                value={newLabel}
                                onChange={(e) =>
                                  setNewItemLabels((prev) => ({
                                    ...prev,
                                    [sectionIndex]: e.target.value,
                                  }))
                                }
                                disabled={isLocked}
                              />
                              <div className="flex items-center gap-2 md:w-auto">
                                <select
                                  className="rounded-lg border border-[var(--theme-card-border,var(--theme-border-soft))] bg-[color:color-mix(in_srgb,var(--theme-surface-2,var(--theme-surface-page))_80%,transparent)] px-2 py-1.5 text-sm text-[var(--theme-text-primary,var(--theme-text-primary))] focus:border-[var(--brand-accent,#E39A6E)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-accent,#E39A6E)_55%,transparent)]"
                                  value={newUnit}
                                  onChange={(e) =>
                                    setNewItemUnits((prev) => ({
                                      ...prev,
                                      [sectionIndex]: e.target.value,
                                    }))
                                  }
                                  title="Measurement unit"
                                  disabled={isLocked}
                                >
                                  {UNIT_OPTIONS.map((u) => (
                                    <option key={u || "blank"} value={u}>
                                      {u || "— unit —"}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  type="button"
                                  className="whitespace-nowrap px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]"
                                  onClick={() => handleAddCustomItem(sectionIndex)}
                                  disabled={isLocked}
                                >
                                  + Add Item
                                </Button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </InspectionFormCtx.Provider>

        <div className="mt-2">
          <InspectionSignaturePanel
            inspectionId={inspectionId}
            workOrderLineId={workOrderLineId}
            role="technician"
            defaultName={(() => {
              const techName =
                typeof (session as unknown as { technicianName?: unknown })
                  .technicianName === "string"
                  ? (session as unknown as { technicianName: string }).technicianName
                  : "";
              return techName.trim().length ? techName.trim() : undefined;
            })()}
            techSettingsHref="/dashboard/tech/settings"
            beforeSign={() => flushAutosaveToServer()}
            onSigned={handleSigned}
          />
        </div>

        {!isEmbed && (
          <div className="mt-4 md:mt-6 border-t border-[color:var(--theme-border-soft)] pt-4">
            <div className="text-xs text-[color:var(--theme-text-secondary)] md:text-right">
              <span className="font-semibold text-[color:var(--theme-text-primary)]">Legend:</span> P =
              Pass &nbsp;•&nbsp; F = Fail &nbsp;•&nbsp; NA = Not applicable
            </div>
          </div>
        )}
      </div>

      <div className={cn(
        "z-40 border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(15,23,42,0.08)]",
        isEmbed ? "sticky bottom-0 -mx-3 md:-mx-5" : "fixed inset-x-0 bottom-0",
      )}>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-2 [&>*]:w-full [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:flex-wrap sm:items-center sm:[&>*]:w-auto">{actions}</div>
          <div className="order-first text-[10px] font-medium text-[color:var(--theme-text-secondary)] sm:order-none">
            <span>{autosaveLabel}</span>
            {autosaveError && (
              <span className="ml-2 text-red-300">{autosaveError}</span>
            )}
          </div>
        </div>
      </div>

      <VoiceControlsPanel
        isOpen={voiceControlsOpen}
        onClose={() => setVoiceControlsOpen(false)}
        voiceState={voiceState}
        isHeld={voiceHeld}
      />

      {showMissingLineWarning && (
        <div className={cn("inset-x-0 z-50 px-3", isEmbed ? "sticky bottom-[76px]" : "fixed bottom-[52px]")}>
          <div className="mx-auto max-w-[1100px] rounded-xl border border-red-500/40 bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-xs text-red-200 shadow-[var(--theme-shadow-medium)]">
            Missing <code>workOrderLineId</code> — autosave/finish will be blocked.
          </div>
        </div>
      )}
    </div>
  );

  if (isEmbed) {
    return body;
  }

  return (
    <PageShell
      title={session?.templateitem || templateName || "Inspection"}
      description="Complete a free-form inspection, capture evidence, and keep every device in sync."
    >
      {body}
    </PageShell>
  );
}
