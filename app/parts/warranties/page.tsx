"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { v4 as uuidv4 } from "uuid";
import { format, addMonths, isBefore, differenceInDays } from "date-fns";
import { toast } from "sonner";

/* ----------------------------- Local Types ----------------------------- */
type UUID = string;

type Warranty = {
  id: UUID;
  shop_id: UUID;
  part_id: UUID;
  work_order_id: UUID | null;
  work_order_line_id: UUID | null;
  customer_id: UUID | null;
  vehicle_id: UUID | null;
  supplier_id: UUID | null;
  installed_at: string;
  warranty_months: number;
  expires_at: string;
  notes: string | null;
  created_at?: string | null;
};

type WarrantyClaimStatus = "open" | "approved" | "denied" | "replaced" | "closed";

type WarrantyClaim = {
  id: UUID;
  warranty_id: UUID;
  opened_at: string;
  status: WarrantyClaimStatus;
  supplier_rma: string | null;
  notes: string | null;
  created_at?: string | null;
};

type Lookups = {
  parts: Record<string, { name: string | null; sku: string | null }>;
  suppliers: Record<string, { name: string | null }>;
  customers: Record<string, { first_name: string | null; last_name: string | null }>;
  vehicles: Record<string, { year: number | null; make: string | null; model: string | null }>;
  work_orders: Record<string, { custom_id: string | null }>;
};

/* ----------------------------- UI Helpers ----------------------------- */
const outlineBtn =
  "font-header rounded border px-3 py-2 text-sm transition-colors";
const outlineNeutral = `${outlineBtn} border-neutral-700 text-neutral-200 hover:bg-neutral-800`;
const outlineInfo = `${outlineBtn} border-blue-600 text-blue-300 hover:bg-blue-900/20`;

type Tab = "active" | "expiring" | "expired" | "all";

/* ===================================================================== */
/*                               PAGE                                    */
/* ===================================================================== */
export default function WarrantiesPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [shopId, setShopId] = useState<string>("");
  const [ready, setReady] = useState(false);

  const [rows, setRows] = useState<Warranty[]>([]);
  const [claimsByWarranty, setClaimsByWarranty] = useState<Record<string, WarrantyClaim[]>>({});
  const [lookups, setLookups] = useState<Lookups>({
    parts: {},
    suppliers: {},
    customers: {},
    vehicles: {},
    work_orders: {},
  });

  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");

  // Modal state
  const [openReg, setOpenReg] = useState(false);
  const [openClaim, setOpenClaim] = useState<null | { warranty: Warranty }>(null);

  // Register form
  const [partId, setPartId] = useState("");
  const [months, setMonths] = useState<number>(12);
  const [installedAt, setInstalledAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState<string>("");
  const [woId, setWoId] = useState<string>("");
  const [woLineId, setWoLineId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Claim form
  const [claimStatus, setClaimStatus] = useState<WarrantyClaimStatus>("open");
  const [claimRma, setClaimRma] = useState("");
  const [claimNotes, setClaimNotes] = useState("");

  // Feature-detection (tables may not exist yet)
  const [hasTables, setHasTables] = useState<{ warranties: boolean; claims: boolean }>({
    warranties: true,
    claims: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setReady(true);
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const sid = String(prof?.shop_id ?? "");
        setShopId(sid);

        const w = await supabase.from("warranties").select("id").limit(1);
        const c = await supabase.from("warranty_claims").select("id").limit(1);
        setHasTables({
          warranties: !w.error,
          claims: !c.error,
        });

        if (!sid || w.error) {
          setReady(true);
          return;
        }

        await loadAll(sid);
      } finally {
        setReady(true);
      }
    })();
  }, [supabase]);

  const loadAll = async (sid: string) => {
    const { data, error } = await supabase
      .from("warranties")
      .select("*")
      .eq("shop_id", sid)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    const ws = (data ?? []) as Warranty[];
    setRows(ws);

    if (ws.length && hasTables.claims) {
      const ids = ws.map((w) => w.id);
      const { data: cs } = await supabase
        .from("warranty_claims")
        .select("*")
        .in("warranty_id", ids)
        .order("created_at", { ascending: false });
      const byW: Record<string, WarrantyClaim[]> = {};
      (cs ?? []).forEach((cRow) => {
        const wId = (cRow as WarrantyClaim).warranty_id;
        if (!byW[wId]) byW[wId] = [];
        byW[wId].push(cRow as WarrantyClaim);
      });
      setClaimsByWarranty(byW);
    } else {
      setClaimsByWarranty({});
    }

    await loadLookups(ws);
  };

  const loadLookups = async (ws: Warranty[]) => {
    const partsIds = Array.from(new Set(ws.map((w) => w.part_id).filter(Boolean)));
    const suppIds = Array.from(new Set(ws.map((w) => w.supplier_id).filter(Boolean) as string[]));
    const custIds = Array.from(new Set(ws.map((w) => w.customer_id).filter(Boolean) as string[]));
    const vehIds = Array.from(new Set(ws.map((w) => w.vehicle_id).filter(Boolean) as string[]));
    const woIds = Array.from(new Set(ws.map((w) => w.work_order_id).filter(Boolean) as string[]));

    const [pRes, sRes, cRes, vRes, woRes] = await Promise.all([
      partsIds.length
        ? supabase.from("parts").select("id,name,sku").in("id", partsIds)
        : Promise.resolve({ data: [] }),
      suppIds.length
        ? supabase.from("suppliers").select("id,name").in("id", suppIds)
        : Promise.resolve({ data: [] }),
      custIds.length
        ? supabase.from("customers").select("id,first_name,last_name").in("id", custIds)
        : Promise.resolve({ data: [] }),
      vehIds.length
        ? supabase.from("vehicles").select("id,year,make,model").in("id", vehIds)
        : Promise.resolve({ data: [] }),
      woIds.length
        ? supabase.from("work_orders").select("id,custom_id").in("id", woIds)
        : Promise.resolve({ data: [] }),
    ]);

    const lk: Lookups = {
      parts: Object.fromEntries((pRes.data ?? []).map((r) => [String(r.id), { name: r.name ?? null, sku: r.sku ?? null }])),
      suppliers: Object.fromEntries((sRes.data ?? []).map((r) => [String(r.id), { name: r.name ?? null }])),
      customers: Object.fromEntries((cRes.data ?? []).map((r) => [String(r.id), { first_name: r.first_name ?? null, last_name: r.last_name ?? null }])),
      vehicles: Object.fromEntries((vRes.data ?? []).map((r) => [String(r.id), { year: r.year ?? null, make: r.make ?? null, model: r.model ?? null }])),
      work_orders: Object.fromEntries((woRes.data ?? []).map((r) => [String(r.id), { custom_id: r.custom_id ?? null }])),
    };
    setLookups(lk);
  };

  const now = new Date();
  const filtered = rows.filter((w) => {
    const exp = new Date(w.expires_at);
    const isExpired = isBefore(exp, now);
    const days = differenceInDays(exp, now);
    const expSoon = days >= 0 && days <= 30;

    const keep =
      tab === "all" ||
      (tab === "expired" && isExpired) ||
      (tab === "expiring" && expSoon) ||
      (tab === "active" && !isExpired && !expSoon);

    if (!keep) return false;

    const p = lookups.parts[w.part_id];
    const supplier = w.supplier_id ? lookups.suppliers[w.supplier_id] : undefined;
    const hay = [
      p?.name ?? "",
      p?.sku ?? "",
      supplier?.name ?? "",
      w.notes ?? "",
      lookups.work_orders[w.work_order_id ?? ""]?.custom_id ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const registerWarranty = async () => {
    if (!shopId || !partId || !months || months <= 0) {
      toast.error("Part, months, and shop are required");
      return;
    }
    const installedIso = new Date(installedAt).toISOString();
    const expiresIso = addMonths(new Date(installedIso), months).toISOString();

    const payload: Warranty = {
      id: uuidv4(),
      shop_id: shopId,
      part_id: partId,
      supplier_id: supplierId || null,
      work_order_id: woId || null,
      work_order_line_id: woLineId || null,
      customer_id: customerId || null,
      vehicle_id: vehicleId || null,
      installed_at: installedIso,
      warranty_months: months,
      expires_at: expiresIso,
      notes: notes.trim() || null,
    };

    const { error } = await supabase.from("warranties").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Warranty registered");
    setOpenReg(false);
    setPartId("");
    setSupplierId("");
    setWoId("");
    setWoLineId("");
    setCustomerId("");
    setVehicleId("");
    setMonths(12);
    setInstalledAt(new Date().toISOString().slice(0, 10));
    setNotes("");

    await loadAll(shopId);
  };

  const openClaimFor = (w: Warranty) => {
    setOpenClaim({ warranty: w });
    setClaimStatus("open");
    setClaimRma("");
    setClaimNotes("");
  };

  const createClaim = async () => {
    if (!openClaim) return;
    const payload: WarrantyClaim = {
      id: uuidv4(),
      warranty_id: openClaim.warranty.id,
      opened_at: new Date().toISOString(),
      status: claimStatus,
      supplier_rma: claimRma.trim() || null,
      notes: claimNotes.trim() || null,
    };
    const { error } = await supabase.from("warranty_claims").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Claim created");
    setOpenClaim(null);
    await loadAll(shopId);
  };

  const updateClaimStatus = async (claimId: string, next: WarrantyClaimStatus) => {
    const { error } = await supabase.from("warranty_claims").update({ status: next }).eq("id", claimId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadAll(shopId);
  };

  if (!ready) {
    return <div className="p-6 text-white">Loading…</div>;
  }

  if (!hasTables.warranties) {
    return (
      <div className="p-6 text-white">
        <h1 className="text-2xl font-semibold">Warranties</h1>
        <div className="mt-3 rounded border border-amber-600 bg-amber-900/20 p-4 text-amber-200">
          <div className="font-semibold mb-1">Setup required</div>
          <p className="text-sm">
            The <code>warranties</code> (and optionally <code>warranty_claims</code>) tables don’t exist yet.
            Create them to enable this page.
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer underline">Show SQL</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">
{`create table if not exists public.warranties (
  id uuid primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  installed_at timestamptz not null,
  warranty_months integer not null default 12 check (warranty_months > 0),
  expires_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.warranty_claims (
  id uuid primary key,
  warranty_id uuid not null references public.warranties(id) on delete cascade,
  opened_at timestamptz not null default now(),
  status text not null check (status in ('open','approved','denied','replaced','closed')),
  supplier_rma text,
  notes text,
  created_at timestamptz not null default now()
);`}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Warranties</h1>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search parts / WO / notes…"
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
          />
          <button className={outlineInfo} onClick={() => setOpenReg(true)}>Register Warranty</button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["active", "expiring", "expired", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`rounded px-2 py-1 text-sm border ${
              tab === t ? "border-orange-500 text-orange-300" : "border-neutral-700 text-neutral-300"
            }`}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-300">
          No warranties found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-950 text-neutral-400">
              <tr>
                <th className="px-3 py-2 text-left">Part</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-left">Installed</th>
                <th className="px-3 py-2 text-left">Months</th>
                <th className="px-3 py-2 text-left">Expires</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">WO</th>
                <th className="px-3 py-2 text-left">Vehicle</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Claims</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => {
                const p = lookups.parts[w.part_id];
                const s = w.supplier_id ? lookups.suppliers[w.supplier_id] : undefined;
                const wo = w.work_order_id ? lookups.work_orders[w.work_order_id] : undefined;
                const v = w.vehicle_id ? lookups.vehicles[w.vehicle_id] : undefined;
                const c = w.customer_id ? lookups.customers[w.customer_id] : undefined;

                const expDate = new Date(w.expires_at);
                const expired = isBefore(expDate, now);
                const days = differenceInDays(expDate, now);
                const expSoon = days >= 0 && days <= 30;

                const claims = claimsByWarranty[w.id] ?? [];
                const statusChip =
                  expired
                    ? "bg-red-900/30 border-red-600 text-red-300"
                    : expSoon
                    ? "bg-amber-900/20 border-amber-600 text-amber-300"
                    : "bg-green-900/20 border-green-600 text-green-300";

                return (
                  <tr key={w.id} className="border-t border-neutral-800">
                    <td className="px-3 py-2">
                      <div className="font-medium">{p?.name ?? "Part"}</div>
                      <div className="text-xs text-neutral-400">{p?.sku ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2">{s?.name ?? "—"}</td>
                    <td className="px-3 py-2">{format(new Date(w.installed_at), "PP")}</td>
                    <td className="px-3 py-2">{w.warranty_months}</td>
                    <td className="px-3 py-2">{format(expDate, "PP")}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded border px-2 py-0.5 text-xs ${statusChip}`}>
                        {expired ? "Expired" : expSoon ? `Expiring (${days}d)` : "Active"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {w.work_order_id ? (
                        <Link
                          className="text-orange-400 hover:underline"
                          href={`/work-orders/${w.work_order_id}`}
                          title="Open work order"
                        >
                          {wo?.custom_id ?? w.work_order_id.slice(0, 8)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {v ? <span>{[v.year, v.make, v.model].filter(Boolean).join(" ")}</span> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {c ? <span>{[c.first_name, c.last_name].filter(Boolean).join(" ")}</span> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {claims.length === 0 ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {claims.map((cl) => (
                            <div key={cl.id} className="flex items-center justify-between gap-2">
                              <span className="text-xs">
                                {format(new Date(cl.opened_at), "PP")} • {cl.status}
                                {cl.supplier_rma ? ` • RMA ${cl.supplier_rma}` : ""}
                              </span>
                              <div className="flex items-center gap-1">
                                {(["open", "approved", "replaced", "closed", "denied"] as WarrantyClaimStatus[]).map(
                                  (st) => (
                                    <button
                                      key={st}
                                      className="rounded border border-neutral-700 px-1.5 py-0.5 text-[11px] hover:bg-neutral-800"
                                      onClick={() => updateClaimStatus(cl.id, st)}
                                      title={`Set ${st}`}
                                    >
                                      {st}
                                    </button>
                                  ),
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button className={outlineInfo} onClick={() => openClaimFor(w)}>
                          Open Claim
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Register modal */}
      {openReg && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpenReg(false)} />
          <div
            className="relative z-[310] w-full max-w-xl rounded border border-orange-400 bg-neutral-950 p-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-semibold">Register Warranty</div>
              <button
                className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                onClick={() => setOpenReg(false)}
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm text-neutral-300">Part ID</label>
                <input
                  value={partId}
                  onChange={(e) => setPartId(e.target.value)}
                  placeholder="Paste part UUID (search UI can be added later)"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
                {partId && lookups.parts[partId] ? (
                  <div className="mt-1 text-xs text-neutral-400">
                    {lookups.parts[partId]?.name} ({lookups.parts[partId]?.sku})
                  </div>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Supplier (optional)</label>
                <input
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  placeholder="Supplier UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Installed Date</label>
                <input
                  type="date"
                  value={installedAt}
                  onChange={(e) => setInstalledAt(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Warranty Months</label>
                <input
                  type="number"
                  min={1}
                  value={months}
                  onChange={(e) => setMonths(Math.max(1, Number(e.target.value || 1)))}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Work Order (optional)</label>
                <input
                  value={woId}
                  onChange={(e) => setWoId(e.target.value)}
                  placeholder="Work order UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">WO Line (optional)</label>
                <input
                  value={woLineId}
                  onChange={(e) => setWoLineId(e.target.value)}
                  placeholder="Work order line UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Vehicle (optional)</label>
                <input
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  placeholder="Vehicle UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Customer (optional)</label>
                <input
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="Customer UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm text-neutral-300">Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  placeholder="Terms, conditions, etc."
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className={outlineNeutral} onClick={() => setOpenReg(false)}>
                Cancel
              </button>
              <button className={outlineInfo} onClick={registerWarranty}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Claim modal */}
      {openClaim && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpenClaim(null)} />
          <div
            className="relative z-[310] w/full max-w-lg rounded border border-orange-400 bg-neutral-950 p-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-semibold">Open Warranty Claim</div>
              <button
                className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                onClick={() => setOpenClaim(null)}
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3">
              <div>
                <div className="text-sm text-neutral-400">For warranty</div>
                <div className="text-sm">
                  {lookups.parts[openClaim.warranty.part_id]?.name ?? "Part"} •{" "}
                  {format(new Date(openClaim.warranty.installed_at), "PP")} →{" "}
                  {format(new Date(openClaim.warranty.expires_at), "PP")}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Status</label>
                <select
                  value={claimStatus}
                  onChange={(e) => setClaimStatus(e.target.value as WarrantyClaimStatus)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                >
                  {(["open", "approved", "replaced", "closed", "denied"] as WarrantyClaimStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Supplier RMA (optional)</label>
                <input
                  value={claimRma}
                  onChange={(e) => setClaimRma(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  placeholder="RMA #"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Notes</label>
                <textarea
                  rows={3}
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  placeholder="Describe failure, diagnostics, photos link, etc."
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className={outlineNeutral} onClick={() => setOpenClaim(null)}>
                Cancel
              </button>
              <button className={outlineInfo} onClick={createClaim}>
                Create Claim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}