// features/work-orders/app/work-orders/[id]/page.tsx
// Server Component (no "use client")
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { format } from "date-fns";
import dynamic from "next/dynamic";

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

// ---------- Client islands ----------
const MenuQuickAdd = dynamic(
  () => import("@work-orders/components/MenuQuickAdd").then((m) => m.MenuQuickAdd),
  { loading: () => <div className="text-sm text-neutral-400">Loading quick-add…</div> },
);

const SuggestedQuickAdd = dynamic(
  () => import("@work-orders/components/SuggestedQuickAdd").then((m) => m.default),
  { loading: () => <div className="text-sm text-neutral-400">Loading suggestions…</div> },
);

const WorkOrderInvoiceDownloadButton = dynamic(
  () =>
    import("@work-orders/components/WorkOrderInvoiceDownloadButton").then(
      (m) => m.WorkOrderInvoiceDownloadButton,
    ),
  { loading: () => <div className="text-sm text-neutral-400">Preparing invoice…</div> },
);

const NewLineFormIsland = dynamic(
  () => import("@work-orders/components/NewLineFormIsland"),
  { loading: () => <div className="text-sm text-neutral-400">Loading form…</div> },
);

export const revalidate = 0;

// ---------- Types ----------
type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type WorkOrderWithMaybeNotes = WorkOrder & { notes?: string | null };

// ---------- UI helpers ----------
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
function chipClass(s: string | null | undefined): string {
  const key = (s ?? "awaiting") as keyof typeof statusBadge;
  return `text-xs px-2 py-1 rounded ${statusBadge[key] ?? "bg-gray-200 text-gray-800"}`;
}

// ---------- Data loader ----------
async function getData(id: string) {
  const supabase = createServerComponentClient<DB>({ cookies });

  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (woErr || !wo) return { wo: null as WorkOrder | null };

  const { data: lines } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("work_order_id", wo.id)
    .order("created_at", { ascending: true });

  let vehicle: Vehicle | null = null;
  if (wo.vehicle_id) {
    const { data: v } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", wo.vehicle_id)
      .single();
    vehicle = v ?? null;
  }

  let customer: Customer | null = null;
  if (wo.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("*")
      .eq("id", wo.customer_id)
      .single();
    customer = c ?? null;
  }

  return {
    wo,
    lines: (lines ?? []) as WorkOrderLine[],
    vehicle,
    customer,
  };
}

// ---------- Page ----------
export default async function WorkOrderPage(
  props: { params: { id: string } }
): Promise<JSX.Element> {
  const { id } = props.params;
  if (!id) notFound();

  const { wo, lines = [], vehicle, customer } = await getData(id);
  if (!wo) notFound();

  const notes: string | null = ((wo as WorkOrderWithMaybeNotes).notes ?? null) || null;

  const suggJobId: string | null =
    lines.find((l) => (l.status ?? "").toLowerCase() === "in_progress")?.id ??
    lines.find((l) => (l.status ?? "").toLowerCase() === "awaiting")?.id ??
    lines.find((l) => (l.status ?? "").toLowerCase() === "queued")?.id ??
    lines[0]?.id ??
    null;

  return (
    <div className="p-4 sm:p-6 text-white">
      <PreviousPageButton to="/work-orders" />

      {/* Header */}
      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Work Order #{wo.id.slice(0, 8)}</h1>
          <span className={chipClass(wo.status)}>{(wo.status ?? "awaiting").replaceAll("_", " ")}</span>
        </div>

        <div className="mt-2 grid gap-2 text-sm text-neutral-300 sm:grid-cols-3">
          <div>
            <div className="text-neutral-400">Created</div>
            <div>{wo.created_at ? format(new Date(wo.created_at), "PPpp") : "—"}</div>
          </div>
          <div>
            <div className="text-neutral-400">Type</div>
            <div>{wo.type ?? "—"}</div>
          </div>
          <div>
            <div className="text-neutral-400">Notes</div>
            <div className="truncate">{notes ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT */}
        <div className="space-y-6">
          {/* Vehicle & Customer */}
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h2 className="mb-1 text-lg font-semibold">Vehicle</h2>
                {vehicle ? (
                  <>
                    <p>
                      {(vehicle.year ?? "").toString()} {vehicle.make ?? ""} {vehicle.model ?? ""}
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

          {/* Lines */}
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Jobs in this Work Order</h2>
            </div>

            {/* Add Job Line */}
            <details className="mb-4 rounded border border-neutral-800 bg-neutral-950 p-3">
              <summary className="cursor-pointer text-sm text-orange-400">Add Job Line</summary>
              <div className="mt-3">
                <NewLineFormIsland
                  workOrderId={wo.id}
                  vehicleId={vehicle?.id ?? null}
                  defaultJobType={(wo.type as "inspection" | "maintenance" | "diagnosis") ?? null}
                />
              </div>
            </details>

            {lines.length === 0 ? (
              <p className="text-sm text-neutral-400">No lines yet.</p>
            ) : (
              <div className="space-y-2">
                {lines.map((ln) => (
                  <div key={ln.id} className="rounded border border-neutral-800 bg-neutral-950 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {ln.description || ln.complaint || "Untitled job"}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                          {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} • Status:{" "}
                          {(ln.status ?? "awaiting").replaceAll("_", " ")}
                        </div>
                        {(ln.complaint || ln.cause || ln.correction) && (
                          <div className="mt-1 text-xs text-neutral-400">
                            {ln.complaint ? `Cmpl: ${ln.complaint}  ` : ""}
                            {ln.cause ? `| Cause: ${ln.cause}  ` : ""}
                            {ln.correction ? `| Corr: ${ln.correction}` : ""}
                          </div>
                        )}
                      </div>
                      <span className={chipClass(ln.status)}>
                        {(ln.status ?? "awaiting").replaceAll("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoice */}
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="mb-2 font-semibold">Invoice</h3>
            <WorkOrderInvoiceDownloadButton
              workOrderId={wo.id}
              lines={lines.map((l) => ({
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
                name: [customer?.first_name ?? "", customer?.last_name ?? ""].filter(Boolean).join(" "),
                phone: customer?.phone ?? "",
                email: customer?.email ?? "",
              }}
            />
          </div>
        </div>

        {/* RIGHT */}
        <aside className="space-y-6">
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            {suggJobId ? (
              <SuggestedQuickAdd
                jobId={suggJobId}
                workOrderId={wo.id}
                vehicleId={vehicle?.id ?? null}
              />
            ) : (
              <div className="text-sm text-neutral-400">Add a job line to enable AI suggestions.</div>
            )}
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <MenuQuickAdd workOrderId={wo.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}