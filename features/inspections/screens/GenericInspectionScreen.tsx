"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";

import PauseResumeButton from "@inspections/lib/inspection/PauseResume";
import StartListeningButton from "@inspections/lib/inspection/StartListeningButton";
import ProgressTracker from "@inspections/lib/inspection/ProgressTracker";
import useInspectionSession from "@inspections/hooks/useInspectionSession";

import { handleTranscriptFn } from "@inspections/lib/inspection/handleTranscript";
import { interpretCommand } from "@inspections/components/inspection/interpretCommand";
import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";
import { addWorkOrderLineFromSuggestion } from "@inspections/lib/inspection/addWorkOrderLine";

import type {
  ParsedCommand,
  InspectionItemStatus,
  InspectionStatus,
  InspectionSection,
  InspectionSession,
  SessionCustomer,
  SessionVehicle,
  QuoteLineItem,
} from "@inspections/lib/inspection/types";

import SectionDisplay from "@inspections/lib/inspection/SectionDisplay";
import CornerGrid from "@inspections/lib/inspection/ui/CornerGrid";
import AirCornerGrid from "@inspections/lib/inspection/ui/AirCornerGrid";
import TireGrid from "@inspections/lib/inspection/ui/TireCornerGrid";
import TireGridHydraulic from "@inspections/lib/inspection/ui/TireGridHydraulic";
import BatteryGrid from "@inspections/lib/inspection/ui/BatteryGrid";

import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import CustomerVehicleHeader from "@inspections/lib/inspection/ui/CustomerVehicleHeader";
import InspectionSignaturePanel from "@inspections/components/inspection/InspectionSignaturePanel";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

import { useRealtimeVoice } from "@inspections/lib/inspection/useRealtimeVoice";

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
        existing.map((x) => String((x as { item?: unknown }).item ?? "").toLowerCase()),
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

    return Array.from(byTitle.values()).filter((s) => (s.items?.length ?? 0) > 0);
  } catch {
    return [];
  }
}

/* -------- smarter grid detectors -------- */

const AIR_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const HYD_ABBR_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const HYD_FULL_RE = /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

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

function isAirCornerSection(title: string | undefined, items: { item?: string | null }[] = []): boolean {
  const t = (title || "").toLowerCase();
  if (t.includes("air corner") || t.includes("air corner grid")) return true;
  if (t.includes("tires & brakes — air")) return true;
  return items.some((it) => AIR_RE.test(it.item ?? ""));
}

function isTireGridSection(title: string | undefined, items: { item?: string | null }[] = []): boolean {
  const t = (title || "").toLowerCase();
  if (t.includes("tire grid") || t.includes("tires grid")) return true;
  if (t.includes("tires") && t.includes("corner")) return true;

  const tireSignals = items.filter((it) => {
    const l = (it.item ?? "").toLowerCase();
    return l.includes("tire pressure") || l.includes("tire tread") || l.includes("tread depth");
  });

  if (tireSignals.length >= 2) {
    return tireSignals.some((it) => AIR_RE.test(it.item ?? "") || HYD_ABBR_RE.test(it.item ?? ""));
  }

  return false;
}

function isHydraulicCornerSection(title: string | undefined, items: { item?: string | null }[] = []): boolean {
  const t = (title || "").toLowerCase();

  // IMPORTANT: if this is a Tire Grid section, it is NOT the hydraulic corner grid
  if (isTireGridSection(title, items)) return false;

  if (t.includes("corner grid") || t.includes("tires & brakes — truck")) return true;
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
  if (args.workOrderLineId) return `inspection-draft:line:${args.workOrderLineId}`;
  if (args.workOrderId) return `inspection-draft:wo:${args.workOrderId}:${t}`;
  return `inspection-draft:template:${t}:${args.inspectionId}`;
}

function buildCauseCorrectionFromSession(s: unknown): { cause: string; correction: string } {
  const sess = s as { sections?: unknown };
  const sections: unknown[] = Array.isArray(sess?.sections) ? (sess.sections as unknown[]) : [];

  const failed: string[] = [];
  const rec: string[] = [];

  for (const secRaw of sections) {
    const sec = secRaw as { title?: unknown; items?: unknown };
    const title = String(sec?.title ?? "").trim();
    const items: unknown[] = Array.isArray(sec?.items) ? (sec.items as unknown[]) : [];

    for (const itRaw of items) {
      const it = itRaw as Record<string, unknown>;
      const st = String(it?.status ?? "").toLowerCase();
      if (st !== "fail" && st !== "recommend") continue;

      const label = String(it?.item ?? it?.name ?? it?.description ?? "Item").trim();
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
      correction: "Inspection completed. No failed or recommended items were recorded.",
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

/* -------------------------------------------------------------------- */
/* Component                                                            */
/* -------------------------------------------------------------------- */

export default function GenericInspectionScreen(_props: GenericInspectionScreenProps): JSX.Element {
  const routeSp = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const sp = useMemo(() => {
    const staged = readStaged<Record<string, string>>("inspection:params");

    if (staged && Object.keys(staged).length > 0) {
      const merged = new URLSearchParams();

      // URL first
      routeSp.forEach((value, key) => merged.set(key, value));

      // staged second (wins)
      Object.entries(staged).forEach(([key, value]) => {
        if (value != null) merged.set(key, String(value));
      });

      return merged;
    }

    return routeSp;
  }, [routeSp]);

  const gridParam = (sp.get("grid") || "").toLowerCase(); // used for tire-grid selection (hyd vs air)

  const isEmbed = useMemo(
    () => ["1", "true", "yes"].includes((sp.get("embed") || sp.get("compact") || "").toLowerCase()),
    [sp],
  );

  const workOrderId = sp.get("workOrderId") || null;
  const workOrderLineId = sp.get("workOrderLineId") || "";

  const showMissingLineWarning = isEmbed && !workOrderLineId;

  const templateName =
    (typeof window !== "undefined" ? sessionStorage.getItem("inspection:title") : null) ||
    sp.get("template") ||
    "Inspection";

  const customer: SessionCustomer = {
    first_name: sp.get("first_name") || "",
    last_name: sp.get("last_name") || "",
    phone: sp.get("phone") || "",
    email: sp.get("email") || "",
    address: sp.get("address") || "",
    city: sp.get("city") || "",
    province: sp.get("province") || "",
    postal_code: sp.get("postal_code") || "",
  };

  const vehicle: SessionVehicle = {
    year: sp.get("year") || "",
    make: sp.get("make") || "",
    model: sp.get("model") || "",
    vin: sp.get("vin") || "",
    license_plate: sp.get("license_plate") || "",
    mileage: sp.get("mileage") || "",
    color: sp.get("color") || "",
    unit_number: sp.get("unit_number") || "",
    engine_hours: sp.get("engine_hours") || "",
  };

  const bootSections = useMemo<InspectionSection[]>(() => {
    const staged = readStaged<InspectionSection[]>("inspection:sections");
    if (Array.isArray(staged) && staged.length) return normalizeSections(staged);

    try {
      const legacy = typeof window !== "undefined" ? sessionStorage.getItem("customInspection:sections") : null;
      if (legacy) {
        const parsed = JSON.parse(legacy) as InspectionSection[];
        return normalizeSections(parsed);
      }
    } catch {}

    return [
      {
        title: "General",
        items: [{ item: "Visual walkaround" }, { item: "Record warning lights" }],
      },
    ];
  }, []);

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
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const [newItemLabels, setNewItemLabels] = useState<Record<number, string>>({});
  const [newItemUnits, setNewItemUnits] = useState<Record<number, string>>({});

  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});

  const [wakeActive, setWakeActive] = useState(false);
  const wakeTimeoutRef = useRef<number | null>(null);

  const initialSession = useMemo<Partial<InspectionSession>>(
    () => ({
      id: inspectionId,
      templateitem: templateName,
      status: "not_started" as InspectionStatus,
      isPaused: false,
      isListening: false,
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
    [inspectionId, templateName, customer, vehicle],
  );

  const {
    session,
    updateInspection,
    updateItem,
    updateSection,
    startSession,
    finishSession,
    resumeSession,
    pauseSession,
    addQuoteLine,
    updateQuoteLine,
  } = useInspectionSession(persistedSession ?? initialSession);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(lockKey);
      setIsLocked(raw === "1");
    } catch {}
  }, [lockKey]);

  const guardLocked = (): boolean => {
    if (!isLocked) return false;
    toast.error("This inspection is signed and locked. Editing is disabled.");
    return true;
  };

  /* ------------------------------ session boot ------------------------------ */

  useEffect(() => {
    if (persistedSession) {
      startSession(persistedSession);
    } else {
      startSession(initialSession);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedSession]);

  useEffect(() => {
    if (session && (session.sections?.length ?? 0) === 0) {
      updateInspection({ sections: bootSections });
    }
  }, [session, bootSections, updateInspection]);

  useEffect(() => {
    if (!session) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(session));
    } catch {}
  }, [session, draftKey]);

  useEffect(() => {
    const persistNow = () => {
      try {
        const payload = session ?? initialSession;
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
  }, [session, draftKey, initialSession]);

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
    };

    window.addEventListener("inspection:completed", handler as EventListener);
    return () => window.removeEventListener("inspection:completed", handler as EventListener);
  }, [session, draftKey, lockKey]);

  const handleTranscript = async (text: string): Promise<void> => {
    if (!session || guardLocked()) return;
    const commands: ParsedCommand[] = await interpretCommand(text);
    const sess = session;
    if (!sess) return;

    for (const command of commands) {
      await handleTranscriptFn({
        command,
        session: sess,
        updateInspection,
        updateItem,
        updateSection,
        finishSession,
      });
    }
  };

  function maybeHandleWakeWord(raw: string): string | null {
    const cleaned = raw.trim();
    const lower = cleaned.toLowerCase();

    const WAKE_PREFIXES = ["techy", "techie", "tekky", "teki"];

    const matchPrefix = (): { prefix: string; remainder: string } | null => {
      for (const prefix of WAKE_PREFIXES) {
        if (lower.startsWith(prefix + " ")) {
          return {
            prefix,
            remainder: cleaned.slice(prefix.length).trimStart(),
          };
        }
        if (lower === prefix) {
          return { prefix, remainder: "" };
        }
      }
      return null;
    };

    if (!wakeActive) {
      const match = matchPrefix();
      if (!match) return null;

      setWakeActive(true);

      if (wakeTimeoutRef.current) {
        window.clearTimeout(wakeTimeoutRef.current);
      }
      wakeTimeoutRef.current = window.setTimeout(() => {
        setWakeActive(false);
      }, 8000);

      return match.remainder;
    }

    if (wakeTimeoutRef.current) {
      window.clearTimeout(wakeTimeoutRef.current);
    }
    wakeTimeoutRef.current = window.setTimeout(() => {
      setWakeActive(false);
    }, 8000);

    return cleaned;
  }

  const voice = useRealtimeVoice(handleTranscript, maybeHandleWakeWord);

  const startListening = async (): Promise<void> => {
    if (isListening) return;
    if (guardLocked()) return;

    try {
      await voice.start();
      setIsListening(true);
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? e.message : "Unable to start voice";
      toast.error(msg);
      stopListening();
    }
  };

  const stopListening = (): void => {
    try {
      voice.stop();
    } catch {
      // ignore
    }

    setIsListening(false);
    setWakeActive(false);

    if (wakeTimeoutRef.current) {
      window.clearTimeout(wakeTimeoutRef.current);
      wakeTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inFlightRef = useRef<Set<string>>(new Set());
  const isSubmittingAI = (secIdx: number, itemIdx: number): boolean => inFlightRef.current.has(`${secIdx}:${itemIdx}`);

  const submitAIForItem = async (secIdx: number, itemIdx: number): Promise<void> => {
    if (!session) return;

    if (isLocked) {
      toast.error("Inspection is locked; AI suggestions are disabled.");
      return;
    }

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
      name?: string | null;
    };

    const manualParts: { description: string; qty: number }[] = Array.isArray(itExt.parts) ? itExt.parts : [];

    const manualLaborHours = typeof itExt.laborHours === "number" ? itExt.laborHours : null;

    inFlightRef.current.add(key);

    let toastId: string | undefined;

    try {
      const desc = String(it.item ?? itExt.name ?? "Item");

      const id = uuidv4();
      const placeholder: QuoteLineItem = {
        id,
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
        value: (it as unknown as { value?: unknown }).value as string | number | null | undefined,
        photoUrls: (it as unknown as { photoUrls?: unknown }).photoUrls as string[] | undefined,
        aiState: "loading",
      };
      addQuoteLine(placeholder);

      toastId = toast.loading("Building estimate from inspection item…");

      const suggestion = await requestQuoteSuggestion({
        item: desc,
        notes: String(it.notes ?? ""),
        section: String(session.sections[secIdx]?.title ?? ""),
        status,
        vehicle: session.vehicle ?? undefined,
      });

      if (!suggestion) {
        updateQuoteLine(id, { aiState: "error" });
        toast.error("No AI suggestion available", { id: toastId });
        return;
      }

      const mergedParts: Array<{ name: string; qty: number; cost?: number }> = [
        ...((suggestion.parts ?? []) as Array<{ name: string; qty: number; cost?: number }>),
        ...manualParts.map((p) => ({ name: p.description, qty: p.qty })),
      ];

      const laborTime =
        manualLaborHours != null && !Number.isNaN(manualLaborHours) ? manualLaborHours : (suggestion.laborHours ?? 0.5);

      const laborRate = suggestion.laborRate ?? 0;

      const partsTotal =
        mergedParts.reduce((sum, p) => sum + (typeof p.cost === "number" ? p.cost : 0), 0) ?? 0;

      const price = Math.max(0, partsTotal + laborRate * laborTime);

      updateQuoteLine(id, {
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

      let createdJobId: string | null = null;

      if (workOrderId) {
        const created = await addWorkOrderLineFromSuggestion({
          workOrderId,
          description: desc,
          section: String(session.sections[secIdx]?.title ?? ""),
          status: status as "fail" | "recommend",
          suggestion: {
            ...suggestion,
            parts: mergedParts,
            laborHours: laborTime,
          },
          source: "inspection",
          jobType: "repair",
        });

        const createdId = (created as unknown as { id?: unknown })?.id;
        createdJobId = (createdId ? String(createdId) : null) || workOrderLineId || null;

        const cleanParts = manualParts
          .map((p) => ({
            description: String(p.description ?? "").trim(),
            qty: Number(p.qty ?? 0),
          }))
          .filter((p) => p.description.length > 0 && p.qty > 0);

        if (cleanParts.length > 0) {
          try {
            const res = await fetch("/api/parts/requests/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workOrderId,
                jobId: createdJobId,
                notes: String(it.notes ?? "") || null,
                items: cleanParts,
              }),
            });

            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as unknown;
              // eslint-disable-next-line no-console
              console.error("Parts request error", body);
              toast.error("Line added, but parts request failed", { id: toastId });
              return;
            }

            toast.success("Line + parts request created from inspection", { id: toastId });
          } catch (err: unknown) {
            // eslint-disable-next-line no-console
            console.error("Parts request failed", err);
            toast.error("Line added, but couldn't reach parts request service", { id: toastId });
          }
        } else {
          toast.success("Added to work order (no parts requested)", { id: toastId });
        }
      } else {
        toast.error("Missing work order id — saved locally only", { id: toastId });
      }
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error("Submit AI failed:", e);
      toast.error("Couldn't add to work order");
    } finally {
      inFlightRef.current.delete(key);
    }
  };

  useEffect(() => {
    if (!isEmbed) return;

    const root = rootRef.current;
    if (!root) return;

    const BAD = ["h-screen", "min-h-screen", "max-h-screen", "overflow-hidden", "fixed", "inset-0", "w-screen", "overscroll-contain", "touch-pan-y"];

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
    typeof session?.currentSectionIndex === "number" ? session.currentSectionIndex : 0;

  const safeSectionIndex =
    session && currentSectionIndex >= 0 && currentSectionIndex < session.sections.length ? currentSectionIndex : 0;

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

  function applyStatusToSection(sectionIndex: number, status: InspectionItemStatus): void {
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
  const handleAddAxleForSection = (sectionIndex: number, axleLabel: string): void => {
    if (!session) return;
    if (guardLocked()) return;

    const section = session.sections[sectionIndex];
    if (!section) return;

    const existingItems = section.items ?? [];

    const metrics: Array<{ label: string; unit: string | null }> = [
      { label: "Tire Pressure", unit: "psi" },
      { label: "Tread Depth (Outer)", unit: "mm" },
      { label: "Tread Depth (Inner)", unit: "mm" },
      { label: "Lining/Shoe", unit: "mm" },
      { label: "Drum/Rotor", unit: "mm" },
      { label: "Push Rod Travel", unit: "in" },
    ];

    const sides: Array<"Left" | "Right"> = ["Left", "Right"];

    const existingLabels = new Set(existingItems.map((it) => String(it.item ?? "").toLowerCase()));

    const nextItems = [...existingItems];

    for (const side of sides) {
      for (const m of metrics) {
        const label = `${axleLabel} ${side} ${m.label}`;
        const key = label.toLowerCase();
        if (existingLabels.has(key)) continue;

        nextItems.push({
          item: label,
          unit: m.unit,
          status: "na" as InspectionItemStatus,
        });
        existingLabels.add(key);
      }
    }

    updateSection(sectionIndex, { ...section, items: nextItems });
  };

  /** Add axle rows to a TIRE grid section (tires only) */
  const handleAddTireAxleForSection = (sectionIndex: number, axleLabel: string): void => {
    if (!session) return;
    if (guardLocked()) return;

    const section = session.sections[sectionIndex];
    if (!section) return;

    const existingItems = section.items ?? [];

    const metrics: Array<{ label: string; unit: string | null }> = [
      { label: "Tire Pressure", unit: "psi" },
      { label: "Tread Depth (Outer)", unit: "mm" },
      { label: "Tread Depth (Inner)", unit: "mm" },
      { label: "Wheel Torque", unit: "ft·lb" },
    ];

    const sides: Array<"Left" | "Right"> = ["Left", "Right"];

    const existingLabels = new Set(existingItems.map((it) => String(it.item ?? "").toLowerCase()));

    const nextItems = [...existingItems];

    for (const side of sides) {
      for (const m of metrics) {
        const label = `${axleLabel} ${side} ${m.label}`;
        const key = label.toLowerCase();
        if (existingLabels.has(key)) continue;

        nextItems.push({
          item: label,
          unit: m.unit,
          status: "na" as InspectionItemStatus,
        });
        existingLabels.add(key);
      }
    }

    updateSection(sectionIndex, { ...section, items: nextItems });
  };

  const handleSigned = (): void => {
    setIsLocked(true);
    try {
      localStorage.setItem(lockKey, "1");
    } catch {}
    toast.success("Inspection snapshot locked by signature.");
  };

  const shell = isEmbed ? "relative mx-auto max-w-[1100px] px-3 py-4 pb-36" : "relative mx-auto max-w-5xl px-3 md:px-4 py-6 pb-40";

  const cardBase =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/65 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  const headerCard = `${cardBase} px-3 py-3 md:px-6 md:py-5 mb-4 md:mb-6`;
  const sectionCard = `${cardBase} px-3 py-3 md:px-5 md:py-5 mb-4 md:mb-6`;

  const sectionTitle =
    "text-base md:text-xl font-semibold text-orange-300 text-center tracking-[0.16em] uppercase";

  const hint =
    "mt-1 block text-center text-[11px] uppercase tracking-[0.14em] text-neutral-400";

  // Bottom bar: ONLY Save progress + Finish inspection
  const actions = (
    <>
      <SaveInspectionButton session={session} workOrderLineId={workOrderLineId} />

      {workOrderLineId && <FinishInspectionButton session={session} workOrderLineId={workOrderLineId} />}
    </>
  );

  if (!session || (session.sections?.length ?? 0) === 0) {
    return <div className="p-4 text-sm text-neutral-300">Loading inspection…</div>;
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

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      />

      <div className="relative space-y-4">
        <div className={headerCard}>
          <div className="mb-3 border-b border-orange-500/40 pb-3 text-center">
            <div className="text-[11px] font-blackops uppercase tracking-[0.22em] text-neutral-400">
              Inspection
            </div>
            <div className="mt-1 text-lg md:text-xl font-blackops text-neutral-50">
              {session?.templateitem || templateName || "Inspection"}
            </div>
          </div>

          <CustomerVehicleHeader
            templateName=""
            customer={toHeaderCustomer(session.customer ?? null)}
            vehicle={toHeaderVehicle(session.vehicle ?? null)}
          />
        </div>

        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {!isLocked && (
            <StartListeningButton isListening={isListening} setIsListening={setIsListening} onStart={startListening} />
          )}

          {!isLocked && (
            <PauseResumeButton
              isPaused={isPaused}
              isListening={isListening}
              setIsListening={setIsListening}
              onPause={(): void => {
                setIsPaused(true);
                pauseSession();
                stopListening();
              }}
              onResume={(): void => {
                setIsPaused(false);
                resumeSession();
                void startListening();
              }}
              recognitionInstance={null}
              onTranscript={handleTranscript}
              setRecognitionRef={(): void => {
                /* noop – using OpenAI now */
              }}
            />
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full justify-center border-orange-500/70 bg-black/60 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-400 hover:bg-black/80"
            onClick={(): void => setUnit(unit === "metric" ? "imperial" : "metric")}
          >
            Unit: {unit === "metric" ? "Metric (mm / kPa)" : "Imperial (in / psi)"}
          </Button>
        </div>

        <div className="mb-4 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-3 py-2.5 md:px-4 md:py-3 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          <ProgressTracker
            currentItem={session.currentItemIndex}
            currentSection={session.currentSectionIndex}
            totalSections={session.sections.length}
            totalItems={session.sections[session.currentSectionIndex]?.items.length || 0}
          />
        </div>

        <InspectionFormCtx.Provider value={{ updateItem }}>
          {session.sections.map((section, sectionIndex) => {
            const itemsWithHints = (section.items ?? []).map((it) => {
              const stRaw = String(it.status ?? "").toLowerCase();
              const safeStatus: InspectionItemStatus =
                stRaw === "ok" || stRaw === "fail" || stRaw === "na" || stRaw === "recommend"
                  ? (stRaw as InspectionItemStatus)
                  : "na";

              const label = String(it.item ?? "");
              const explicitUnit = it.unit ?? null;

              const toggleControlled = /tread|pad|lining|shoe|rotor|drum|push rod/i.test(label);

              return {
                ...it, // ✅ KEEP ORIGINAL SHAPE
                value: it.value ?? "", // ✅ CRITICAL: preserve controlled input value
                status: safeStatus,
                notes: String(it.notes ?? it.note ?? ""),
                unit: toggleControlled ? unitHintGeneric(label, unit) : explicitUnit || unitHintGeneric(label, unit),
              };
            });

            const batterySection = isBatterySection(section.title, itemsWithHints);
            const tireSection = isTireGridSection(section.title, itemsWithHints);
            const airSection = !tireSection && isAirCornerSection(section.title, itemsWithHints);
            const hydCornerSection = isHydraulicCornerSection(section.title, itemsWithHints);

            const useGrid = batterySection || airSection || tireSection || hydCornerSection;

            const collapsed = collapsedSections[sectionIndex] ?? false;

            const newLabel = newItemLabels[sectionIndex] ?? "";
            const newUnit = newItemUnits[sectionIndex] ?? "";

            return (
              <div
                key={`${section.title}-${sectionIndex}`}
                className={sectionCard}
                data-section-index={sectionIndex}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={sectionTitle}>{section.title}</h2>

                  {safeSectionIndex === sectionIndex && (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={isLocked}
                        className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => applyStatusToSection(sectionIndex, "ok")}
                      >
                        All OK
                      </button>
                      <button
                        type="button"
                        disabled={isLocked}
                        className="rounded-full border border-red-500/60 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => applyStatusToSection(sectionIndex, "fail")}
                      >
                        All Fail
                      </button>
                      <button
                        type="button"
                        disabled={isLocked}
                        className="rounded-full border border-zinc-500/60 bg-zinc-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-200 hover:bg-zinc-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => applyStatusToSection(sectionIndex, "na")}
                      >
                        All NA
                      </button>
                      <button
                        type="button"
                        disabled={isLocked}
                        className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => applyStatusToSection(sectionIndex, "recommend")}
                      >
                        All REC
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-neutral-500/60 bg-neutral-800/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-700"
                        onClick={() => toggleSectionCollapsed(sectionIndex)}
                      >
                        {collapsed ? "Expand" : "Collapse"}
                      </button>
                    </div>
                  )}

                  {safeSectionIndex !== sectionIndex && (
                    <button
                      type="button"
                      className="rounded-full border border-neutral-600/70 bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-800"
                      onClick={() => toggleSectionCollapsed(sectionIndex)}
                    >
                      {collapsed ? "Expand" : "Collapse"}
                    </button>
                  )}
                </div>

                {collapsed ? (
                  <p className="mt-2 text-center text-[11px] text-neutral-400">
                    Section collapsed. Tap <span className="font-semibold">Expand</span> to reopen.
                  </p>
                ) : (
                  <>
                    {useGrid && (
                      <span className={hint}>
                        {unit === "metric" ? "Enter mm / kPa / N·m" : "Enter in / psi / ft·lb"}
                      </span>
                    )}

                    <div className="mt-3 md:mt-4">
                      {useGrid ? (
                        batterySection ? (
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
                            onAddAxle={(axleLabel: string) => handleAddAxleForSection(sectionIndex, axleLabel)}
                            onSpecHint={(metricLabel: string) =>
                              _props.onSpecHint?.({
                                source: "air_corner",
                                label: metricLabel,
                                meta: { sectionTitle: section.title },
                              })
                            }
                          />
                        ) : tireSection ? (
                          gridParam === "hyd" ? (
                            <TireGridHydraulic
                              sectionIndex={sectionIndex}
                              items={itemsWithHints}
                              unitHint={(label: string) => unitHintGeneric(label, unit)}
                              requireNoteForAI
                              onSubmitAI={(secIdx: number, itemIdx: number) => {
                                void submitAIForItem(secIdx, itemIdx);
                              }}
                              isSubmittingAI={(secIdx: number, itemIdx: number) => isSubmittingAI(secIdx, itemIdx)}
                              onUpdateParts={(secIdx, itemIdx, parts) => {
                                if (guardLocked()) return;
                                updateItem(secIdx, itemIdx, { parts });
                              }}
                              onUpdateLaborHours={(secIdx, itemIdx, hours) => {
                                if (guardLocked()) return;
                                updateItem(secIdx, itemIdx, { laborHours: hours });
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
                                _props.onSpecHint?.({
                                  source: "tire",
                                  label: metricLabel,
                                  meta: { sectionTitle: section.title },
                                })
                              }
                              requireNoteForAI
                              onSubmitAI={(secIdx: number, itemIdx: number) => {
                                void submitAIForItem(secIdx, itemIdx);
                              }}
                              isSubmittingAI={(secIdx: number, itemIdx: number) => isSubmittingAI(secIdx, itemIdx)}
                              onUpdateParts={(secIdx, itemIdx, parts) => {
                                if (guardLocked()) return;
                                updateItem(secIdx, itemIdx, { parts });
                              }}
                              onUpdateLaborHours={(secIdx, itemIdx, hours) => {
                                if (guardLocked()) return;
                                updateItem(secIdx, itemIdx, { laborHours: hours });
                              }}
                            />
                          )
                        ) : (
                          <CornerGrid
                            sectionIndex={sectionIndex}
                            items={itemsWithHints}
                            unitHint={(label: string) => unitHintGeneric(label, unit)}
                            onSpecHint={(label: string) =>
                              _props.onSpecHint?.({
                                source: "corner",
                                label,
                                meta: { sectionTitle: section.title },
                              })
                            }
                          />
                        )
                      ) : (
                        <>
                          <SectionDisplay
                            title=""
                            section={{ ...section, items: itemsWithHints }}
                            sectionIndex={sectionIndex}
                            showNotes
                            showPhotos
                            onUpdateStatus={(secIdx: number, itemIdx: number, statusValue: InspectionItemStatus) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, { status: statusValue });
                              autoAdvanceFrom(secIdx, itemIdx);
                            }}
                            onUpdateNote={(secIdx: number, itemIdx: number, noteText: string) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, { notes: noteText });
                            }}
                            onUpload={(photoUrl: string, secIdx: number, itemIdx: number) => {
                              if (guardLocked()) return;
                              const prev = session.sections[secIdx].items[itemIdx].photoUrls ?? [];
                              updateItem(secIdx, itemIdx, { photoUrls: [...prev, photoUrl] });
                            }}
                            onUpdateParts={(secIdx: number, itemIdx: number, parts: { description: string; qty: number }[]) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, { parts });
                            }}
                            onUpdateLaborHours={(secIdx: number, itemIdx: number, hours: number | null) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, { laborHours: hours });
                            }}
                            requireNoteForAI
                            onSubmitAI={(secIdx: number, itemIdx: number) => {
                              void submitAIForItem(secIdx, itemIdx);
                            }}
                            isSubmittingAI={isSubmittingAI}
                          />

                          <div className="mt-4 border-t border-white/10 pt-3">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                              Add custom item
                            </div>
                            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                              <input
                                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
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
                                  className="rounded-lg border border-neutral-700 bg-neutral-900/80 px-2 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
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
            role="customer"
            defaultName={[customer.first_name, customer.last_name].filter(Boolean).join(" ") || undefined}
            onSigned={handleSigned}
          />
        </div>

        {!isEmbed && (
          <div className="mt-4 md:mt-6 border-t border-white/5 pt-4">
            <div className="text-xs text-neutral-400 md:text-right">
              <span className="font-semibold text-neutral-200">Legend:</span> P = Pass &nbsp;•&nbsp; F = Fail &nbsp;•&nbsp; NA = Not applicable
            </div>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/92 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Draft auto-saves locally</div>
        </div>
      </div>

      {showMissingLineWarning && (
        <div className="fixed inset-x-0 bottom-[52px] z-50 px-3">
          <div className="mx-auto max-w-[1100px] rounded-xl border border-red-500/40 bg-black/80 px-3 py-2 text-xs text-red-200 shadow-[0_18px_45px_rgba(0,0,0,0.9)]">
            Missing <code>workOrderLineId</code> — save/finish will be blocked.
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
      description="Run guided inspections, capture notes, and push items into work orders."
    >
      {body}
    </PageShell>
  );
}