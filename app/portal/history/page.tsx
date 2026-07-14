// /app/portal/history/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

import type { Database } from "@shared/types/types/supabase";
import { requirePortalCustomerActor, } from "@/features/portal/server/requirePortalActor";

type DB = Database;

type HistoryRow = DB["public"]["Tables"]["history"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type HistoryLite = Pick<
  HistoryRow,
  "id" | "customer_id" | "vehicle_id" | "service_date" | "description" | "notes" | "created_at"
>;

type VehicleLite = Pick<
  VehicleRow,
  "id" | "year" | "make" | "model" | "vin" | "license_plate" | "unit_number"
>;

function cardClass() {
  return "rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 backdrop-blur-md shadow-card";
}

function errorCardClass() {
  return "rounded-3xl border border-red-500/35 bg-red-900/20 p-4 text-sm text-red-100 backdrop-blur-md shadow-card";
}

function emptyCardClass() {
  return "rounded-3xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)] backdrop-blur-md shadow-card";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function historyLabel(row: HistoryLite): string {
  const desc = (row.description ?? "").trim();
  if (desc) return desc.length > 68 ? `${desc.slice(0, 68)}…` : desc;
  return `History ${row.id.slice(0, 8)}…`;
}

function vehicleLabel(v: VehicleLite | undefined): string {
  if (!v) return "Vehicle —";
  const year = v.year != null ? String(v.year) : "";
  const make = (v.make ?? "").trim();
  const model = (v.model ?? "").trim();
  const plate = (v.license_plate ?? "").trim();
  const unit = (v.unit_number ?? "").trim();

  const main = [year, make, model].filter(Boolean).join(" ").trim();
  const extra = [unit ? `Unit ${unit}` : "", plate ? `Plate ${plate}` : ""]
    .filter(Boolean)
    .join(" • ");

  return [main || "Vehicle", extra].filter(Boolean).join(" — ");
}

export default async function HistoryPage() {
  const supabase = createServerSupabaseRSC();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const customer = actor.customer;

    const { data: historyRows, error: historyErr } = await supabase
      .from("history")
      .select("id, customer_id, vehicle_id, service_date, description, notes, created_at")
      .eq("customer_id", customer.id)
      .order("service_date", { ascending: false })
      .limit(100)
      .returns<HistoryLite[]>();

    if (historyErr) throw new Error(historyErr.message);

    const history = Array.isArray(historyRows) ? historyRows : [];
    const vehicleIds = Array.from(
      new Set(
        history
          .map((item) => item.vehicle_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );

    const vehiclesById = new Map<string, VehicleLite>();

    if (vehicleIds.length > 0) {
      const { data: vRows, error: vErr } = await supabase
        .from("vehicles")
        .select("id, year, make, model, vin, license_plate, unit_number")
        .in("id", vehicleIds)
        .returns<VehicleLite[]>();

      if (!vErr) {
        for (const v of Array.isArray(vRows) ? vRows : []) {
          vehiclesById.set(v.id, v);
        }
      }
    }

    return (
      <div className="mx-auto max-w-3xl space-y-4 text-[color:var(--theme-text-primary)]">
        <header className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)]">
            Service history
          </h1>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            Read-only historical service records connected to your account.
          </p>

          <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-sky-400/25 to-transparent" />
        </header>

        {history.length === 0 ? (
          <div className={emptyCardClass()}>
            No service history yet. Once historical records are imported or service is archived, they will appear here.
          </div>
        ) : (
          <div className={cardClass()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Past service
              </div>
              <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                {history.length} item(s)
              </div>
            </div>

            <div className="space-y-2">
              {history.map((item) => {
                const v =
                  typeof item.vehicle_id === "string"
                    ? vehiclesById.get(item.vehicle_id)
                    : undefined;

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                          {historyLabel(item)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                          {vehicleLabel(v)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                          Service date:{" "}
                          <span className="text-[color:var(--theme-text-secondary)]">
                            {fmtDate(item.service_date ?? item.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200">
                        Read only
                      </div>
                    </div>

                    {item.notes ? (
                      <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-[11px] leading-relaxed text-[color:var(--theme-text-secondary)]">
                        {item.notes}
                      </pre>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load history";
    return (
      <div className="mx-auto max-w-xl space-y-3 text-[color:var(--theme-text-primary)]">
        <header className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)]">
            Service history
          </h1>
        </header>

        <div className={errorCardClass()}>
          <div className="font-semibold">Couldn’t load service history.</div>
          <div className="mt-1 text-xs text-red-100/90">{msg}</div>
          <div className="mt-3">
            <Link
              href="/portal"
              className="inline-flex items-center rounded-xl border border-red-300/30 bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs font-semibold text-red-50 hover:bg-[color:var(--theme-surface-inset)]"
            >
              Back to portal
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
