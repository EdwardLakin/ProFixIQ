import Link from "next/link";

type Currency = "CAD" | "USD";

type WorkOrderLite = {
  id: string;
  custom_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  invoice_total?: number | string | null;
  labor_total?: number | string | null;
  parts_total?: number | string | null;
};

type VehicleLite = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  unit_number?: string | null;
  mileage?: string | number | null;
  color?: string | null;
  engine_hours?: string | number | null;
};

type CustomerLite = {
  name?: string | null;
  business_name?: string | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

type ShopLite = {
  name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  street?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

export type WorkOrderViewerLine = {
  id: string;
  line_no?: number | null;
  description?: string | null;
  complaint?: string | null;
  cause?: string | null;
  correction?: string | null;
  labor_time?: string | number | null;
};

export type WorkOrderViewerPart = {
  id: string;
  lineId?: string;
  name: string;
  qty: number;
  unitCost: number;
  totalCost: number;
  sku?: string;
  partNumber?: string;
  unit?: string;
};

type Props = {
  kind: "portal" | "internal";
  workOrder: WorkOrderLite;
  currency: Currency;

  vehicle?: VehicleLite;
  customer?: CustomerLite;
  shop?: ShopLite;

  lines: WorkOrderViewerLine[];
  parts: WorkOrderViewerPart[];

  backHref: string;
  title: string;
  subtitle?: string;

  showPay?: boolean;
  paySlot?: React.ReactNode;
  invoicePdfUrl?: string | null;
};

const COPPER = "#C57A4A";

function safeNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(
  value: number | null | undefined,
  currency: Currency,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function compactCsv(parts: Array<string | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(", ");
}

function vehicleLabel(v?: VehicleLite): string {
  if (!v) return "—";
  const year = v.year != null ? String(v.year) : "";
  const make = (v.make ?? "").trim();
  const model = (v.model ?? "").trim();
  const main = [year, make, model].filter(Boolean).join(" ").trim();
  const plate = (v.license_plate ?? "").trim();
  const unit = (v.unit_number ?? "").trim();
  const extra = [unit ? `Unit ${unit}` : "", plate ? `Plate ${plate}` : ""]
    .filter(Boolean)
    .join(" • ");
  return [main || "Vehicle", extra].filter(Boolean).join(" — ");
}

function addressLine(
  street?: string | null,
  city?: string | null,
  province?: string | null,
  postal?: string | null,
): string {
  const a = (street ?? "").trim();
  const b = compactCsv([
    (city ?? "").trim() || undefined,
    (province ?? "").trim() || undefined,
    (postal ?? "").trim() || undefined,
  ]);
  const out = compactCsv([a || undefined, b || undefined]);
  return out.length ? out : "—";
}

export default function WorkOrderViewer({
  kind,
  workOrder,
  currency,
  vehicle,
  customer,
  shop,
  lines,
  parts,
  backHref,
  title,
  subtitle,
  showPay,
  paySlot,
  invoicePdfUrl,
}: Props) {
  const woId = workOrder.id;
  const titleLabel = (workOrder.custom_id ?? "").trim()
    ? String(workOrder.custom_id).trim()
    : `Work Order ${woId.slice(0, 8)}…`;

  const woInvoiceTotal = safeNumberOrNull(workOrder.invoice_total);
  const woLabor = safeNumberOrNull(workOrder.labor_total);
  const woParts = safeNumberOrNull(workOrder.parts_total);

  const total =
    woInvoiceTotal != null
      ? woInvoiceTotal
      : woLabor != null || woParts != null
        ? (woLabor ?? 0) + (woParts ?? 0)
        : null;

  const partsGrandTotal = parts.reduce((acc, p) => acc + safeNumber(p.totalCost), 0);

  // group parts per line + unassigned
  const partsByLine = new Map<string, WorkOrderViewerPart[]>();
  const unassignedParts: WorkOrderViewerPart[] = [];

  for (const p of parts) {
    if (p.lineId) {
      const arr = partsByLine.get(p.lineId) ?? [];
      arr.push(p);
      partsByLine.set(p.lineId, arr);
    } else {
      unassignedParts.push(p);
    }
  }

  const partCount = parts.reduce((acc, p) => acc + (Number.isFinite(p.qty) ? p.qty : 0), 0);

  return (
    <div className="min-h-screen px-4 text-foreground bg-background bg-[var(--theme-gradient-panel)]">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center py-10">
        <div className="var(--theme-gradient-panel)">

          {/* Header */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)] hover:text-[color:var(--theme-text-primary)]"
            >
              <span aria-hidden className="text-base leading-none">←</span>
              Back
            </Link>

            <div
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]"
              style={{ color: COPPER }}
            >
              <span>{title}</span>
              <span className="text-[color:var(--theme-text-muted)]">•</span>
              <span className="text-[color:var(--theme-text-secondary)]">{titleLabel}</span>
            </div>
          </div>

          <div className="mb-6 space-y-1">
            <h1
              className="text-2xl font-semibold text-[color:var(--theme-text-primary)] sm:text-3xl"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              {titleLabel}
            </h1>
            <p className="text-xs text-[color:var(--theme-text-secondary)] sm:text-sm">
              {subtitle ?? (kind === "portal" ? "Read-only work order view." : "Work order viewer (read-only).")}
            </p>
          </div>

          {/* Top meta */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Total
              </div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                {formatCurrency(total ?? null, currency)}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                Currency: {currency}
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Status
              </div>
              <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                {(workOrder.status ?? "—") as string}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                Updated: {formatDate(workOrder.updated_at ?? workOrder.created_at)}
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Parts total (allocations)
              </div>
              <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                {formatCurrency(partsGrandTotal, currency)}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                {parts.length === 0 ? "No allocations" : `${parts.length} items • Qty ${partCount}`}
              </div>
            </div>
          </div>

          {/* Optional actions */}
          {showPay ? <div className="mb-6">{paySlot ?? null}</div> : null}

          {invoicePdfUrl ? (
            <div className="mb-6">
              <a
                href={invoicePdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)]"
              >
                <span>View PDF</span>
              </a>
            </div>
          ) : null}

          {/* Party + Vehicle */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Customer
              </div>
              <div className="mt-2 space-y-1 text-sm text-[color:var(--theme-text-primary)]">
                <div className="font-medium text-[color:var(--theme-text-primary)]">
                  {compactCsv([
                    (customer?.business_name ?? "").trim() || undefined,
                    (customer?.name ?? "").trim() || undefined,
                  ]) || "—"}
                </div>
                <div className="text-[12px] text-[color:var(--theme-text-secondary)]">
                  {compactCsv([
                    (customer?.phone ?? "").trim() || undefined,
                    (customer?.email ?? "").trim() || undefined,
                  ]) || "—"}
                </div>
                <div className="text-[12px] text-[color:var(--theme-text-secondary)]">
                  {addressLine(customer?.street, customer?.city, customer?.province, customer?.postal_code)}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Vehicle
              </div>
              <div className="mt-2 space-y-1 text-sm text-[color:var(--theme-text-primary)]">
                <div className="font-medium text-[color:var(--theme-text-primary)]">{vehicleLabel(vehicle)}</div>
                <div className="text-[12px] text-[color:var(--theme-text-secondary)]">
                  VIN: {(vehicle?.vin ?? "").trim() || "—"}
                </div>
                <div className="text-[12px] text-[color:var(--theme-text-secondary)]">
                  {compactCsv([
                    vehicle?.mileage != null ? `Mileage ${String(vehicle.mileage)}` : undefined,
                    vehicle?.engine_hours != null ? `Engine Hrs ${String(vehicle.engine_hours)}` : undefined,
                    (vehicle?.color ?? "").trim() || undefined,
                  ]) || "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Lines */}
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Line Items
              </div>
              <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                {lines.length === 0 ? "No line items recorded yet" : `${lines.length} items`}
              </div>
            </div>

            {lines.length > 0 ? (
              <div className="space-y-2">
                {lines.map((line) => {
                  const label =
                    (line.description ?? "").trim() ||
                    (line.complaint ?? "").trim() ||
                    "Line item";

                  const lp = partsByLine.get(line.id) ?? [];

                  return (
                    <div
                      key={line.id}
                      className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
                            {label}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                            Line #{line.line_no ?? "—"}
                            {line.labor_time != null ? ` • ${String(line.labor_time)} hr` : ""}
                          </div>
                        </div>
                      </div>

                      {(line.cause ?? "").trim().length ||
                      (line.correction ?? "").trim().length ? (
                        <div className="mt-2 space-y-1 text-[12px] text-[color:var(--theme-text-secondary)]">
                          {(line.cause ?? "").trim().length ? (
                            <div>
                              <span className="text-[color:var(--theme-text-muted)]">Cause:</span>{" "}
                              <span className="text-[color:var(--theme-text-primary)]">{String(line.cause)}</span>
                            </div>
                          ) : null}
                          {(line.correction ?? "").trim().length ? (
                            <div>
                              <span className="text-[color:var(--theme-text-muted)]">Correction:</span>{" "}
                              <span className="text-[color:var(--theme-text-primary)]">{String(line.correction)}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {lp.length > 0 ? (
                        <div className="mt-3 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                            Parts (allocations)
                          </div>
                          <div className="mt-2 space-y-1">
                            {lp.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-baseline justify-between gap-2 text-sm"
                              >
                                <div className="min-w-0 text-[color:var(--theme-text-primary)]">
                                  <span className="text-[color:var(--theme-text-muted)]">x{p.qty}</span>{" "}
                                  {p.name}
                                  {p.partNumber ? (
                                    <span className="text-[color:var(--theme-text-muted)]"> ({p.partNumber})</span>
                                  ) : null}
                                </div>
                                <div className="whitespace-nowrap font-semibold text-[color:var(--theme-text-primary)]">
                                  {formatCurrency(p.totalCost, currency)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-[color:var(--theme-text-secondary)]">
                Line items will appear here when they’re added to the work order.
              </div>
            )}
          </div>

          {/* Parts list */}
          <div className="mt-6 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4 sm:px-5 sm:py-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Parts
              </div>
              <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                {parts.length === 0 ? "No parts recorded" : `${parts.length} parts • Qty ${partCount}`}
              </div>
            </div>

            {parts.length > 0 ? (
              <div className="space-y-2">
                {unassignedParts.length > 0 ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200">
                    Some parts aren’t linked to a specific line item (missing{" "}
                    <span className="font-mono">work_order_line_id</span>). They’re
                    listed here anyway.
                  </div>
                ) : null}

                {parts.map((p) => {
                  const meta = compactCsv([
                    p.partNumber,
                    p.sku,
                    p.unit ? `Unit: ${p.unit}` : undefined,
                    p.lineId ? `Line: ${p.lineId.slice(0, 6)}…` : undefined,
                  ]);

                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">{p.name}</div>
                        {meta.length ? (
                          <div className="text-[11px] text-[color:var(--theme-text-muted)]">{meta}</div>
                        ) : null}
                        <div className="text-[11px] text-[color:var(--theme-text-muted)]">Qty: {p.qty}</div>
                      </div>

                      <div className="text-right text-xs text-[color:var(--theme-text-secondary)]">
                        <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                          Unit: {formatCurrency(p.unitCost, currency)}
                        </div>
                        <div className="text-sm font-semibold">
                          {formatCurrency(p.totalCost, currency)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-[color:var(--theme-text-secondary)]">
                Parts will appear here from allocations when they’re added to the work order.
              </div>
            )}
          </div>

          {/* Footer shop info (optional) */}
          {shop ? (
            <div className="mt-6 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Shop
              </div>
              <div className="mt-2 text-sm text-[color:var(--theme-text-primary)]">
                <div className="font-medium text-[color:var(--theme-text-primary)]">
                  {(shop.name ?? "").trim() || "—"}
                </div>
                <div className="text-[12px] text-[color:var(--theme-text-secondary)]">
                  {compactCsv([
                    (shop.phone_number ?? "").trim() || undefined,
                    (shop.email ?? "").trim() || undefined,
                  ]) || "—"}
                </div>
                <div className="text-[12px] text-[color:var(--theme-text-secondary)]">
                  {addressLine(shop.street, shop.city, shop.province, shop.postal_code)}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
