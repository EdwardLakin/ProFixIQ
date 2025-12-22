

import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

const In = z.object({ workOrderId: z.string().uuid() });
export type GenerateInvoiceHtmlIn = z.infer<typeof In>;

const Out = z.object({ html: z.string() });
export type GenerateInvoiceHtmlOut = z.infer<typeof Out>;

type WorkOrderRow = { id: string; created_at: string | null; status: string | null; shop_id: string | null; vehicle_id: string | null; customer_id: string | null; };
type VehicleRow   = { year: number | null; make: string | null; model: string | null; vin: string | null; license_plate: string | null; };
type CustomerRow  = { name: string | null; email: string | null; };
type QuoteLineRow = { id: string; title: string | null; description: string | null; labor_rate: number | null; labor_time: number | null; parts_cost: number | null; quantity: number | null; total: number | null; part_price: number | null; name: string | null; };

function isWorkOrderRow(x: unknown): x is WorkOrderRow { return !!x && typeof (x as { id?: unknown }).id === "string"; }
function isVehicleRow(x: unknown): x is VehicleRow { return !!x && "vin" in (x as object); }
function isCustomerRow(x: unknown): x is CustomerRow { return !!x && ("name" in (x as object) || "email" in (x as object)); }
function isQuoteLineArray(x: unknown): x is QuoteLineRow[] { return Array.isArray(x); }
function fmtDate(iso: string | null): string { if (!iso) return ""; try { return new Date(iso).toLocaleString(); } catch { return ""; } }

export const toolGenerateInvoiceHtml: ToolDef<GenerateInvoiceHtmlIn, GenerateInvoiceHtmlOut> = {
  name: "generate_invoice_html",
  description: "Builds a styled HTML invoice for a work order from quote_lines.",
  inputSchema: In,
  outputSchema: Out,
  async run(input, ctx) {
    const supabase = getServerSupabase();

    const woRes = await supabase
      .from("work_orders")
      .select("id, created_at, status, shop_id, vehicle_id, customer_id")
      .eq("id", input.workOrderId)
      .eq("shop_id", ctx.shopId)
      .single();
    if (woRes.error || !isWorkOrderRow(woRes.data)) throw new Error(woRes.error?.message ?? "work order not found");
    const wo = woRes.data;

    let vehicle: VehicleRow | null = null;
    if (wo.vehicle_id) {
      const v = await supabase.from("vehicles").select("year, make, model, vin, license_plate").eq("id", wo.vehicle_id).maybeSingle();
      if (v.error) throw new Error(v.error.message);
      vehicle = v.data && isVehicleRow(v.data) ? v.data : null;
    }

    let customer: CustomerRow | null = null;
    if (wo.customer_id) {
      const c = await supabase.from("customers").select("name, email").eq("id", wo.customer_id).maybeSingle();
      if (c.error) throw new Error(c.error.message);
      customer = c.data && isCustomerRow(c.data) ? c.data : null;
    }

    const q = await supabase
      .from("quote_lines")
      .select("id, title, description, labor_rate, labor_time, parts_cost, quantity, total, part_price, name")
      .eq("work_order_id", wo.id)
      .order("created_at", { ascending: true });
    if (q.error) throw new Error(q.error.message);
    const lines: QuoteLineRow[] = isQuoteLineArray(q.data) ? q.data : [];

    const num = (x: number | null | undefined) => (typeof x === "number" ? x : 0);
    const rows = lines.map(l => {
      const labor = num(l.labor_rate) * num(l.labor_time);
      const parts = num(l.parts_cost) > 0 ? num(l.parts_cost) : num(l.part_price) * num(l.quantity);
      const total = typeof l.total === "number" ? l.total : labor + parts;
      return {
        title: l.title ?? l.name ?? "Line",
        description: l.description ?? "",
        laborHours: num(l.labor_time),
        laborRate: num(l.labor_rate),
        partsCost: parts,
        total
      };
    });

    const laborTotal = rows.reduce((s, r) => s + r.laborRate * r.laborHours, 0);
    const partsTotal = rows.reduce((s, r) => s + r.partsCost, 0);
    const grandTotal = rows.reduce((s, r) => s + r.total, 0) || (laborTotal + partsTotal);

    const woHeader = (fmtDate(wo.created_at) ? `Work Order: ${wo.id} • ${fmtDate(wo.created_at)}` : `Work Order: ${wo.id}`);
    const vehicleLine = `${vehicle?.year ?? ""} ${vehicle?.make ?? ""} ${vehicle?.model ?? ""}`.trim();

    const html =
      '<!doctype html>' +
      '<html><head><meta charset="utf-8" />' +
      `<title>Invoice #${wo.id}</title>` +
      '<style>' +
      'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:24px;background:#f6f7f9;}' +
      '.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;max-width:720px;margin:auto;}' +
      '.row{display:flex;gap:16px;flex-wrap:wrap}.muted{color:#6b7280;font-size:12px}' +
      'table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}.total{font-weight:700}' +
      '</style></head><body>' +
      '<div class="card">' +
      '<h2>Invoice</h2>' +
      `<div class="muted">${woHeader}</div>` +
      '<div class="row" style="margin-top:12px">' +
      `<div><strong>Customer</strong><br/>${customer?.name ?? ""}<br/>${customer?.email ?? ""}</div>` +
      `<div><strong>Vehicle</strong><br/>${vehicleLine}<br/>VIN: ${vehicle?.vin ?? ""} • Plate: ${vehicle?.license_plate ?? ""}</div>` +
      '</div>' +
      '<table><thead><tr><th>Description</th><th>Labor</th><th>Parts</th><th>Line Total</th></tr></thead><tbody>' +
      rows.map(l =>
        '<tr>' +
        `<td><div><strong>${l.title}</strong></div><div class="muted">${l.description}</div></td>` +
        `<td>${l.laborHours.toFixed(2)}h @ $${l.laborRate.toFixed(2)}/h = $${(l.laborRate*l.laborHours).toFixed(2)}</td>` +
        `<td>$${l.partsCost.toFixed(2)}</td>` +
        `<td>$${l.total.toFixed(2)}</td>` +
        '</tr>'
      ).join("") +
      '</tbody><tfoot>' +
      `<tr><td></td><td class="total">Labor</td><td></td><td class="total">$${laborTotal.toFixed(2)}</td></tr>` +
      `<tr><td></td><td class="total">Parts</td><td></td><td class="total">$${partsTotal.toFixed(2)}</td></tr>` +
      `<tr><td></td><td class="total">Total</td><td></td><td class="total">$${grandTotal.toFixed(2)}</td></tr>` +
      '</tfoot></table>' +
      `<p class="muted">Status: ${wo.status ?? ""}</p>` +
      '</div></body></html>';

    return { html };
  }
};
