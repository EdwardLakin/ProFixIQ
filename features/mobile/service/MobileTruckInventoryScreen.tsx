"use client";

import {
  ArrowLeft,
  Boxes,
  ClipboardList,
  Loader2,
  MoveRight,
  PackageCheck,
  RefreshCw,
  Truck,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";

import TruckHistoryPanel from "./TruckHistoryPanel";
import TruckLoadPanel from "./TruckLoadPanel";
import TruckReceivePanel from "./TruckReceivePanel";
import TruckStockPanel from "./TruckStockPanel";
import type {
  FieldCatalogPart,
  FieldOpenReceipt,
  FieldRecentPartUse,
  FieldTruckInventoryItem,
  FieldTruckInventorySnapshot,
} from "./truckInventoryContracts";
import type { IdentityDraft, TruckInventoryView } from "./truckInventoryUi";
import { actionClass } from "./truckInventoryUi";

type Props = {
  snapshot: FieldTruckInventorySnapshot | null;
  online: boolean;
  view: TruckInventoryView;
  setView: Dispatch<SetStateAction<TruckInventoryView>>;
  loading: boolean;
  busy: boolean;
  error: string | null;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  load: (search?: string, serviceVehicleId?: string) => Promise<void>;
  selectedTruckId: string;
  onTruckChange: (truckId: string) => void;
  selectedPartId: string | null;
  setSelectedPartId: Dispatch<SetStateAction<string | null>>;
  selectedLineId: string;
  setSelectedLineId: Dispatch<SetStateAction<string>>;
  quantity: number;
  setQuantity: Dispatch<SetStateAction<number>>;
  identityDraft: IdentityDraft | null;
  setIdentityDraft: Dispatch<SetStateAction<IdentityDraft | null>>;
  createIdentity: () => Promise<void>;
  sourceLocationId: string;
  setSourceLocationId: Dispatch<SetStateAction<string>>;
  sourceOptions: FieldCatalogPart["locations"];
  selectedReceiptId: string;
  setSelectedReceiptId: Dispatch<SetStateAction<string>>;
  selectedReceipt: FieldOpenReceipt | null;
  truckItemById: Map<string, FieldTruckInventoryItem>;
  handleUse: (partId: string) => Promise<void>;
  handleReturn: (use: FieldRecentPartUse) => Promise<void>;
  resolveCode: (code: string) => Promise<void>;
  transferToTruck: () => Promise<void>;
  receiveToTruck: () => Promise<void>;
};

export default function MobileTruckInventoryScreen(props: Props) {
  const {
    snapshot,
    online,
    view,
    setView,
    loading,
    busy,
    error,
    query,
    load,
    selectedTruckId,
    onTruckChange,
  } = props;
  const tabs: Array<{ key: TruckInventoryView; label: string; icon: typeof Boxes }> = [
    { key: "stock", label: "Truck stock", icon: Boxes },
    { key: "load", label: "Transfer", icon: MoveRight },
    { key: "receive", label: "Receive", icon: PackageCheck },
    { key: "history", label: "Used", icon: ClipboardList },
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl space-y-4 px-3 py-4 text-[color:var(--theme-text-primary)] sm:px-4">
      <header className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href="/mobile/service"
              className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--theme-text-muted)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Field Service
            </Link>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-extrabold">
              <Truck className="h-6 w-6 text-[color:var(--accent-copper)]" /> Truck inventory
            </h1>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Receive or transfer onto the truck, then scan and use the same canonical part on the call.
            </p>
          </div>
          <button
            type="button"
            className={actionClass}
            disabled={loading || busy || !online}
            onClick={() => void load(query)}
            aria-label="Refresh truck inventory"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1">
            {snapshot?.truck
              ? `${snapshot.truck.name}${snapshot.truck.unitNumber ? ` · ${snapshot.truck.unitNumber}` : ""}`
              : "No truck assigned"}
          </span>
          <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1">
            {snapshot?.visit ? `Call · ${snapshot.visit.status.replaceAll("_", " ")}` : "No active call"}
          </span>
          {!online ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200">
              <WifiOff className="h-3.5 w-3.5" /> Offline snapshot
            </span>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      {snapshot?.canManageParts && (snapshot.trucks ?? []).length > 0 ? (
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3">
          <label className="text-sm font-semibold">
            Service truck
            <select
              value={selectedTruckId}
              onChange={(event) => onTruckChange(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
            >
              <option value="">Select service truck</option>
              {(snapshot.trucks ?? []).map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.name}{truck.unitNumber ? ` · ${truck.unitNumber}` : ""}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      <nav className="grid grid-cols-4 gap-2" aria-label="Truck inventory views">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={[
              "min-h-16 rounded-2xl border px-2 py-2 text-xs font-bold",
              view === key
                ? "border-[color:var(--accent-copper)] bg-[color:var(--theme-surface-panel)]"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]",
            ].join(" ")}
          >
            <Icon className="mx-auto mb-1 h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {loading && !snapshot ? (
        <div className="flex min-h-48 items-center justify-center rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : null}

      {snapshot && !snapshot.truck ? (
        <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-6 text-center">
          <Truck className="mx-auto h-8 w-8 text-[color:var(--theme-text-muted)]" />
          <h2 className="mt-3 text-lg font-bold">Assign a service truck</h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            The assigned truck must have its canonical stock location enabled in Field Service setup.
          </p>
        </section>
      ) : null}

      {snapshot?.truck && view === "stock" ? <TruckStockPanel {...props} snapshot={snapshot} /> : null}
      {snapshot?.truck && view === "load" ? <TruckLoadPanel {...props} snapshot={snapshot} /> : null}
      {snapshot?.truck && view === "receive" ? <TruckReceivePanel {...props} snapshot={snapshot} /> : null}
      {snapshot?.truck && view === "history" ? <TruckHistoryPanel {...props} snapshot={snapshot} /> : null}
    </main>
  );
}
