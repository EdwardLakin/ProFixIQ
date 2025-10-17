// app/agent/planner/page.tsx (or your current path)
// "use client" page component

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useRouter } from "next/navigation";

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

type PlannerKind = "simple" | "openai";
type AgentStartOut = { runId: string; alreadyExists: boolean };

type AgentEvent = Record<string, unknown> & { kind?: string };

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function extractWorkOrderId(evt: AgentEvent): string | null {
  return (
    asString(evt.work_order_id) ??
    asString(evt.workOrderId) ??
    asString(evt.wo_id) ??
    asString(evt.id)
  );
}
function toMsg(e: unknown): string {
  if (typeof e === "string") return e;

  // type guard for objects that have a string "message" property
  if (
    e !== null &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }

  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

/** Friendly labels for common event kinds */
function labelFor(evt: AgentEvent): string | null {
  const k = (evt.kind ?? "").toString();
  const woId = extractWorkOrderId(evt);
  switch (k) {
    case "run.started":
      return "Started plan";
    case "run.resumed":
      return "Resumed previous run";
    case "vin.decoded":
      return `Decoded VIN${evt.vin ? ` ${evt.vin}` : ""}`;
    case "customer.matched":
      return `Matched customer${evt.customer_name ? ` ${evt.customer_name}` : ""}`;
    case "vehicle.attached":
      return "Attached vehicle to work order";
    case "wo.created":
    case "work_order.created":
      return `Created work order${woId ? ` (${woId.slice(0, 8)})` : ""}`;
    case "wo.line.created":
    case "work_order_line.created":
      return `Added job line${evt.description ? ` — ${String(evt.description).slice(0, 80)}` : ""}`;
    case "email.sent":
    case "invoice.emailed":
      return "Emailed invoice";
    case "invoice.created":
      return "Generated invoice";
    case "run.completed":
      return "Completed";
    case "run.error":
      return `Error: ${evt.message ?? "unknown"}`;
    default:
      // ignore heartbeat/chatter if no kind
      if (!k) return null;
      return k.replaceAll("_", " ");
  }
}

export default function PlannerPage() {
  const [goal, setGoal] = useState("");
  const [planner, setPlanner] = useState<PlannerKind>("openai");
  const [customerQuery, setCustomerQuery] = useState("");
  const [plateOrVin, setPlateOrVin] = useState("");
  const [emailInvoiceTo, setEmailInvoiceTo] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [steps, setSteps] = useState<string[]>([]);
  const [, setLog] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const esRef = useRef<EventSource | null>(null);

  // Preview modal state
  const [previewWoId, setPreviewWoId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // VIN capture modal state
  const [vinOpen, setVinOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // ✅ Simple toast/banner for VIN success
  const [toast, setToast] = useState<string | null>(null);

  const supabase = createClientComponentClient<Database>();
  const draft = useWorkOrderDraft();
  const setVehicleDraft = useWorkOrderDraft((s) => s.setVehicle);
  const setCustomerDraft = useWorkOrderDraft((s) => s.setCustomer);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => mounted && setUserId(data.user?.id ?? null));
    return () => void (mounted = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [photoPreview]);

  // Prefill from draft once
  useEffect(() => {
    const v = (draft?.vehicle?.vin ?? "").trim();
    if (v && !plateOrVin) setPlateOrVin(v);
    const em = (draft?.customer?.email ?? "").trim();
    if (em && !emailInvoiceTo) setEmailInvoiceTo(em);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPickPhoto(file: File | null) {
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function uploadPhotoIfAny(): Promise<string | undefined> {
    if (!photo) return undefined;
    const path = `agent-uploads/${crypto
      .randomUUID()
      .replace(/-/g, "")}-${photo.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const up = await supabase.storage.from("agent-uploads").upload(path, photo, {
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
    const pub = supabase.storage.from("agent-uploads").getPublicUrl(path);
    if (!pub.data?.publicUrl) throw new Error("Could not resolve public URL");
    return pub.data.publicUrl;
  }

  // Presets
  const presetOilGas = () =>
    setGoal(
      "Create a work order for oil change (gas engine). Add line items for engine oil and filter, reset maintenance light, quick multi-point inspection, then generate and email the invoice.",
    );
  const presetOilDiesel = () =>
    setGoal(
      "Create a work order for oil change (diesel). Add engine oil and filter, include fuel filter check, DEF level check, reset maintenance message, then generate and email the invoice.",
    );
  const presetMaint50 = () =>
    setGoal(
      "Create a work order for 50-point maintenance inspection. Add inspection checklist line, top off fluids, rotate tires if needed, report any issues, and produce a summarized estimate/invoice.",
    );
  const presetMaint50Air = () =>
    setGoal(
      "Create a work order for 50-point maintenance inspection plus air filters. Include engine air filter and cabin air filter lines if due, top off fluids, rotate tires if needed, and produce estimate/invoice.",
    );

  function clearAll() {
    setGoal("");
    setCustomerQuery("");
    setPlateOrVin("");
    setEmailInvoiceTo("");
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    setSteps([]);
    setLog([]);
    setRunId(null);
    setPreviewWoId(null);
    setPreviewOpen(false);
    esRef.current?.close();
    esRef.current = null;
    setRunning(false);
  }

  const appendStep = (s: string) => setSteps((arr) => (arr.includes(s) ? arr : [...arr, s]));
  const appendLog = (l: string) => setLog((arr) => [...arr, l]);

  async function start() {
    setRunning(true);
    setSteps([]);
    setLog([]);
    esRef.current?.close();
    esRef.current = null;

    try {
      const imageUrl = await uploadPhotoIfAny();
      if (imageUrl && photoPreview) URL.revokeObjectURL(photoPreview);
      if (imageUrl) {
        setPhoto(null);
        setPhotoPreview(null);
      }

      // OCR (short, bullet-y)
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
            if (!plateOrVin && (f.vin || f.plate)) setPlateOrVin(f.vin || f.plate || "");
            if (!emailInvoiceTo && f.email) setEmailInvoiceTo(f.email || "");
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
        } catch (err) {
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

      const ctx = {
        customerQuery: customerQuery || undefined,
        plateOrVin: plateOrVin || vinFromDraft || undefined,
        emailInvoiceTo: emailInvoiceTo || undefined,
        imageUrl,
        vin: vinFromDraft || (plateOrVin?.length === 17 ? plateOrVin : undefined),
        decodedVehicle,
        ocr: ocrFields || undefined,

        // ensure a line gets created
        lineDescription: goal?.trim() || undefined,
        jobType: "repair" as const,
        laborHours: 1,
      } as Record<string, unknown>;

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal,
          planner,
          context: ctx,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
      }

      const out = (await res.json()) as AgentStartOut;
      setRunId(out.runId);
      appendStep(out.alreadyExists ? "Resumed previous run…" : "Started plan…");

      // SSE
      const url = `/api/agent/events?runId=${encodeURIComponent(out.runId)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (ev) => {
        // Some servers send keepalives; ignore empties/heartbeats
        if (!ev.data || ev.data === ":ok" || ev.data === "[DONE]") return;

        try {
          const data = JSON.parse(ev.data) as AgentEvent;
          const label = labelFor(data);
          if (label) appendStep(label);

          const maybeId = extractWorkOrderId(data);
          if (
            (data.kind === "wo.created" || data.kind === "work_order.created") &&
            typeof maybeId === "string"
          ) {
            setPreviewWoId(maybeId);
            setPreviewOpen(true);
          }

          appendLog(ev.data);
          if (data.kind === "run.completed" || data.kind === "run.error") {
            es.close();
            esRef.current = null;
            setRunning(false);
          }
        } catch {
          // Non-JSON line; keep in raw log but don't pollute steps
          appendLog(ev.data);
        }
      };

      es.onerror = () => {
        // If the run ended properly, onmessage already closed it.
        // Otherwise, mark as finished gracefully.
        if (esRef.current) {
          appendStep("Stream ended");
          es.close();
          esRef.current = null;
          setRunning(false);
        }
      };
    } catch (e) {
      appendStep(`Error: ${toMsg(e)}`);
      setRunning(false);
    }
  }

  return (
    <div className="p-6">
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5 space-y-4">
        <h1
          className="text-2xl font-black text-orange-400"
          style={{ fontFamily: "'Black Ops One', system-ui, sans-serif" }}
        >
          AI Planner
        </h1>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="text-sm text-neutral-400 mb-1">Goal</div>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Find John Smith, create inspection WO, add note, email invoice"
              className="w-full min-h-[96px] p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={presetOilGas}>
                Oil change (gas)
              </Button>
              <Button variant="outline" size="sm" onClick={presetOilDiesel}>
                Oil change (diesel)
              </Button>
              <Button variant="outline" size="sm" onClick={presetMaint50}>
                Maintenance 50
              </Button>
              <Button variant="outline" size="sm" onClick={presetMaint50Air}>
                Maintenance 50 + Air
              </Button>
            </div>
          </label>

          <div className="grid gap-3">
            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Planner</div>
              <select
                value={planner}
                onChange={(e) => setPlanner((e.target.value as PlannerKind) ?? "openai")}
                className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
              >
                <option value="openai">OpenAI (rich)</option>
                <option value="simple">Simple (rules)</option>
              </select>
            </label>

            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Customer query (name)</div>
              <input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
                placeholder="e.g. John Smith"
              />
            </label>

            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Plate or VIN</div>
              <div className="flex gap-2">
                <input
                  value={plateOrVin}
                  onChange={(e) => setPlateOrVin(e.target.value)}
                  className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
                  placeholder="e.g. 8ABC123 or 1FT…"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVinOpen(true)}
                  title="Open VIN capture"
                  disabled={!userId}
                >
                  Scan VIN
                </Button>
              </div>
            </label>

            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Email invoice to (optional)</div>
              <input
                value={emailInvoiceTo}
                onChange={(e) => setEmailInvoiceTo(e.target.value)}
                className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
                placeholder="customer@example.com"
                type="email"
                inputMode="email"
              />
            </label>

            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Photo (DL / Registration)</div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-neutral-300 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-orange-600 file:text-white hover:file:bg-orange-700"
              />
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="mt-2 max-h-40 rounded border border-neutral-800 object-contain"
                />
              ) : null}
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={start}
            variant="orange"
            size="md"
            isLoading={running}
            disabled={!goal.trim() || running}
            className="font-black"
          >
            Run Plan
          </Button>

          <Button onClick={clearAll} variant="outline" size="md" disabled={running}>
            Clear
          </Button>
        </div>

        {runId && (
          <div className="text-xs text-neutral-500">
            Run ID: <code>{runId}</code>
          </div>
        )}

        {/* ✔️ Clean step list instead of raw text */}
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-sm text-neutral-300 mb-2">Stream</div>
          {steps.length === 0 ? (
            <div className="text-sm text-neutral-500">Waiting for updates…</div>
          ) : (
            <ul className="space-y-2">
              {steps.map((s, i) => (
                <li key={`${i}-${s}`} className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-500/80" />
                  <span className="text-sm text-neutral-100">{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {previewWoId && (
        <div className="mt-6">
          <WorkOrderPreviewTrigger open={previewOpen} onOpenChange={setPreviewOpen}>
            <WorkOrderPreview woId={previewWoId} />
          </WorkOrderPreviewTrigger>
        </div>
      )}

      {/* VIN Capture Modal */}
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

            setVehicleDraft({
              vin: d.vin,
              year: d.year,
              make: d.make,
              model: d.model,
              trim: d.trim,
              engine: d.engine,
            });
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

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded border px-4 py-2 shadow-xl"
          style={{ borderColor: "#f97316", backgroundColor: "#0a0a0a" }}
        >
          <div className="flex items-center gap-2 text-sm text-neutral-100">
            <span className="inline-block h-4 w-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}