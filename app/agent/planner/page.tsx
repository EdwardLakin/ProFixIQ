"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";
import { WorkOrderPreviewTrigger } from "app/work-orders/components/WorkOrderPreviewTrigger";
import { WorkOrderPreview } from "app/work-orders/components/WorkOrderPreview";
import VinCaptureModal from "app/vehicle/VinCaptureModal";

type OcrFields = {
  vin?: string | null;
  plate?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type PlannerKind = "simple" | "openai" | "ops" | "fleet" | "approvals";

type PlannerStartOut = {
  runId: string;
  alreadyExists: boolean;
  error?: string;
};

type PlannerEvent = Record<string, unknown> & { kind?: string };

type AnyObj = Record<string, unknown>;

function isObj(v: unknown): v is AnyObj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function getField(obj: unknown, key: string): unknown {
  return isObj(obj) ? obj[key] : undefined;
}

function getNested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) cur = getField(cur, p);
  return cur;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function toMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (isObj(e)) {
    const m = asString(e.message);
    if (m) return m;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

function extractToolName(evt: PlannerEvent): string | null {
  return (
    asString(getField(evt, "name")) ??
    asString(getField(evt, "tool_name")) ??
    asString(getField(evt, "toolName")) ??
    asString(getNested(evt, ["tool", "name"])) ??
    asString(getNested(evt, ["call", "name"]))
  );
}

function extractWorkOrderId(evt: PlannerEvent): string | null {
  const direct =
    asString(getField(evt, "work_order_id")) ??
    asString(getField(evt, "workOrderId")) ??
    asString(getField(evt, "wo_id")) ??
    asString(getField(evt, "entityId")) ??
    asString(getField(evt, "id"));

  if (direct) return direct;

  const output = getField(evt, "output");
  if (isObj(output)) {
    const nested =
      asString(output.workOrderId) ??
      asString(output.work_order_id) ??
      asString(output.id);
    if (nested) return nested;
  }

  const result = getField(evt, "result");
  if (isObj(result)) {
    const nested =
      asString(result.workOrderId) ??
      asString(result.work_order_id) ??
      asString(result.id);
    if (nested) return nested;
  }

  return null;
}

function extractNotifications(evt: PlannerEvent): Array<{
  level?: string;
  title?: string;
  message?: string;
  href?: string;
}> {
  const items = getField(evt, "items");
  if (!Array.isArray(items)) return [];

  const out: Array<{
    level?: string;
    title?: string;
    message?: string;
    href?: string;
  }> = [];

  for (const item of items) {
    if (!isObj(item)) continue;

    out.push({
      level: asString(item.level) ?? undefined,
      title: asString(item.title) ?? undefined,
      message: asString(item.message) ?? undefined,
      href: asString(item.href) ?? undefined,
    });
  }

  return out;
}

function labelFor(evt: PlannerEvent): string | null {
  const kind = (evt.kind ?? "").toString();
  const toolName = extractToolName(evt);
  const woId = extractWorkOrderId(evt);

  const text =
    asString(getField(evt, "text")) ??
    asString(getField(evt, "message")) ??
    asString(getField(evt, "error"));

  switch (kind) {
    case "plan":
      return text ? `Plan: ${text}` : "Planning…";

    case "tool_call":
      return `Tool call: ${toolName ?? "unknown"}`;

    case "tool_result":
      if (woId && toolName === "create_work_order") {
        return `Created work order (${woId.slice(0, 8)})`;
      }
      return `Tool result: ${toolName ?? "unknown"}`;

    case "wo.created":
    case "work_order.created":
      return `Created work order${woId ? ` (${woId.slice(0, 8)})` : ""}`;

    case "wo.line.created":
    case "work_order_line.created": {
      const desc = asString(getField(evt, "description"));
      return `Added job line${desc ? ` — ${desc.slice(0, 80)}` : ""}`;
    }

    case "notifications": {
      const items = extractNotifications(evt);
      if (items.length === 0) return "New alerts";
      return items
        .slice(0, 2)
        .map((item) => item.title ?? item.message ?? "Alert")
        .join(" • ");
    }

    case "final":
      return text ? `Final: ${text}` : "Final";

    default:
      return kind ? kind.replaceAll("_", " ") : null;
  }
}

export default function PlannerPage() {
  const [goal, setGoal] = useState("");
  const [planner, setPlanner] = useState<PlannerKind>("ops");

  const [allowCreate, setAllowCreate] = useState(false);

  const [customerQuery, setCustomerQuery] = useState("");
  const [plateOrVin, setPlateOrVin] = useState("");
  const [emailInvoiceTo, setEmailInvoiceTo] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [steps, setSteps] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<
    Array<{
      level?: string;
      title?: string;
      message?: string;
      href?: string;
    }>
  >([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const autoRanRef = useRef(false);

  const [previewWoId, setPreviewWoId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [vinOpen, setVinOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const supabase = createClientComponentClient<Database>();
  const draft = useWorkOrderDraft();
  const setVehicleDraft = useWorkOrderDraft((s) => s.setVehicle);
  const setCustomerDraft = useWorkOrderDraft((s) => s.setCustomer);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data.user?.id ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [photoPreview]);

  useEffect(() => {
    const v = (draft?.vehicle?.vin ?? "").trim();
    if (v && !plateOrVin) setPlateOrVin(v);

    const em = (draft?.customer?.email ?? "").trim();
    if (em && !emailInvoiceTo) setEmailInvoiceTo(em);
  }, [draft, emailInvoiceTo, plateOrVin]);

  useEffect(() => {
    const plannerParam = searchParams.get("planner");
    const goalParam = searchParams.get("goal");
    const customerParam = searchParams.get("customerQuery");
    const customerIdParam = searchParams.get("customerId");
    const vehicleIdParam = searchParams.get("vehicleId");
    const plateParam = searchParams.get("plateOrVin");
    const emailParam = searchParams.get("emailInvoiceTo");
    const bookingParam = searchParams.get("bookingId");
    const workOrderParam = searchParams.get("workOrderId");
    const allowCreateParam = searchParams.get("allowCreate");

    if (
      plannerParam === "ops" ||
      plannerParam === "openai" ||
      plannerParam === "simple" ||
      plannerParam === "fleet" ||
      plannerParam === "approvals"
    ) {
      setPlanner(plannerParam);
    }

    if (goalParam) setGoal(goalParam);
    if (customerParam) setCustomerQuery(customerParam);
    if (!customerParam && customerIdParam) setCustomerQuery(customerIdParam);
    if (plateParam) setPlateOrVin(plateParam);
    if (!plateParam && vehicleIdParam) setPlateOrVin(vehicleIdParam);
    if (emailParam) setEmailInvoiceTo(emailParam);
    if (bookingParam) setBookingId(bookingParam);
    if (workOrderParam) setWorkOrderId(workOrderParam);
    if (allowCreateParam === "1") setAllowCreate(true);
    if (allowCreateParam === "0") setAllowCreate(false);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromContext() {
      const customerIdParam = searchParams.get("customerId");
      const vehicleIdParam = searchParams.get("vehicleId");
      const workOrderIdParam = searchParams.get("workOrderId");

      let resolvedCustomerId = customerIdParam;
      let resolvedVehicleId = vehicleIdParam;

      if (workOrderIdParam) {
        const { data: wo } = await supabase
          .from("work_orders")
          .select("id, customer_id, vehicle_id")
          .eq("id", workOrderIdParam)
          .maybeSingle();

        if (cancelled) return;

        if (wo?.customer_id && !resolvedCustomerId) {
          resolvedCustomerId = wo.customer_id;
        }
        if (wo?.vehicle_id && !resolvedVehicleId) {
          resolvedVehicleId = wo.vehicle_id;
        }
      }

      if (resolvedCustomerId) {
        const { data: customer } = await supabase
          .from("customers")
          .select("id, first_name, last_name, business_name, email")
          .eq("id", resolvedCustomerId)
          .maybeSingle();

        if (cancelled) return;

        const businessName =
          typeof customer?.business_name === "string"
            ? customer.business_name.trim()
            : "";
        const fullName = [customer?.first_name ?? "", customer?.last_name ?? ""]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter(Boolean)
          .join(" ");

        const displayName = businessName || fullName;

        if (displayName && !customerQuery.trim()) {
          setCustomerQuery(displayName);
        }

        if (
          typeof customer?.email === "string" &&
          customer.email.trim() &&
          !emailInvoiceTo.trim()
        ) {
          setEmailInvoiceTo(customer.email.trim());
        }

        setCustomerDraft({
          first_name:
            typeof customer?.first_name === "string"
              ? customer.first_name
              : undefined,
          last_name:
            typeof customer?.last_name === "string"
              ? customer.last_name
              : undefined,
          email:
            typeof customer?.email === "string" ? customer.email : undefined,
          phone: undefined,
        });
      }

      if (resolvedVehicleId) {
        const { data: vehicle } = await supabase
          .from("vehicles")
          .select("id, vin, license_plate, year, make, model, trim, engine")
          .eq("id", resolvedVehicleId)
          .maybeSingle();

        if (cancelled) return;

        const preferred =
          typeof vehicle?.vin === "string" && vehicle.vin.trim()
            ? vehicle.vin.trim()
            : typeof vehicle?.license_plate === "string" &&
                vehicle.license_plate.trim()
              ? vehicle.license_plate.trim()
              : "";

        if (preferred && !plateOrVin.trim()) {
          setPlateOrVin(preferred);
        }

        setVehicleDraft({
          vin: typeof vehicle?.vin === "string" ? vehicle.vin : undefined,
          plate:
            typeof vehicle?.license_plate === "string"
              ? vehicle.license_plate
              : undefined,
          year: typeof vehicle?.year === "string" ? vehicle.year : undefined,
          make: typeof vehicle?.make === "string" ? vehicle.make : undefined,
          model: typeof vehicle?.model === "string" ? vehicle.model : undefined,
          trim: typeof vehicle?.trim === "string" ? vehicle.trim : undefined,
          engine:
            typeof vehicle?.engine === "string" ? vehicle.engine : undefined,
        });
      }
    }

    void hydrateFromContext();

    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    searchParams,
    customerQuery,
    emailInvoiceTo,
    plateOrVin,
    setCustomerDraft,
    setVehicleDraft,
  ]);

  function onPickPhoto(file: File | null) {
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function uploadPhotoIfAny(): Promise<string | undefined> {
    if (!photo) return undefined;

    const path = `agent-uploads/${crypto
      .randomUUID()
      .replace(/-/g, "")}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const up = await supabase.storage.from("agent-uploads").upload(path, photo, {
      cacheControl: "3600",
      upsert: false,
    });

    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

    const pub = supabase.storage.from("agent-uploads").getPublicUrl(path);
    if (!pub.data?.publicUrl) throw new Error("Could not resolve public URL");

    return pub.data.publicUrl;
  }

  function clearAll() {
    setGoal("");
    setCustomerQuery("");
    setPlateOrVin("");
    setEmailInvoiceTo("");
    setBookingId("");
    setWorkOrderId("");
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    setSteps([]);
    setSummary(null);
    setNotifications([]);
    setRunId(null);
    setPreviewWoId(null);
    setPreviewOpen(false);
    esRef.current?.close();
    esRef.current = null;
    setRunning(false);
    autoRanRef.current = false;
  }

  function appendStep(step: string) {
    setSteps((arr) => (arr.includes(step) ? arr : [...arr, step]));
  }

  async function start() {
    setRunning(true);
    setSteps([]);
    setSummary(null);
    setNotifications([]);
    esRef.current?.close();
    esRef.current = null;

    try {
      if (!allowCreate) {
        const hasCustomer =
          customerQuery.trim().length > 0 || Boolean(workOrderId.trim());
        const hasPlateVin =
          plateOrVin.trim().length > 0 ||
          (draft?.vehicle?.vin ?? "").trim().length > 0 ||
          Boolean(workOrderId.trim()) ||
          Boolean(bookingId.trim());

        if (!hasCustomer && !hasPlateVin && !goal.trim()) {
          appendStep("Missing enough context to run in Existing DB mode.");
          setRunning(false);
          return;
        }
      }

      const imageUrl = await uploadPhotoIfAny();

      if (imageUrl && photoPreview) URL.revokeObjectURL(photoPreview);
      if (imageUrl) {
        setPhoto(null);
        setPhotoPreview(null);
      }

      let ocrFields: OcrFields | null = null;

      if (imageUrl) {
        appendStep("Uploading photo…");

        try {
          const res = await fetch("/api/ocr/registration", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ imageUrl }),
          });

          if (res.ok) {
            const j = (await res.json()) as { fields?: OcrFields | null };
            const f = j?.fields || {};

            setVehicleDraft({
              vin: f.vin ?? undefined,
              plate: f.plate ?? undefined,
              year: f.year ?? undefined,
              make: f.make ?? undefined,
              model: f.model ?? undefined,
              trim: f.trim ?? undefined,
              engine: f.engine ?? undefined,
            });

            setCustomerDraft({
              first_name: f.first_name ?? undefined,
              last_name: f.last_name ?? undefined,
              phone: f.phone ?? undefined,
              email: f.email ?? undefined,
            });

            if (!plateOrVin && (f.vin || f.plate)) {
              setPlateOrVin(f.vin || f.plate || "");
            }

            if (!emailInvoiceTo && f.email) {
              setEmailInvoiceTo(f.email || "");
            }

            const quickBits = [
              f.vin ? `VIN ${String(f.vin).slice(0, 8)}…` : null,
              f.plate ? `Plate ${f.plate}` : null,
              f.email ? `Email ${f.email}` : null,
            ]
              .filter(Boolean)
              .join(" • ");

            appendStep(`OCR parsed: ${quickBits || "basic details"}`);
            ocrFields = f;
          } else {
            appendStep(`OCR failed (HTTP ${res.status})`);
          }
        } catch (err: unknown) {
          appendStep(`OCR error: ${toMsg(err)}`);
        }
      }

      const vinFromDraft = (draft?.vehicle?.vin ?? "").trim() || undefined;

      const decodedVehicle =
        draft?.vehicle &&
        (draft.vehicle.year ||
          draft.vehicle.make ||
          draft.vehicle.model ||
          draft.vehicle.trim ||
          draft.vehicle.engine)
          ? {
              year: draft.vehicle.year ?? null,
              make: draft.vehicle.make ?? null,
              model: draft.vehicle.model ?? null,
              trim: draft.vehicle.trim ?? null,
              engine: draft.vehicle.engine ?? null,
            }
          : undefined;

      const customerIdParam = searchParams.get("customerId") ?? undefined;
      const vehicleIdParam = searchParams.get("vehicleId") ?? undefined;

      const ctx = {
        allowCreate,

        customerQuery: customerQuery || undefined,
        customerId: customerIdParam,
        vehicleId: vehicleIdParam,
        plateOrVin: plateOrVin || vinFromDraft || undefined,
        emailInvoiceTo: emailInvoiceTo || undefined,
        bookingId: bookingId || undefined,
        workOrderId: workOrderId || undefined,

        imageUrl,
        vin:
          vinFromDraft || (plateOrVin?.length === 17 ? plateOrVin : undefined),
        decodedVehicle,
        ocr: ocrFields || undefined,

        lineDescription: goal.trim() || undefined,
        jobType: "repair" as const,
        laborHours: 1,
        plannerKind: planner,
      } satisfies Record<string, unknown>;

      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal,
          planner,
          context: ctx,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const out = (await res.json().catch(() => ({}))) as PlannerStartOut;

      if (!res.ok) {
        throw new Error(out.error ?? `HTTP ${res.status}`);
      }

      setRunId(out.runId);
      appendStep(out.alreadyExists ? "Resumed previous run…" : "Started plan…");

      const url = `/api/planner/events?runId=${encodeURIComponent(out.runId)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (ev) => {
        if (!ev.data || ev.data === ":ok" || ev.data === "[DONE]") return;

        try {
          const data = JSON.parse(ev.data) as PlannerEvent;
          const label = labelFor(data);
          if (label) appendStep(label);

          const maybeId = extractWorkOrderId(data);
          const tool = extractToolName(data);

          if (
            (data.kind === "wo.created" ||
              data.kind === "work_order.created" ||
              (data.kind === "tool_result" && tool === "create_work_order")) &&
            typeof maybeId === "string"
          ) {
            setPreviewWoId(maybeId);
            setPreviewOpen(true);
          }

          if (data.kind === "final") {
            const text =
              asString(getField(data, "text")) ??
              asString(getField(data, "message"));
            if (text) setSummary(text);
          }

          if (data.kind === "notifications") {
            const items = extractNotifications(data);
            if (items.length > 0) {
              setNotifications((prev) => [...prev, ...items]);
            }
          }

          if (data.kind === "final") {
            es.close();
            esRef.current = null;
            setRunning(false);
          }
        } catch {
          appendStep(ev.data);
        }
      };

      es.onerror = () => {
        if (esRef.current) {
          appendStep("Stream ended");
          es.close();
          esRef.current = null;
          setRunning(false);
        }
      };
    } catch (e: unknown) {
      appendStep(`Error: ${toMsg(e)}`);
      setRunning(false);
    }
  }

  useEffect(() => {
    const shouldAutorun = searchParams.get("autorun") === "1";
    if (!shouldAutorun || autoRanRef.current || running) return;

    const hasEnough =
      goal.trim() ||
      customerQuery.trim() ||
      plateOrVin.trim() ||
      workOrderId.trim() ||
      bookingId.trim();

    if (!hasEnough) return;

    autoRanRef.current = true;
    void start();
  }, [
    searchParams,
    running,
    goal,
    customerQuery,
    plateOrVin,
    workOrderId,
    bookingId,
  ]);

  const plannerModes: { id: PlannerKind; label: string }[] = [
    { id: "ops", label: "Ops Assistant" },
    { id: "openai", label: "OpenAI (rich)" },
    { id: "simple", label: "Simple (rules)" },
    { id: "fleet", label: "Fleet PM" },
    { id: "approvals", label: "Advisor approvals" },
  ];

  return (
    <PageShell
      title="AI Planner"
      description="Ask operational questions, create work orders, move bookings, summarize history, and surface shop alerts."
    >
      <div className="metal-card rounded-3xl p-5 shadow-[0_12px_35px_rgba(0,0,0,0.85)]">
        <div className="flex flex-wrap gap-2">
          {plannerModes.map((m) => (
            <Button
              key={m.id}
              variant={planner === m.id ? "outline" : "ghost"}
              size="sm"
              className={
                planner === m.id
                  ? "ring-2 ring-orange-400/60 bg-orange-500/10"
                  : "opacity-80 hover:opacity-100"
              }
              onClick={() => setPlanner(m.id)}
              type="button"
            >
              {m.label}
            </Button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 p-3 shadow-[0_10px_26px_rgba(0,0,0,0.55)]">
          <div className="min-w-[220px]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Data mode
            </div>
            <div className="mt-1 text-sm text-neutral-100">
              {allowCreate
                ? "Setup mode (allow auto-create)"
                : "Existing DB mode (no auto-create)"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={allowCreate ? "ghost" : "outline"}
              className={
                allowCreate
                  ? "opacity-80 hover:opacity-100"
                  : "ring-2 ring-orange-400/60 bg-orange-500/10"
              }
              onClick={() => setAllowCreate(false)}
              disabled={running}
            >
              Existing DB
            </Button>
            <Button
              type="button"
              size="sm"
              variant={allowCreate ? "outline" : "ghost"}
              className={
                allowCreate
                  ? "ring-2 ring-orange-400/60 bg-orange-500/10"
                  : "opacity-80 hover:opacity-100"
              }
              onClick={() => setAllowCreate(true)}
              disabled={running}
            >
              Setup
            </Button>
          </div>

          {!allowCreate ? (
            <div className="w-full text-xs text-neutral-400">
              Existing DB mode is best for history lookups, bookings, status
              questions, and live shop summaries.
            </div>
          ) : null}
        </div>

        <div className="mt-3 rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 p-4 shadow-[0_10px_26px_rgba(0,0,0,0.55)]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            What to do here
          </div>
          <div className="mt-2 text-sm leading-7 text-neutral-200">
            Type the result you want, not the steps. Examples: “Resolve this hold job line”, “Show me what this customer approved last visit”, or “Create a work order for this vehicle”.
          </div>
        </div>

        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder='e.g. "When was the last time John Smith visited?" or "What is Mike working on?" or "Reschedule booking 123 to tomorrow at 10am"'
          className="mt-3 min-h-[120px] w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/60 p-3 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-[0_10px_26px_rgba(0,0,0,0.6)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
        />

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Customer
            </div>
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-[0_10px_26px_rgba(0,0,0,0.6)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
              placeholder="e.g. John Smith"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Plate / VIN
            </div>
            <div className="flex gap-2">
              <input
                value={plateOrVin}
                onChange={(e) => setPlateOrVin(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-[0_10px_26px_rgba(0,0,0,0.6)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                placeholder="e.g. 8ABC123 or 1FT…"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVinOpen(true)}
                disabled={!userId}
              >
                Scan VIN
              </Button>
            </div>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Email invoice to
            </div>
            <input
              value={emailInvoiceTo}
              onChange={(e) => setEmailInvoiceTo(e.target.value)}
              className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-[0_10px_26px_rgba(0,0,0,0.6)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
              placeholder="customer@example.com"
              type="email"
              inputMode="email"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Booking ID / Work Order ID
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-[0_10px_26px_rgba(0,0,0,0.6)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                placeholder="Booking ID"
              />
              <input
                value={workOrderId}
                onChange={(e) => setWorkOrderId(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-[0_10px_26px_rgba(0,0,0,0.6)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                placeholder="Work Order ID"
              />
            </div>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Photo (DL / Registration)
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-100 file:mr-4 file:rounded-xl file:border file:border-[color:var(--metal-border-soft)] file:bg-black/40 file:px-3 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.18em] file:text-neutral-100 hover:file:bg-black/60"
            />
            {photoPreview ? (
              <div className="relative mt-2 h-40 w-full overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft)]">
                <Image
                  src={photoPreview}
                  alt="Preview"
                  fill
                  unoptimized
                  className="object-contain"
                />
              </div>
            ) : null}
          </label>
        </div>

        {runId ? (
          <div className="mt-4 text-xs text-neutral-400">
            Run ID:{" "}
            <code className="rounded bg-black/40 px-2 py-1 text-[11px] text-neutral-200">
              {runId}
            </code>
          </div>
        ) : null}

        {summary ? (
          <div className="mt-4 rounded-3xl border border-orange-400/20 bg-orange-500/10 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.75)]">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
              Summary
            </div>
            <div className="text-sm text-neutral-100">{summary}</div>
          </div>
        ) : null}

        {notifications.length > 0 ? (
          <div className="mt-4 rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/60 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.75)]">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Alerts
            </div>
            <div className="space-y-2">
              {notifications.map((item, index) => (
                <div
                  key={`${item.title ?? "alert"}-${index}`}
                  className="rounded-2xl border border-white/10 bg-black/40 p-3"
                >
                  <div className="text-sm font-semibold text-white">
                    {item.title ?? "Alert"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-300">
                    {item.message ?? ""}
                  </div>
                  {item.href ? (
                    <div className="mt-2 text-xs text-orange-300">
                      {item.href}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/60 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.75)]">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Stream
          </div>
          {steps.length === 0 ? (
            <div className="text-sm text-neutral-400">Waiting for updates…</div>
          ) : (
            <ul className="space-y-2">
              {steps.map((s, i) => (
                <li key={`${i}-${s}`} className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-400/80" />
                  <span className="text-sm text-neutral-100">{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <Button
            onClick={start}
            variant="outline"
            size="md"
            isLoading={running}
            disabled={
              running ||
              (!goal.trim() &&
                !customerQuery.trim() &&
                !plateOrVin.trim() &&
                !workOrderId.trim() &&
                !bookingId.trim())
            }
            className="min-w-[140px]"
          >
            Run Assistant
          </Button>

          <Button
            onClick={clearAll}
            variant="ghost"
            size="md"
            disabled={running}
            className="min-w-[140px]"
          >
            Clear
          </Button>
        </div>
      </div>

      {previewWoId ? (
        <div className="mt-6">
          <WorkOrderPreviewTrigger
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          >
            <WorkOrderPreview woId={previewWoId} />
          </WorkOrderPreviewTrigger>
        </div>
      ) : null}

      {userId ? (
        <VinCaptureModal
          userId={userId}
          open={vinOpen}
          onOpenChange={(open: boolean) => setVinOpen(open)}
          onDecoded={(d) => {
            setVehicleDraft({
              vin: d.vin,
              year: d.year ?? null,
              make: d.make ?? null,
              model: d.model ?? null,
              trim: d.trim ?? null,
              engine: d.engine ?? null,
            });
            setPlateOrVin(d.vin);
            setToast("VIN decoded and recalls queued ✅");
            window.setTimeout(() => setToast(null), 4000);

            setCustomerDraft({
              first_name: undefined,
              last_name: undefined,
              email: emailInvoiceTo || undefined,
              phone: undefined,
            });

            router.push("/work-orders/create?source=ai");
          }}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/80 px-4 py-2 shadow-[0_16px_50px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 text-sm text-neutral-100">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
            {toast}
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
