// features/work-orders/app/work-orders/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";
import { WorkOrderInvoiceDownloadButton } from "@work-orders/components/WorkOrderInvoiceDownloadButton";
import { NewWorkOrderLineForm } from "@work-orders/components/NewWorkOrderLineForm";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type WorkOrderWithMaybeNotes = WorkOrder & { notes?: string | null };

type ParamsShape = Record<string, string | string[]>;
function paramToString(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

const statusBadge: Record<string, string> = {
  awaiting_approval: "bg-blue-100 text-blue-800",
  awaiting: "bg-blue-100 text-blue-800",
  queued: "bg-blue-100 text-blue-800",
  in_progress: "bg-orange-100 text-orange-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  planned: "bg-purple-100 text-purple-800",
  new: "bg-gray-200 text-gray-800",
  completed: "bg-green-100 text-green-800",
};

// ---- tiny local error boundary ---------------------------------------------
function SafeSection({ children }: { children: React.ReactNode }) {
  const [err, setErr] = useState<Error | null>(null);
  if (err) {
    return (
      <div className="mt-6 rounded border border-red-700 bg-red-900/20 p-4 text-red-200">
        <div className="font-semibold">This section failed to render.</div>
        <div className="text-xs opacity-80">{err.message}</div>
      </div>
    );
  }
  return (
    <ErrorCatcher onError={setErr}>
      {children}
    </ErrorCatcher>
  );
}
function ErrorCatcher({
  onError,
  children,
}: {
  onError: (e: Error) => void;
  children: React.ReactNode;
}) {
  try {
    // eslint-disable-next-line react/jsx-no-useless-fragment
    return <>{children}</>;
  } catch (e) {
    onError(e as Error);
    return null;
  }
}
// ----------------------------------------------------------------------------

export default function WorkOrderPage(): JSX.Element {
  const params = useParams();
  const woId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const safeFormat = (iso?: string | null) => {
    try {
      return iso ? format(new Date(iso), "PPpp") : "—";
    } catch {
      return "—";
    }
  };

  const fetchAll = useCallback(async () => {
    if (!woId) return;
    setLoading(true);
    setFatal(null);

    try {
      // 1) Work order
      const { data: woRow, error: woErr } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", woId)
        .maybeSingle();

      if (woErr) throw woErr;
      if (!woRow) {
        setWo(null);
        setLines([]);
        setVehicle(null);
        setCustomer(null);
        setLoading(false);
        return;
      }
      setWo(woRow);

      // 2) Lines
      const { data: lineRows } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", woRow.id)
        .order("created_at", { ascending: true });
      setLines(lineRows ?? []);

      // 3) Vehicle
      if (woRow.vehicle_id) {
        const { data: v } = await supabase
          .from("vehicles")
          .select("*")
          .eq("id", woRow.vehicle_id)
          .maybeSingle();
        setVehicle(v ?? null);
      } else {
        setVehicle(null);
      }

      // 4) Customer
      if (woRow.customer_id) {
        const { data: c } = await supabase
          .from("customers")
          .select("*")
          .eq("id", woRow.customer_id)
          .maybeSingle();
        setCustomer(c ?? null);
      } else {
        setCustomer(null);
      }
    } catch (e) {
      console.error("[WO page] fetchAll failed:", e);
      setFatal(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [supabase, woId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const chipClass = (s: string | null): string => {
    const key = (s ?? "awaiting") as keyof typeof statusBadge;
    return `text-xs px-2 py-1 rounded ${statusBadge[key] ?? "bg-gray-200 text-gray-800"}`;
  };

  // Choose a representative job id for AI suggestions
  const suggestedJobId: string | null = useMemo(() => {
    if (!lines.length) return null;
    const byStatus = (st: string) =>
      lines.find((l) => (l.status ?? "").toLowerCase() === st)?.id ?? null;

    return (
      byStatus("in_progress") ||
      byStatus("awaiting") ||
      byStatus("queued") ||
      lines[0]?.id ||
      null
    );
  }, [lines]);

  // Sort / group lines by job_type priority: diagnosis, inspection, maintenance, repair
  const sortedLines = useMemo(() => {
    const priority: Record<string, number> = { diagnosis: 1, inspection: 2, maintenance: 3, repair: 4 };
    return [...lines].sort((a, b) => {
      const pa = priority[String(a.job_type ?? "repair")] ?? 999;
      const pb = priority[String(b.job_type ?? "repair")] ?? 999;
      if (pa !== pb) return pa - pb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }, [lines]);

  if (!woId) {
    return <div className="p-6 text-red-500">Missing work order id.</div>;
  }

  const notes: string | null =
    ((wo as WorkOrderWithMaybeNotes | null)?.notes ?? null) || null;

  return (
    <div className="p-4 sm:p-6">
      <PreviousPageButton to="/work-orders" />

      {loading && <div className="mt-6 text-white">Loading…</div>}

      {fatal && (
        <div className="mt-6 rounded border border-red-700 bg-red-900/20 p-4 text-red-200">
          <div className="font-semibold mb-1">Failed to load work order</div>
          <div className="text-xs opacity-80">{fatal}</div>
        </div>
      )}

      {!loading && !fatal && !wo && (
        <div className="mt-6 text-red-500">Work order not found.</div>
      )}

      {!loading && !fatal && wo && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] text-white">
          {/* LEFT: main */}
          <div className="space-y-6">
            {/* Header */}
            <SafeSection>
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-semibold">
                    Work Order {wo.custom_id ?? `#${(wo.id ?? "").slice(0, 8)}`}
                  </h1>
                  <span className={chipClass(wo.status ?? null)}>
                    {(wo.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 text-sm text-neutral-300 sm:grid-cols-3">
                  <div>
                    <div className="text-neutral-400">Created</div>
                    <div>{safeFormat(wo.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-neutral-400">Notes</div>
                    <div className="truncate">{notes ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-neutral-400">WO ID</div>
                    <div className="truncate">{wo.id ?? "—"}</div>
                  </div>
                </div>
              </div>
            </SafeSection>

            {/* Vehicle & Customer */}
            <SafeSection>
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h2 className="mb-1 text-lg font-semibold">Vehicle</h2>
                    {vehicle ? (
                      <>
                        <p>
                          {String(vehicle.year ?? "")} {vehicle.make ?? ""} {vehicle.model ?? ""}
                        </p>
                        <p className="text-sm text-neutral-400">
                          VIN: {vehicle.vin ?? "—"} • Plate: {vehicle.license_plate ?? "—"}
                        </p>
                      </>
                    ) : (
                      <p className="text-neutral-400">—</p>
                    )}
                  </div>
                  <div>
                    <h2 className="mb-1 text-lg font-semibold">Customer</h2>
                    {customer ? (
                      <>
                        <p>
                          {[customer.first_name ?? "", customer.last_name ?? ""]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </p>
                        <p className="text-sm text-neutral-400">
                          {customer.phone ?? "—"} {customer.email ? `• ${customer.email}` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-neutral-400">—</p>
                    )}
                  </div>
                </div>
              </div>
            </SafeSection>

            {/* Jobs / Lines (sorted by job_type priority) */}
            <SafeSection>
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Jobs in this Work Order</h2>

                  <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="rounded bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm hover:border-orange-500"
                    aria-expanded={showAddForm}
                  >
                    {showAddForm ? "Hide Add Job Line" : "Add Job Line"}
                  </button>
                </div>

                {showAddForm && (
                  <NewWorkOrderLineForm
                    workOrderId={wo.id}
                    vehicleId={vehicle?.id ?? null}
                    defaultJobType={null}
                    onCreated={() => fetchAll()}
                  />
                )}

                {sortedLines.length === 0 ? (
                  <p className="text-sm text-neutral-400">No lines yet.</p>
                ) : (
                  <div className="space-y-2">
                    {sortedLines.map((ln) => (
                      <div
                        key={ln.id}
                        className="rounded border border-neutral-800 bg-neutral-950 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {ln.description || ln.complaint || "Untitled job"}
                            </div>
                            <div className="text-xs text-neutral-400">
                              {String(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                              {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} • Status:{" "}
                              {String(ln.status ?? "awaiting").replaceAll("_", " ")}
                            </div>
                            {(ln.complaint || ln.cause || ln.correction) && (
                              <div className="text-xs text-neutral-400 mt-1">
                                {ln.complaint ? `Cmpl: ${ln.complaint}  ` : ""}
                                {ln.cause ? `| Cause: ${ln.cause}  ` : ""}
                                {ln.correction ? `| Corr: ${ln.correction}` : ""}
                              </div>
                            )}
                          </div>
                          <span className={chipClass(ln.status ?? null)}>
                            {String(ln.status ?? "awaiting").replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SafeSection>

            {/* Invoice */}
            <SafeSection>
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <h3 className="mb-2 font-semibold">Invoice</h3>
                <WorkOrderInvoiceDownloadButton
                  workOrderId={wo.id}
                  lines={(lines ?? []).map((l) => ({
                    complaint: l.complaint ?? l.description ?? "",
                    cause: l.cause ?? "",
                    correction: l.correction ?? "",
                    tools: l.tools ?? "",
                    labor_time: typeof l.labor_time === "number" ? l.labor_time : 0,
                  }))}
                  vehicleInfo={{
                    year: vehicle?.year ? String(vehicle.year) : "",
                    make: vehicle?.make ?? "",
                    model: vehicle?.model ?? "",
                    vin: vehicle?.vin ?? "",
                  }}
                  customerInfo={{
                    name: [customer?.first_name ?? "", customer?.last_name ?? ""]
                      .filter(Boolean)
                      .join(" "),
                    phone: customer?.phone ?? "",
                    email: customer?.email ?? "",
                  }}
                />
              </div>
            </SafeSection>
          </div>

          {/* RIGHT: actions */}
          <aside className="space-y-6">
            <SafeSection>
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                {suggestedJobId ? (
                  <SuggestedQuickAdd
                    jobId={suggestedJobId}
                    workOrderId={wo.id}
                    vehicleId={vehicle?.id ?? null}
                  />
                ) : (
                  <div className="text-sm text-neutral-400">
                    Add a job line to enable AI suggestions.
                  </div>
                )}
              </div>
            </SafeSection>

            <SafeSection>
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <MenuQuickAdd workOrderId={wo.id} />
              </div>
            </SafeSection>
          </aside>
        </div>
      )}
    </div>
  );
}