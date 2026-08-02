"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Loader2,
  PackageSearch,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import CustomerVehicleForm from "@/features/inspections/components/inspection/CustomerVehicleForm";
import type {
  EstimateCustomerForm,
  EstimateDetail,
  EstimateLineDraft,
  EstimatePartDraft,
  EstimateStatus,
  EstimateVehicleForm,
} from "@/features/estimates/types";
import {
  EMPTY_ESTIMATE_CUSTOMER,
  EMPTY_ESTIMATE_VEHICLE,
} from "@/features/estimates/types";
import {
  estimateNextOwner,
  estimateStatusLabel,
} from "@/features/estimates/lib/status";

type Props = {
  estimateId?: string;
  shopId?: string;
  defaultLaborRate?: number;
};

type MutationResult = {
  ok?: boolean;
  idempotent?: boolean;
  workOrderId?: string;
  estimateStatus?: EstimateStatus;
  estimateRevision?: number;
  error?: string;
};

type ReturnableEstimateLine = EstimateLineDraft & { id: string };

const RETURN_REASONS = [
  { value: "lower_cost_option", label: "Find a lower-cost option" },
  { value: "confirm_availability", label: "Confirm availability" },
  { value: "correct_quantity", label: "Correct quantity" },
  { value: "incorrect_application", label: "Incorrect vehicle application" },
  { value: "missing_parts", label: "Add missing parts" },
  { value: "review_price", label: "Review markup or price" },
  { value: "customer_alternative", label: "Customer requested an alternative" },
  { value: "other", label: "Other" },
] as const;

const inputClass =
  "min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-muted)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none transition placeholder:text-[color:var(--theme-text-muted)] focus:border-[color:var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-60";
const panelClass =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] shadow-[var(--theme-shadow-soft)]";

function newPart(): EstimatePartDraft {
  return {
    clientKey: crypto.randomUUID(),
    description: "",
    quantity: 1,
    partNumber: "",
    manufacturer: "",
  };
}

function newLine(defaultLaborRate: number): EstimateLineDraft {
  return {
    clientKey: crypto.randomUUID(),
    title: "",
    customerDescription: "",
    advisorNotes: "",
    laborHours: 0,
    laborRate: defaultLaborRate,
    parts: [],
    partsTotal: 0,
    grandTotal: 0,
  };
}

function money(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Number.isFinite(value) ? value : 0);
}

function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateInput(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function expiryIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function customerName(customer: EstimateCustomerForm): string {
  return (
    customer.business_name?.trim() ||
    [customer.first_name, customer.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    customer.name?.trim() ||
    "Unnamed customer"
  );
}

function vehicleLabel(vehicle: EstimateVehicleForm): string {
  return (
    [vehicle.year, vehicle.make, vehicle.model]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    vehicle.unit_number?.trim() ||
    vehicle.license_plate?.trim() ||
    vehicle.vin?.trim() ||
    "Unnamed vehicle"
  );
}

function statusTone(status: EstimateStatus): string {
  if (["approved", "partially_approved"].includes(status)) {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "waiting_for_parts") {
    return "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "ready_for_advisor") {
    return "border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-300";
  }
  if (status === "sent") {
    return "border-violet-400/40 bg-violet-400/10 text-violet-700 dark:text-violet-300";
  }
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-muted)] text-[color:var(--theme-text-secondary)]";
}

function isReturnableEstimateLine(
  line: EstimateLineDraft,
): line is ReturnableEstimateLine {
  return Boolean(
    line.id &&
    line.parts.length > 0 &&
    !line.approvedAt &&
    !line.workOrderLineId,
  );
}

async function mutation(
  url: string,
  options: {
    method?: "POST" | "PATCH";
    body: unknown;
    idempotencyKey: string;
    headers?: Record<string, string>;
  },
): Promise<MutationResult> {
  const response = await fetch(url, {
    method: options.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": options.idempotencyKey,
      ...options.headers,
    },
    body: JSON.stringify(options.body),
  });
  const result = (await response
    .json()
    .catch(() => null)) as MutationResult | null;
  if (!response.ok) {
    throw new Error(
      result?.error || "The estimate action could not be completed.",
    );
  }
  return result ?? { ok: true };
}

export default function EstimateBuilder({
  estimateId,
  shopId: initialShopId,
  defaultLaborRate = 0,
}: Props) {
  const router = useRouter();
  const isNew = !estimateId;
  const idempotencyKeysRef = useRef(new Map<string, string>());
  const createdEstimateRef = useRef<MutationResult | null>(null);
  const [detail, setDetail] = useState<EstimateDetail | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customer, setCustomer] = useState<EstimateCustomerForm>({
    ...EMPTY_ESTIMATE_CUSTOMER,
  });
  const [vehicle, setVehicle] = useState<EstimateVehicleForm>({
    ...EMPTY_ESTIMATE_VEHICLE,
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  const [lines, setLines] = useState<EstimateLineDraft[]>(() => [
    newLine(defaultLaborRate),
  ]);
  const [notes, setNotes] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] =
    useState<(typeof RETURN_REASONS)[number]["value"]>("lower_cost_option");
  const [returnNote, setReturnNote] = useState("");
  const [returnLineIds, setReturnLineIds] = useState<Set<string>>(new Set());

  const loadDetail = useCallback(async () => {
    if (!estimateId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/estimates/${estimateId}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | EstimateDetail
        | { error?: string }
        | null;
      if (!response.ok || !body || !("estimate" in body)) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "Could not load estimate.",
        );
      }
      setDetail(body);
      setCustomer(body.estimate.customer);
      setVehicle(body.estimate.vehicle);
      setSelectedCustomerId(body.estimate.customer.id ?? null);
      setSelectedVehicleId(body.estimate.vehicle.id ?? null);
      setLines(body.estimate.lines);
      setNotes(body.estimate.notes ?? "");
      setExpiresOn(dateInput(body.estimate.expiresAt));
      setReturnLineIds(
        new Set(
          body.estimate.lines
            .filter(isReturnableEstimateLine)
            .map((line) => line.id),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load estimate.",
      );
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const shopId = detail?.shop.id ?? initialShopId ?? null;
  const laborRate = detail?.shop.laborRate ?? defaultLaborRate;
  const status = detail?.estimate.estimateStatus ?? "draft";
  const editable =
    isNew || (status === "draft" && Boolean(detail?.actor.canEdit));
  const advisorMode = detail?.actor.mode !== "parts";
  const hasDeliveryEmail = Boolean(customer.email?.trim());

  const totals = useMemo(() => {
    return lines.reduce(
      (sum, line) => {
        const labor =
          Math.max(0, Number(line.laborHours) || 0) *
          Math.max(0, Number(line.laborRate) || 0);
        const parts = Math.max(0, Number(line.partsTotal) || 0);
        return { labor: sum.labor + labor, parts: sum.parts + parts };
      },
      { labor: 0, parts: 0 },
    );
  }, [lines]);

  const requestsByLine = useMemo(() => {
    const map = new Map<string, EstimateDetail["estimate"]["requests"]>();
    for (const request of detail?.estimate.requests ?? []) {
      if (!request.quoteLineId) continue;
      const current = map.get(request.quoteLineId) ?? [];
      current.push(request);
      map.set(request.quoteLineId, current);
    }
    return map;
  }, [detail]);

  const partsReady = useMemo(() => {
    const requests = detail?.estimate.requests ?? [];
    return (
      requests.length > 0 &&
      requests.every(
        (request) =>
          request.items.length > 0 &&
          request.items.every((item) => item.priced),
      )
    );
  }, [detail]);

  async function runMutation(
    actionKey: string,
    url: string,
    options: {
      method?: "POST" | "PATCH";
      body: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<MutationResult> {
    const existingKey = idempotencyKeysRef.current.get(actionKey);
    const idempotencyKey = existingKey ?? crypto.randomUUID();
    if (!existingKey) idempotencyKeysRef.current.set(actionKey, idempotencyKey);

    const result = await mutation(url, { ...options, idempotencyKey });
    idempotencyKeysRef.current.delete(actionKey);
    return result;
  }

  function updateLine(clientKey: string, patch: Partial<EstimateLineDraft>) {
    setLines((current) =>
      current.map((line) =>
        line.clientKey === clientKey ? { ...line, ...patch } : line,
      ),
    );
  }

  function updatePart(
    lineKey: string,
    partKey: string,
    patch: Partial<EstimatePartDraft>,
  ) {
    setLines((current) =>
      current.map((line) => {
        if (line.clientKey !== lineKey) return line;
        return {
          ...line,
          parts: line.parts.map((part) =>
            part.clientKey === partKey ? { ...part, ...patch } : part,
          ),
        };
      }),
    );
  }

  function removePart(lineKey: string, partKey: string) {
    setLines((current) =>
      current.map((line) =>
        line.clientKey === lineKey
          ? {
              ...line,
              parts: line.parts.filter((part) => part.clientKey !== partKey),
            }
          : line,
      ),
    );
  }

  function validateDraft(): string | null {
    const hasCustomer = Boolean(
      selectedCustomerId ||
      customer.business_name?.trim() ||
      customer.first_name?.trim() ||
      customer.last_name?.trim(),
    );
    if (!hasCustomer) return "Select a customer or enter a customer name.";
    const hasVehicle = Boolean(
      selectedVehicleId || (vehicle.make?.trim() && vehicle.model?.trim()),
    );
    if (!hasVehicle) return "Select a vehicle or enter its make and model.";
    if (lines.length === 0 || lines.some((line) => !line.title.trim())) {
      return "Every repair line needs a service title.";
    }
    if (
      lines.some((line) =>
        line.parts.some(
          (part) => !part.description.trim() || part.quantity <= 0,
        ),
      )
    ) {
      return "Every requested part needs a description and positive quantity.";
    }
    return null;
  }

  function draftBody() {
    return {
      customer: { ...customer, id: selectedCustomerId },
      vehicle: { ...vehicle, id: selectedVehicleId },
      lines: lines.map((line) => ({
        clientKey: line.clientKey,
        title: line.title,
        customerDescription: line.customerDescription,
        advisorNotes: line.advisorNotes,
        laborHours: Number(line.laborHours) || 0,
        laborRate: Number(line.laborRate) || 0,
        parts: line.parts.map((part) => ({
          clientKey: part.clientKey,
          description: part.description,
          quantity: Number(part.quantity) || 1,
          partNumber: part.partNumber,
          manufacturer: part.manufacturer,
        })),
      })),
      notes: notes || null,
      expiresAt: expiryIso(expiresOn),
    };
  }

  async function createEstimate(submitToParts: boolean) {
    const validationError = validateDraft();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(submitToParts ? "submit" : "save");
    setError(null);
    setNotice(null);
    try {
      const existingCreated = createdEstimateRef.current;
      const created =
        existingCreated ??
        (await runMutation("create-estimate", "/api/estimates", {
          body: draftBody(),
        }));
      if (!created.workOrderId)
        throw new Error("Estimate was created without an id.");
      createdEstimateRef.current = created;
      if (existingCreated || created.idempotent) {
        try {
          await runMutation(
            `save-created-draft:${created.workOrderId}`,
            `/api/estimates/${created.workOrderId}`,
            {
              method: "PATCH",
              body: {
                ...draftBody(),
                expectedRevision: created.estimateRevision ?? 1,
              },
            },
          );
        } catch (saveError) {
          // A lost submit response can leave this browser on the new page even
          // though the server already advanced the canonical estimate. Verify
          // that state before treating the draft-save conflict as a failure.
          if (submitToParts) {
            const stateResponse = await fetch(
              `/api/estimates/${created.workOrderId}`,
              {
                cache: "no-store",
              },
            );
            const stateBody = (await stateResponse
              .json()
              .catch(() => null)) as EstimateDetail | null;
            if (
              stateResponse.ok &&
              stateBody?.estimate &&
              stateBody.estimate.estimateStatus !== "draft"
            ) {
              router.push(`/estimates/${created.workOrderId}`);
              router.refresh();
              return;
            }
          }
          throw saveError;
        }
      }
      if (submitToParts) {
        await runMutation(
          `submit-parts:${created.workOrderId}`,
          `/api/estimates/${created.workOrderId}/submit-parts`,
          {
            body: { expectedRevision: created.estimateRevision ?? 1 },
          },
        );
      }
      router.push(`/estimates/${created.workOrderId}`);
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not create estimate.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft(showNotice = true) {
    if (!detail) return;
    const validationError = validateDraft();
    if (validationError) throw new Error(validationError);
    await runMutation(
      `save-draft:${detail.estimate.id}`,
      `/api/estimates/${detail.estimate.id}`,
      {
        method: "PATCH",
        body: {
          ...draftBody(),
          expectedRevision: detail.estimate.estimateRevision,
        },
      },
    );
    if (showNotice) setNotice("Draft saved.");
  }

  async function handleSave() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      await saveDraft();
      await loadDetail();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not save draft.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitToParts() {
    if (!detail) return;
    setBusy("submit");
    setError(null);
    setNotice(null);
    try {
      await saveDraft(false);
      await runMutation(
        `submit-parts:${detail.estimate.id}`,
        `/api/estimates/${detail.estimate.id}/submit-parts`,
        {
          body: { expectedRevision: detail.estimate.estimateRevision },
        },
      );
      setNotice("Estimate submitted to Parts.");
      await loadDetail();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not submit estimate.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function completeParts() {
    if (!detail) return;
    setBusy("parts-complete");
    setError(null);
    setNotice(null);
    try {
      await runMutation(
        `complete-parts:${detail.estimate.id}`,
        `/api/estimates/${detail.estimate.id}/parts-complete`,
        {
          body: { expectedRevision: detail.estimate.estimateRevision },
        },
      );
      setNotice("Parts quote completed and returned to the advisor.");
      await loadDetail();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not complete parts quote.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function sendEstimate() {
    if (!detail) return;
    if (!hasDeliveryEmail) {
      setError(
        "Add an email address to the customer record before sending this estimate.",
      );
      return;
    }
    setBusy("send");
    setError(null);
    setNotice(null);
    try {
      const actionKey = `send-estimate:${detail.estimate.id}:${detail.estimate.estimateRevision}`;
      const existingKey = idempotencyKeysRef.current.get(actionKey);
      const idempotencyKey = existingKey ?? crypto.randomUUID();
      if (!existingKey)
        idempotencyKeysRef.current.set(actionKey, idempotencyKey);
      const response = await fetch("/api/quotes/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          ...(detail.estimate.estimateRevision > 1
            ? { "x-profix-resend": "1" }
            : {}),
        },
        body: JSON.stringify({ workOrderId: detail.estimate.id }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        detail?: string;
        inProgress?: boolean;
      } | null;
      if (!response.ok)
        throw new Error(
          body?.error || body?.detail || "Could not send estimate.",
        );
      idempotencyKeysRef.current.delete(actionKey);
      setNotice(
        body?.inProgress
          ? "This estimate delivery was already accepted and is still being finalized."
          : "Estimate sent to the customer.",
      );
      await loadDetail();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not send estimate.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function returnToParts() {
    if (!detail || returnLineIds.size === 0) {
      setError("Select at least one parts-bearing repair line.");
      return;
    }
    setBusy("return");
    setError(null);
    setNotice(null);
    try {
      await runMutation(
        `return-to-parts:${detail.estimate.id}`,
        `/api/estimates/${detail.estimate.id}/return-to-parts`,
        {
          body: {
            expectedRevision: detail.estimate.estimateRevision,
            quoteLineIds: [...returnLineIds],
            reasonCode: returnReason,
            note: returnNote || null,
          },
        },
      );
      setReturnOpen(false);
      setReturnNote("");
      setNotice("Selected lines returned to Parts as a new revision.");
      await loadDetail();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not return estimate.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading && !detail) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[color:var(--theme-text-secondary)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading estimate…
      </div>
    );
  }

  if (!isNew && !detail) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className={`${panelClass} p-8 text-center`}>
          <h1 className="text-xl font-semibold text-[color:var(--theme-text-primary)]">
            Estimate unavailable
          </h1>
          <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
            {error ?? "This estimate could not be found."}
          </p>
          <Link
            href="/estimates"
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--brand-primary)]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Estimates
          </Link>
        </div>
      </main>
    );
  }

  const reference = detail?.estimate.estimateNumber ?? "New estimate";
  const revision = detail?.estimate.estimateRevision ?? 1;
  const partsWorkbenchHref = detail
    ? `/parts/requests/${encodeURIComponent(detail.estimate.customId ?? detail.estimate.id)}`
    : "/parts/requests";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/estimates"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--theme-text-secondary)] hover:text-[color:var(--brand-primary)]"
        >
          <ArrowLeft className="h-4 w-4" /> Estimates
        </Link>
        {detail ? (
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(status)}`}
            >
              {estimateStatusLabel(status)}
            </span>
            <span className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs text-[color:var(--theme-text-secondary)]">
              Revision {revision}
            </span>
          </div>
        ) : null}
      </div>

      <header className={`${panelClass} mb-5 overflow-hidden`}>
        <div className="border-b border-[color:var(--theme-border-soft)] p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-primary)]">
                {reference}
              </div>
              <h1 className="mt-2 text-2xl font-bold text-[color:var(--theme-text-primary)] sm:text-3xl">
                {isNew
                  ? "Build an estimate"
                  : `${customerName(customer)} · ${vehicleLabel(vehicle)}`}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-[color:var(--theme-text-secondary)]">
                {isNew
                  ? "Select or create the customer and vehicle, describe the requested work, then submit only parts-bearing lines to Parts."
                  : `Current owner: ${estimateNextOwner(status)}. ${status === "waiting_for_parts" ? "Pricing stays in the existing Parts request workbench." : "The estimate stays attached to the same work-order record through approval."}`}
              </p>
            </div>
            {!isNew && detail?.actor.canEdit ? (
              <button
                type="button"
                onClick={() => void loadDetail()}
                disabled={Boolean(busy)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-sm font-semibold text-[color:var(--theme-text-secondary)] hover:border-[color:var(--brand-primary)]"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-muted)]">
          {[
            { label: "Customer & Vehicle", icon: UserRound, active: true },
            { label: "Estimate", icon: FileText, active: lines.length > 0 },
            {
              label: "Parts & Send",
              icon: Send,
              active: !isNew && status !== "draft",
            },
          ].map((step, index) => (
            <div
              key={step.label}
              className={`flex min-h-16 items-center justify-center gap-2 px-2 text-center text-xs font-semibold sm:text-sm ${step.active ? "text-[color:var(--theme-text-primary)]" : "text-[color:var(--theme-text-muted)]"}`}
            >
              <span
                className={`hidden h-7 w-7 items-center justify-center rounded-full sm:flex ${step.active ? "bg-[color:var(--brand-primary)] text-white" : "border border-[color:var(--theme-border-soft)]"}`}
              >
                {step.active && index < 2 ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <step.icon className="h-4 w-4" />
                )}
              </span>
              {step.label}
            </div>
          ))}
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </div>
      ) : null}
      {detail &&
      status === "ready_for_advisor" &&
      detail.actor.canSend &&
      !hasDeliveryEmail ? (
        <div
          role="alert"
          className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            Add an email address to the customer record before sending this
            estimate.
          </span>
          {customer.id ? (
            <Link
              href={`/customers/${customer.id}`}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/50 px-3 font-semibold hover:bg-amber-400/10"
            >
              Open customer
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className={`${panelClass} p-4 sm:p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
                  Customer &amp; vehicle
                </h2>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  Same customer and vehicle contract as Create Work Order.
                </p>
              </div>
              {!isNew ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : null}
            </div>

            {isNew ? (
              shopId ? (
                <CustomerVehicleForm
                  customer={customer}
                  vehicle={vehicle}
                  saving={Boolean(busy)}
                  workOrderExists={false}
                  shopId={shopId}
                  selectedCustomerId={selectedCustomerId}
                  selectedVehicleId={selectedVehicleId}
                  handlers={{
                    onCustomerChange: (
                      field: keyof EstimateCustomerForm,
                      value: string | null,
                    ) => {
                      setCustomer((current) => ({
                        ...current,
                        [field]: value,
                      }));
                    },
                    onVehicleChange: (
                      field: keyof EstimateVehicleForm,
                      value: string | null,
                    ) => {
                      setVehicle((current) => ({ ...current, [field]: value }));
                    },
                    onCustomerSelected: (id: string) =>
                      setSelectedCustomerId(id),
                    onVehicleSelected: (id: string) => setSelectedVehicleId(id),
                  }}
                />
              ) : (
                <p className="text-sm text-[color:var(--theme-text-secondary)]">
                  Shop context is unavailable.
                </p>
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-[color:var(--theme-surface-muted)] p-4">
                  <div className="text-xs uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    Customer
                  </div>
                  <div className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">
                    {customerName(customer)}
                  </div>
                  {advisorMode ? (
                    <div className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                      {[customer.phone, customer.email]
                        .filter(Boolean)
                        .join(" · ") || "No contact recorded"}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl bg-[color:var(--theme-surface-muted)] p-4">
                  <div className="text-xs uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    Vehicle
                  </div>
                  <div className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">
                    {vehicleLabel(vehicle)}
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                    {[
                      vehicle.unit_number
                        ? `Unit ${vehicle.unit_number}`
                        : null,
                      vehicle.vin,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No VIN or unit recorded"}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className={`${panelClass} p-4 sm:p-5`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
                  Requested work
                </h2>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  Customer-readable repair lines with advisor-entered labor and
                  requested parts.
                </p>
              </div>
              {editable ? (
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) => [...current, newLine(laborRate)])
                  }
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:border-[color:var(--brand-primary)]"
                >
                  <Plus className="h-4 w-4" /> Add repair line
                </button>
              ) : null}
            </div>

            <div className="space-y-4">
              {lines.map((line, lineIndex) => {
                const linkedRequests = line.id
                  ? (requestsByLine.get(line.id) ?? [])
                  : [];
                const laborTotal =
                  (Number(line.laborHours) || 0) *
                  (Number(line.laborRate) || 0);
                return (
                  <article
                    key={line.clientKey}
                    className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-muted)] p-4"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)] text-sm font-bold text-white">
                        {lineIndex + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        {editable ? (
                          <input
                            value={line.title}
                            onChange={(event) =>
                              updateLine(line.clientKey, {
                                title: event.target.value,
                              })
                            }
                            placeholder="Service title — e.g. Replace front brake pads and rotors"
                            aria-label={`Repair line ${lineIndex + 1} title`}
                            className={`${inputClass} font-semibold`}
                          />
                        ) : (
                          <h3 className="font-semibold text-[color:var(--theme-text-primary)]">
                            {line.title}
                          </h3>
                        )}
                        {!editable && line.status ? (
                          <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                            {line.status.replaceAll("_", " ")}{" "}
                            {line.stage
                              ? `· ${line.stage.replaceAll("_", " ")}`
                              : ""}
                          </div>
                        ) : null}
                      </div>
                      {editable && lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLines((current) =>
                              current.filter(
                                (item) => item.clientKey !== line.clientKey,
                              ),
                            )
                          }
                          className="rounded-lg p-2 text-[color:var(--theme-text-muted)] hover:bg-red-400/10 hover:text-red-600"
                          aria-label={`Remove repair line ${lineIndex + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>

                    {editable ? (
                      <div className="grid gap-3 lg:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                            Customer-facing explanation
                          </span>
                          <textarea
                            value={line.customerDescription}
                            onChange={(event) =>
                              updateLine(line.clientKey, {
                                customerDescription: event.target.value,
                              })
                            }
                            rows={3}
                            placeholder="What is being recommended and why"
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                            Internal advisor notes
                          </span>
                          <textarea
                            value={line.advisorNotes}
                            onChange={(event) =>
                              updateLine(line.clientKey, {
                                advisorNotes: event.target.value,
                              })
                            }
                            rows={3}
                            placeholder="Symptoms, sourcing instructions, application details"
                            className={inputClass}
                          />
                        </label>
                      </div>
                    ) : line.customerDescription ? (
                      <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">
                        {line.customerDescription}
                      </p>
                    ) : null}

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                          Labor hours
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={line.laborHours}
                          onChange={(event) =>
                            updateLine(line.clientKey, {
                              laborHours: Number(event.target.value),
                            })
                          }
                          disabled={!editable}
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                          Labor rate
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.laborRate}
                          onChange={(event) =>
                            updateLine(line.clientKey, {
                              laborRate: Number(event.target.value),
                            })
                          }
                          disabled={!editable}
                          className={inputClass}
                        />
                      </label>
                      <div>
                        <span className="mb-1 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                          Line total
                        </span>
                        <div className="flex min-h-11 items-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                          {detail?.actor.mode === "parts"
                            ? money(Number(line.partsTotal) || 0)
                            : money(
                                Number(line.grandTotal) ||
                                  laborTotal + (Number(line.partsTotal) || 0),
                              )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-[color:var(--theme-border-soft)] pt-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                            Requested parts
                          </h4>
                          <p className="text-xs text-[color:var(--theme-text-muted)]">
                            Labor-only lines bypass Parts automatically.
                          </p>
                        </div>
                        {editable ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(line.clientKey, {
                                parts: [...line.parts, newPart()],
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--brand-primary)] hover:bg-[color:var(--theme-surface-panel)]"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add part
                          </button>
                        ) : null}
                      </div>

                      {editable ? (
                        line.parts.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-4 text-center text-xs text-[color:var(--theme-text-muted)]">
                            No parts required.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {line.parts.map((part) => (
                              <div
                                key={part.clientKey}
                                className="grid gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3 sm:grid-cols-[minmax(0,1fr)_90px_150px_150px_36px]"
                              >
                                <input
                                  value={part.description}
                                  onChange={(event) =>
                                    updatePart(line.clientKey, part.clientKey, {
                                      description: event.target.value,
                                    })
                                  }
                                  placeholder="Part description"
                                  aria-label="Requested part description"
                                  className={inputClass}
                                />
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={part.quantity}
                                  onChange={(event) =>
                                    updatePart(line.clientKey, part.clientKey, {
                                      quantity: Number(event.target.value),
                                    })
                                  }
                                  aria-label="Requested part quantity"
                                  className={inputClass}
                                />
                                <input
                                  value={part.partNumber}
                                  onChange={(event) =>
                                    updatePart(line.clientKey, part.clientKey, {
                                      partNumber: event.target.value,
                                    })
                                  }
                                  placeholder="Part # (optional)"
                                  aria-label="Requested part number"
                                  className={inputClass}
                                />
                                <input
                                  value={part.manufacturer}
                                  onChange={(event) =>
                                    updatePart(line.clientKey, part.clientKey, {
                                      manufacturer: event.target.value,
                                    })
                                  }
                                  placeholder="Brand (optional)"
                                  aria-label="Requested manufacturer"
                                  className={inputClass}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    removePart(line.clientKey, part.clientKey)
                                  }
                                  className="flex h-11 items-center justify-center rounded-lg text-[color:var(--theme-text-muted)] hover:bg-red-400/10 hover:text-red-600"
                                  aria-label="Remove requested part"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )
                      ) : linkedRequests.length > 0 ? (
                        <div className="space-y-3">
                          {linkedRequests
                            .flatMap((request) => request.items)
                            .map((item) => (
                              <div
                                key={item.id}
                                className="flex flex-col gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div>
                                  <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
                                    {item.quantity} × {item.description}
                                  </div>
                                  <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                                    {[
                                      item.requestedPartNumber,
                                      item.requestedManufacturer,
                                      item.vendor,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ") || "Manual sourcing"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.priced ? "bg-emerald-400/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-400/10 text-amber-700 dark:text-amber-300"}`}
                                  >
                                    {item.priced
                                      ? money(
                                          (item.quotedPrice ?? 0) *
                                            item.quantity,
                                        )
                                      : "Needs price"}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : line.parts.length > 0 ? (
                        <div className="space-y-2">
                          {line.parts.map((part) => (
                            <div
                              key={part.clientKey}
                              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3 text-sm text-[color:var(--theme-text-primary)]"
                            >
                              {part.quantity} × {part.description}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-4 text-center text-xs text-[color:var(--theme-text-muted)]">
                          Labor-only line.
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {detail && status === "waiting_for_parts" ? (
            <section className={`${panelClass} p-4 sm:p-5`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    <PackageSearch className="h-5 w-5" /> Parts owns the next
                    action
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                    {detail.actor.canCompleteParts
                      ? "Enter vendor, part identity, cost and selling price in the existing Parts request workbench. Completing here does not send the customer anything."
                      : "The Parts team is sourcing and pricing this revision. You can review and send it after Parts completes the quote."}
                  </p>
                </div>
                {detail.actor.canCompleteParts ? (
                  <Link
                    href={partsWorkbenchHref}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[color:var(--brand-primary)] px-4 text-sm font-semibold text-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)] hover:text-white"
                  >
                    Open Parts Workbench <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
              {detail.actor.canCompleteParts ? (
                <div className="mt-4 flex flex-col gap-2 border-t border-[color:var(--theme-border-soft)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[color:var(--theme-text-secondary)]">
                    {partsReady
                      ? "Every current request item has pricing."
                      : "All current request items need quantity, identity and selling price."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void completeParts()}
                    disabled={!partsReady || Boolean(busy)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "parts-complete" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Complete Parts Quote
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {detail && returnOpen && detail.actor.canSend ? (
            <section className={`${panelClass} border-amber-400/35 p-4 sm:p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
                    Return selected lines to Parts
                  </h2>
                  <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                    This creates revision {revision + 1}. Previous sent pricing
                    remains in the audit trail and cannot be silently
                    overwritten.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReturnOpen(false)}
                  className="text-sm font-semibold text-[color:var(--theme-text-secondary)]"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {lines.filter(isReturnableEstimateLine).map((line) => (
                  <label
                    key={line.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-muted)] p-3"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(line.id && returnLineIds.has(line.id))}
                      onChange={(event) => {
                        if (!line.id) return;
                        setReturnLineIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(line.id);
                          else next.delete(line.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-[color:var(--theme-border-soft)] text-[color:var(--brand-primary)]"
                    />
                    <span className="text-sm font-medium text-[color:var(--theme-text-primary)]">
                      {line.title}
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                    Reason
                  </span>
                  <select
                    value={returnReason}
                    onChange={(event) =>
                      setReturnReason(
                        event.target
                          .value as (typeof RETURN_REASONS)[number]["value"],
                      )
                    }
                    className={inputClass}
                  >
                    {RETURN_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                    Instructions for Parts
                  </span>
                  <textarea
                    value={returnNote}
                    onChange={(event) => setReturnNote(event.target.value)}
                    rows={2}
                    className={inputClass}
                    placeholder="What needs to change?"
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void returnToParts()}
                  disabled={returnLineIds.size === 0 || Boolean(busy)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy === "return" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Create revision &amp; return
                </button>
              </div>
            </section>
          ) : null}

          {advisorMode ? (
            <section className={`${panelClass} p-4 sm:p-5`}>
              <label>
                <span className="mb-1 block text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  Estimate notes
                </span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={!editable}
                  rows={3}
                  className={inputClass}
                  placeholder="Internal context for this estimate"
                />
              </label>
              <label className="mt-3 block max-w-xs">
                <span className="mb-1 block text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  Expires on
                </span>
                <input
                  type="date"
                  value={expiresOn}
                  onChange={(event) => setExpiresOn(event.target.value)}
                  disabled={!editable}
                  className={inputClass}
                />
              </label>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <section className={`${panelClass} p-5`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
              <CircleDollarSign className="h-5 w-5 text-[color:var(--brand-primary)]" />{" "}
              Estimate summary
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              {advisorMode ? (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[color:var(--theme-text-secondary)]">
                      Labor
                    </dt>
                    <dd className="font-medium text-[color:var(--theme-text-primary)]">
                      {money(totals.labor)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[color:var(--theme-text-secondary)]">
                      Parts
                    </dt>
                    <dd className="font-medium text-[color:var(--theme-text-primary)]">
                      {money(totals.parts)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-[color:var(--theme-border-soft)] pt-3">
                    <dt className="font-semibold text-[color:var(--theme-text-primary)]">
                      Repair subtotal
                    </dt>
                    <dd className="text-lg font-bold text-[color:var(--theme-text-primary)]">
                      {money(totals.labor + totals.parts)}
                    </dd>
                  </div>
                  <p className="text-xs leading-5 text-[color:var(--theme-text-muted)]">
                    The customer-facing total adds configured shop supplies and
                    tax when the estimate is sent.
                  </p>
                </>
              ) : (
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--theme-text-secondary)]">
                    Quoted parts
                  </dt>
                  <dd className="text-lg font-bold text-[color:var(--theme-text-primary)]">
                    {money(totals.parts)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-[color:var(--theme-border-soft)] pt-3">
                <dt className="text-[color:var(--theme-text-secondary)]">
                  Repair lines
                </dt>
                <dd className="font-medium text-[color:var(--theme-text-primary)]">
                  {lines.length}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--theme-text-secondary)]">
                  Next owner
                </dt>
                <dd className="font-medium text-[color:var(--theme-text-primary)]">
                  {estimateNextOwner(status)}
                </dd>
              </div>
              {detail?.estimate.expiresAt ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--theme-text-secondary)]">
                    Expires
                  </dt>
                  <dd className="font-medium text-[color:var(--theme-text-primary)]">
                    {dateTime(detail.estimate.expiresAt)}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-5 space-y-2 border-t border-[color:var(--theme-border-soft)] pt-4">
              {isNew ? (
                <>
                  <button
                    type="button"
                    onClick={() => void createEstimate(true)}
                    disabled={Boolean(busy)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {busy === "submit" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PackageSearch className="h-4 w-4" />
                    )}{" "}
                    Submit to Parts
                  </button>
                  <button
                    type="button"
                    onClick={() => void createEstimate(false)}
                    disabled={Boolean(busy)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:border-[color:var(--brand-primary)] disabled:opacity-50"
                  >
                    {busy === "save" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}{" "}
                    Save Draft
                  </button>
                </>
              ) : status === "draft" && detail?.actor.canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => void submitToParts()}
                    disabled={Boolean(busy)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {busy === "submit" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PackageSearch className="h-4 w-4" />
                    )}{" "}
                    Submit to Parts
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={Boolean(busy)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:border-[color:var(--brand-primary)] disabled:opacity-50"
                  >
                    {busy === "save" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}{" "}
                    Save Draft
                  </button>
                </>
              ) : status === "ready_for_advisor" && detail?.actor.canSend ? (
                <>
                  <button
                    type="button"
                    onClick={() => void sendEstimate()}
                    disabled={Boolean(busy) || !hasDeliveryEmail}
                    title={
                      !hasDeliveryEmail
                        ? "Add a customer email before sending"
                        : undefined
                    }
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "send" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}{" "}
                    {revision > 1 ? "Resend Estimate" : "Send Estimate"}
                  </button>
                  {lines.some(isReturnableEstimateLine) ? (
                    <button
                      type="button"
                      onClick={() => setReturnOpen(true)}
                      disabled={Boolean(busy)}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 px-4 text-sm font-semibold text-amber-700 hover:bg-amber-400/10 dark:text-amber-300"
                    >
                      <RotateCcw className="h-4 w-4" /> Return to Parts
                    </button>
                  ) : null}
                </>
              ) : status === "sent" &&
                detail?.actor.canSend &&
                lines.some(isReturnableEstimateLine) ? (
                <button
                  type="button"
                  onClick={() => setReturnOpen(true)}
                  disabled={Boolean(busy)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 px-4 text-sm font-semibold text-amber-700 hover:bg-amber-400/10 dark:text-amber-300"
                >
                  <RotateCcw className="h-4 w-4" /> Return to Parts
                </button>
              ) : status === "waiting_for_parts" ? (
                <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400/10 px-4 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  <Clock3 className="h-4 w-4" /> Waiting for Parts
                </div>
              ) : ["approved", "partially_approved"].includes(status) &&
                detail ? (
                <>
                  <Link
                    href={`/work-orders/view/${detail.estimate.id}`}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white hover:brightness-110"
                  >
                    <Wrench className="h-4 w-4" /> Open Work Order
                  </Link>
                  {status === "partially_approved" &&
                  detail.actor.canSend &&
                  lines.some(isReturnableEstimateLine) ? (
                    <button
                      type="button"
                      onClick={() => setReturnOpen(true)}
                      disabled={Boolean(busy)}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 px-4 text-sm font-semibold text-amber-700 hover:bg-amber-400/10 dark:text-amber-300"
                    >
                      <RotateCcw className="h-4 w-4" /> Revise unapproved lines
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          {detail?.estimate.events.length ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Recent workflow
              </h2>
              <div className="mt-4 space-y-4">
                {detail.estimate.events.slice(0, 6).map((event) => (
                  <div
                    key={event.id}
                    className="relative border-l border-[color:var(--theme-border-soft)] pl-4"
                  >
                    <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-[color:var(--theme-surface-panel)] bg-[color:var(--brand-primary)]" />
                    <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">
                      {event.eventType.replaceAll("_", " ")}
                    </div>
                    <div className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
                      Revision {event.revision} · {dateTime(event.createdAt)}
                    </div>
                    {event.note ? (
                      <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        {event.note}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
