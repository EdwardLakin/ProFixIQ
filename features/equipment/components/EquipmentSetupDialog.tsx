"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  ASSET_EQUIPMENT_CLASS_OPTIONS,
  ASSET_OPERATING_STATUSES,
  ASSET_OPERATING_STATUS_LABELS,
  type AssetOperatingStatus,
} from "@/features/equipment/lib/assetProfile";
import {
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_PANEL as PANEL,
} from "@/features/workspace/components";

export type EquipmentAdoptionCandidate = {
  id: string;
  unitNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  customerId: string | null;
  engineHours: number | null;
};

export type EquipmentCustomerOption = { id: string; name: string };
export type EquipmentSetupMode = "create" | "adopt";

type SetupForm = {
  customerId: string;
  unitNumber: string;
  equipmentClass: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  serialNumber: string;
  pin: string;
  engineHours: string;
  siteName: string;
  operatingStatus: AssetOperatingStatus;
  candidateId: string;
};

const INPUT =
  "min-h-10 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50";
const BUTTON =
  "min-h-10 rounded-lg border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50";
const PRIMARY_BUTTON =
  "min-h-10 rounded-lg bg-[color:var(--accent-copper)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

const EMPTY_FORM: SetupForm = {
  customerId: "",
  unitNumber: "",
  equipmentClass: "",
  make: "",
  model: "",
  year: "",
  vin: "",
  serialNumber: "",
  pin: "",
  engineHours: "",
  siteName: "",
  operatingStatus: "operational",
  candidateId: "",
};

function candidateLabel(candidate: EquipmentAdoptionCandidate): string {
  const identity = [candidate.year, candidate.make, candidate.model].filter(Boolean).join(" ");
  const primary = [
    candidate.unitNumber ? `Unit ${candidate.unitNumber}` : null,
    identity || null,
    candidate.vin,
  ]
    .filter(Boolean)
    .join(" · ");
  return `${primary || "Unnamed asset"} · Asset ${candidate.id.slice(0, 8)}`;
}

export default function EquipmentSetupDialog({
  mode,
  customers,
  onClose,
}: {
  mode: EquipmentSetupMode;
  customers: EquipmentCustomerOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<SetupForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creationOperationId] = useState(() => crypto.randomUUID());
  const [candidates, setCandidates] = useState<EquipmentAdoptionCandidate[]>([]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateNextOffset, setCandidateNextOffset] = useState<number | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === form.candidateId) ?? null;

  const update = (patch: Partial<SetupForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const loadCandidates = useCallback(
    async (query: string, offset: number, append: boolean) => {
      if (mode !== "adopt") return;
      setCandidateLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        params.set("offset", String(offset));
        const response = await fetch(`/api/equipment/adoption-candidates?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          candidates?: EquipmentAdoptionCandidate[];
          nextOffset?: number | null;
          error?: string;
        };
        if (!response.ok || !Array.isArray(payload.candidates)) {
          setError(payload.error ?? "Equipment adoption candidates could not be loaded.");
          return;
        }
        setCandidates((current) => (append ? [...current, ...payload.candidates!] : payload.candidates!));
        setCandidateNextOffset(payload.nextOffset ?? null);
        if (!append) update({ candidateId: "" });
      } catch {
        setError("Equipment adoption candidates could not be loaded. Check your connection and try again.");
      } finally {
        setCandidateLoading(false);
      }
    },
    [mode],
  );

  useEffect(() => {
    if (mode === "adopt") void loadCandidates("", 0, false);
  }, [loadCandidates, mode]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      let assetId: string;
      if (mode === "create") {
        const response = await fetch("/api/equipment/assets", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: creationOperationId,
            customerId: form.customerId || null,
            unitNumber: form.unitNumber,
            equipmentClass: form.equipmentClass,
            make: form.make,
            model: form.model,
            year: form.year,
            vin: form.vin,
            serialNumber: form.serialNumber,
            pin: form.pin,
            engineHours: form.engineHours,
            siteName: form.siteName,
            operatingStatus: form.operatingStatus,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          assetId?: string;
          error?: string;
          partial?: boolean;
        };
        if (!response.ok || !payload.assetId) {
          if (payload.partial && payload.assetId) {
            router.refresh();
            setError(
              payload.error ??
                "The canonical asset was retained. Refresh completed; close this dialog and use Add existing asset to finish setup.",
            );
            return;
          }
          setError(payload.error ?? "Equipment could not be created.");
          return;
        }
        assetId = payload.assetId;
      } else {
        if (!selectedCandidate) {
          setError("Select an existing asset to enable Equipment.");
          return;
        }
        if (!form.equipmentClass) {
          setError("Select an equipment class.");
          return;
        }
        const response = await fetch(`/api/equipment/assets/${selectedCandidate.id}/profile`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            createOnly: true,
            equipmentClass: form.equipmentClass,
            serialNumber: form.serialNumber,
            pin: form.pin,
            primaryMeter: "hours",
            currentCycles: null,
            siteName: form.siteName,
            operatingStatus: form.operatingStatus,
            mountedOnAssetId: null,
            attributes: {},
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? "Equipment could not be enabled for that asset.");
          return;
        }
        assetId = selectedCandidate.id;
      }

      router.push(`/equipment/${assetId}?setup=1`);
      router.refresh();
    } catch {
      setError("Equipment could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-busy={saving}
    >
      <div className={`${PANEL} max-h-[92vh] w-full max-w-3xl overflow-y-auto p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={EYEBROW}>Equipment setup</p>
            <h2 className="mt-1 text-xl font-bold">
              {mode === "create" ? "Create equipment" : "Add existing asset"}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
              {mode === "create"
                ? "Create the machine and its Equipment profile in one step."
                : "Enable Equipment on a Shop asset without changing its work-order history or canonical meter."}
            </p>
          </div>
          <button type="button" className={BUTTON} disabled={saving} onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {mode === "adopt" ? (
            <>
              <div className="sm:col-span-2 flex gap-2">
                <input
                  className={`${INPUT} min-w-0 flex-1`}
                  value={candidateSearch}
                  disabled={saving || candidateLoading}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const nextQuery = candidateSearch.trim();
                      setCandidateQuery(nextQuery);
                      void loadCandidates(nextQuery, 0, false);
                    }
                  }}
                  placeholder="Search existing assets by unit #"
                  aria-label="Search existing Shop assets by unit number"
                />
                <button
                  type="button"
                  className={BUTTON}
                  disabled={saving || candidateLoading}
                  onClick={() => {
                    const nextQuery = candidateSearch.trim();
                    setCandidateQuery(nextQuery);
                    void loadCandidates(nextQuery, 0, false);
                  }}
                >
                  Search
                </button>
              </div>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">
                  Existing asset *
                </span>
                <select
                  className={`${INPUT} w-full`}
                  value={form.candidateId}
                  disabled={saving || candidateLoading}
                  onChange={(event) => update({ candidateId: event.target.value })}
                >
                  <option value="">{candidateLoading ? "Loading assets…" : "Select asset…"}</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidateLabel(candidate)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedCandidate ? (
                <div className={`${PANEL} sm:col-span-2 p-3 text-sm`}>
                  <p className="font-semibold">Existing asset values stay canonical</p>
                  <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                    VIN: {selectedCandidate.vin ?? "—"} · Current hours:{" "}
                    {selectedCandidate.engineHours == null
                      ? "—"
                      : `${selectedCandidate.engineHours.toLocaleString()} h`}
                  </p>
                </div>
              ) : null}
              {candidateNextOffset !== null ? (
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={saving || candidateLoading}
                    onClick={() => void loadCandidates(candidateQuery, candidateNextOffset, true)}
                  >
                    {candidateLoading ? "Loading…" : "Load more assets"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Customer</span>
                <select className={`${INPUT} w-full`} value={form.customerId} disabled={saving} onChange={(event) => update({ customerId: event.target.value })}>
                  <option value="">No customer assigned</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>
              <label className="space-y-1"><span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Unit # *</span><input className={`${INPUT} w-full`} disabled={saving} value={form.unitNumber} onChange={(event) => update({ unitNumber: event.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Make</span><input className={`${INPUT} w-full`} disabled={saving} value={form.make} onChange={(event) => update({ make: event.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Model</span><input className={`${INPUT} w-full`} disabled={saving} value={form.model} onChange={(event) => update({ model: event.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Year</span><input className={`${INPUT} w-full`} disabled={saving} inputMode="numeric" value={form.year} onChange={(event) => update({ year: event.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">VIN</span><input className={`${INPUT} w-full`} disabled={saving} value={form.vin} onChange={(event) => update({ vin: event.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Current hours</span><input className={`${INPUT} w-full`} disabled={saving} inputMode="numeric" value={form.engineHours} onChange={(event) => update({ engineHours: event.target.value })} /></label>
            </>
          )}

          <label className="space-y-1">
            <span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Equipment class *</span>
            <select className={`${INPUT} w-full`} required disabled={saving} value={form.equipmentClass} onChange={(event) => update({ equipmentClass: event.target.value })}>
              <option value="">Select class…</option>
              {ASSET_EQUIPMENT_CLASS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="space-y-1"><span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Serial #</span><input className={`${INPUT} w-full`} disabled={saving} value={form.serialNumber} onChange={(event) => update({ serialNumber: event.target.value })} /></label>
          <label className="space-y-1"><span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Equipment PIN</span><input className={`${INPUT} w-full`} disabled={saving} value={form.pin} onChange={(event) => update({ pin: event.target.value })} /></label>
          <label className="space-y-1"><span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Site</span><input className={`${INPUT} w-full`} disabled={saving} value={form.siteName} onChange={(event) => update({ siteName: event.target.value })} /></label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">Status</span>
            <select className={`${INPUT} w-full`} disabled={saving} value={form.operatingStatus} onChange={(event) => update({ operatingStatus: event.target.value as AssetOperatingStatus })}>
              {ASSET_OPERATING_STATUSES.map((value) => <option key={value} value={value}>{ASSET_OPERATING_STATUS_LABELS[value]}</option>)}
            </select>
          </label>
        </div>

        {mode === "adopt" && !candidateLoading && candidates.length === 0 && candidateNextOffset === null ? (
          <p className="mt-4 text-sm text-[color:var(--theme-text-muted)]">
            No eligible Shop assets match this search.
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm font-semibold text-red-400" role="alert">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={BUTTON} disabled={saving} onClick={onClose}>Cancel</button>
          <button type="button" className={PRIMARY_BUTTON} disabled={saving || candidateLoading || (mode === "adopt" && !selectedCandidate)} onClick={() => void submit()}>
            {saving ? "Saving…" : mode === "create" ? "Create equipment" : "Enable Equipment"}
          </button>
        </div>
      </div>
    </div>
  );
}
