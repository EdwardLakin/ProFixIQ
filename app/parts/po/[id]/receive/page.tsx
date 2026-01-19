//app/parts/po/[id]/receive/page.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { resolveScannedCode } from "@/features/parts/server/scanActions";

type QuaggaResult = { codeResult?: { code?: string | null } | null };

type QuaggaConfig = {
  inputStream: {
    name: string;
    type: "LiveStream";
    target: HTMLElement;
    constraints?: { facingMode?: string };
  };
  decoder: { readers: string[] };
  locate?: boolean;
};

type QuaggaDetectedHandler = (res: QuaggaResult) => void;

type QuaggaLike = {
  init: (cfg: QuaggaConfig, cb: (err?: Error) => void) => void;
  start: () => void;
  stop: () => void;
  onDetected: (handler: QuaggaDetectedHandler) => void;
  offDetected?: (handler: QuaggaDetectedHandler) => void;
};

let Quagga: QuaggaLike | null = null;

if (typeof window !== "undefined") {
  void import("@ericblade/quagga2").then((m) => {
    Quagga = (m.default as unknown) as QuaggaLike;
  });
}

type DB = Database;
type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];
type PurchaseOrderLine = DB["public"]["Tables"]["purchase_order_lines"]["Row"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type SupplierRow = DB["public"]["Tables"]["suppliers"]["Row"];

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

async function resolveShopId(
  supabase: ReturnType<typeof createClientComponentClient<DB>>,
): Promise<string> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  if (!uid) return "";

  // Option A
  const { data: profA } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", uid)
    .maybeSingle();
  if (profA?.shop_id) return String(profA.shop_id);

  // Option B
  const { data: profB } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", uid)
    .maybeSingle();
  return String(profB?.shop_id ?? "");
}

type AllocationResult = {
  request_item_id?: string;
  qty_allocated?: number;
  status?: string;
};

type ReceiveResult = {
  move_id?: string;
  po_status?: string;
  allocations?: AllocationResult[];
  unallocated_qty?: number;
};

function extractReceiveResult(data: unknown): ReceiveResult | null {
  if (!data) return null;
  if (typeof data === "object") return data as ReceiveResult;
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as ReceiveResult;
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export default function PoReceivePage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const poId = String(params?.id ?? "");

  const [shopId, setShopId] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);

  const [selectedLoc, setSelectedLoc] = useState<string>("");
  const [qty, setQty] = useState<number>(1);

  const [manualPartId, setManualPartId] = useState<string>("");
  const [manualSearch, setManualSearch] = useState<string>("");

  // scanner
  const videoRef = useRef<HTMLDivElement | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [lastScan, setLastScan] = useState<string>("");
  const onDetectedRef = useRef<QuaggaDetectedHandler | null>(null);

  // last receive output
  const [result, setResult] = useState<ReceiveResult | null>(null);

  useEffect(() => {
    if (!poId) return;

    void (async () => {
      setLoading(true);
      setErr(null);
      setResult(null);

      try {
        const sid = await resolveShopId(supabase);
        setShopId(sid);

        // Load PO + lines + locations
        const [poRes, lineRes, locRes] = await Promise.all([
          supabase.from("purchase_orders").select("*").eq("id", poId).maybeSingle(),
          supabase
            .from("purchase_order_lines")
            .select("*")
            .eq("po_id", poId)
            .order("created_at", { ascending: true }),
          sid
            ? supabase
                .from("stock_locations")
                .select("*")
                .eq("shop_id", sid)
                .order("code")
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (poRes.error) throw poRes.error;
        if (lineRes.error) throw lineRes.error;
        if (locRes.error) throw locRes.error;

        const poRow = (poRes.data as PurchaseOrder | null) ?? null;
        setPo(poRow);
        setLines((lineRes.data ?? []) as PurchaseOrderLine[]);
        const locRows = (locRes.data ?? []) as StockLoc[];
        setLocs(locRows);

        const main = locRows.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
        if (main) setSelectedLoc(String(main.id));
        else if (locRows[0]?.id) setSelectedLoc(String(locRows[0].id));

        // Supplier (optional)
        const supId = poRow?.supplier_id ? String(poRow.supplier_id) : "";
        if (supId) {
          const { data: supRow, error: supErr } = await supabase
            .from("suppliers")
            .select("*")
            .eq("id", supId)
            .maybeSingle();
          if (!supErr) setSupplier((supRow as SupplierRow | null) ?? null);
        } else {
          setSupplier(null);
        }

        // Load parts list for manual mode (keep it light)
        if (sid) {
          const { data: partRows, error: partErr } = await supabase
            .from("parts")
            .select("id, name, sku, category")
            .eq("shop_id", sid)
            .order("name", { ascending: true })
            .limit(700);

          if (partErr) throw partErr;
          setParts((partRows ?? []) as PartRow[]);
        } else {
          setParts([]);
        }
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load PO receive page");
      } finally {
        setLoading(false);
      }
    })();
  }, [poId, supabase]);

  const cleanupScannerHandlers = () => {
    try {
      if (Quagga && onDetectedRef.current && typeof Quagga.offDetected === "function") {
        Quagga.offDetected(onDetectedRef.current);
      }
    } catch {
      // ignore
    }
    onDetectedRef.current = null;
  };

  const stopScan = () => {
    try {
      cleanupScannerHandlers();
      Quagga?.stop();
    } catch {
      /* ignore */
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doReceive = async (partId: string, receiveQty: number) => {
    setErr(null);
    setResult(null);

    if (!partId) {
      setErr("Select a part first.");
      return;
    }
    if (!selectedLoc) {
      setErr("Select a location first.");
      return;
    }
    if (!receiveQty || receiveQty <= 0) {
      setErr("Quantity must be greater than 0.");
      return;
    }

    const args = {
      p_po_id: poId,
      p_part_id: partId,
      p_location_id: selectedLoc,
      p_qty: receiveQty,
    };

    const { data, error } = await supabase.rpc(
      "receive_po_part_and_allocate",
      args as unknown as DB["public"]["Functions"]["receive_po_part_and_allocate"]["Args"],
    );

    if (error) {
      setErr(error.message);
      return;
    }

    const parsed = extractReceiveResult(data);
    setResult(parsed ?? {});

    // Refresh PO + lines so UI is accurate after receive
    const [poRes, lineRes] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("id", poId).maybeSingle(),
      supabase
        .from("purchase_order_lines")
        .select("*")
        .eq("po_id", poId)
        .order("created_at", { ascending: true }),
    ]);

    if (!poRes.error) setPo((poRes.data as PurchaseOrder | null) ?? null);
    if (!lineRes.error) setLines((lineRes.data ?? []) as PurchaseOrderLine[]);

    window.dispatchEvent(new CustomEvent("parts:received"));
  };

  const startScan = async () => {
    if (!videoRef.current) return;
    if (scanning) return;

    // Quagga can be “not yet imported” for a split second
    if (!Quagga) {
      setErr("Scanner loading… try again in 1 second.");
      window.setTimeout(() => setErr(null), 900);
      return;
    }

    setErr(null);
    setResult(null);
    setScanning(true);

    Quagga.init(
      {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: videoRef.current,
          constraints: { facingMode: "environment" },
        },
        decoder: {
          readers: ["upc_reader", "upc_e_reader", "ean_reader", "ean_8_reader", "code_128_reader"],
        },
        locate: true,
      },
      (e?: Error) => {
        if (e) {
          // eslint-disable-next-line no-console
          console.error(e);
          setErr(e.message);
          setScanning(false);
          return;
        }
        Quagga?.start();
      },
    );

    cleanupScannerHandlers();

    const handler: QuaggaDetectedHandler = async (res) => {
      const code = res.codeResult?.code ?? "";
      if (!code || code === lastScan) return;

      setLastScan(code);

      const supplierId = po?.supplier_id ? String(po.supplier_id) : null;

      const { part_id } = await resolveScannedCode({
        code,
        supplier_id: supplierId,
      });

      if (!part_id) {
        setErr(`No part found for "${code}". Map it in Parts → Inventory → Edit → Barcodes.`);
        window.setTimeout(() => setLastScan(""), 900);
        return;
      }

      await doReceive(part_id, qty);

      window.setTimeout(() => setLastScan(""), 900);
    };

    onDetectedRef.current = handler;
    Quagga.onDetected(handler);
  };

  const poStatus = String(po?.status ?? "—");
  const supplierName = supplier?.name ?? (po?.supplier_id ? String(po.supplier_id).slice(0, 8) : "—");

  const totalOrdered = useMemo(() => lines.reduce((sum, l) => sum + n(l.qty), 0), [lines]);
  const totalReceived = useMemo(() => lines.reduce((sum, l) => sum + n(l.received_qty), 0), [lines]);
  const remaining = Math.max(0, totalOrdered - totalReceived);

  const filteredParts = useMemo(() => {
    const term = manualSearch.trim().toLowerCase();
    if (!term) return parts.slice(0, 180);
    return parts
      .filter((p) => {
        const name = String(p.name ?? "").toLowerCase();
        const sku = String(p.sku ?? "").toLowerCase();
        const cat = String(p.category ?? "").toLowerCase();
        return name.includes(term) || sku.includes(term) || cat.includes(term);
      })
      .slice(0, 180);
  }, [manualSearch, parts]);

  const locLabel = locs.find((l) => String(l.id) === selectedLoc)?.code ?? "LOC";

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-neutral-400">Purchase order</div>
          <h1 className="text-2xl font-bold">Receive PO</h1>
          <div className="mt-1 text-sm text-neutral-400">
            PO: <span className="font-mono text-neutral-200">{poId.slice(0, 8)}</span> • Status:{" "}
            <span className="text-neutral-200">{poStatus}</span> • Supplier:{" "}
            <span className="text-neutral-200">{supplierName}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/parts/po"
            className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-neutral-100 hover:border-orange-500/60"
          >
            ← POs
          </Link>
          <button
            onClick={() => router.push("/parts/receive")}
            className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-neutral-100 hover:border-orange-500/60"
            type="button"
          >
            Generic Receive
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-400">
          Loading…
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl shadow-[0_18px_40px_rgba(0,0,0,0.9)]">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                <div className="text-xs text-neutral-400">Total Ordered</div>
                <div className="mt-1 text-lg font-semibold">{totalOrdered}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                <div className="text-xs text-neutral-400">Total Received</div>
                <div className="mt-1 text-lg font-semibold">{totalReceived}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                <div className="text-xs text-neutral-400">Remaining</div>
                <div className="mt-1 text-lg font-semibold text-orange-200">{remaining}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                <div className="text-xs text-neutral-400">Receiving Location</div>
                <div className="mt-1 text-lg font-semibold">{locLabel}</div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left: Scan */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl shadow-[0_18px_40px_rgba(0,0,0,0.9)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-neutral-400">Scan</div>
                  <div className="text-lg font-semibold">Scan to Receive</div>
                  <div className="text-xs text-neutral-500">
                    UPC / EAN / Code128 mapped to parts_barcodes / part_barcodes.
                  </div>
                </div>

                {!scanning ? (
                  <button
                    onClick={startScan}
                    className="rounded-full border border-orange-500/70 bg-orange-500/10 px-4 py-2 text-sm text-orange-200 hover:bg-orange-500/20"
                    type="button"
                  >
                    Start Scanner
                  </button>
                ) : (
                  <button
                    onClick={stopScan}
                    className="rounded-full border border-red-500/70 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:bg-red-500/20"
                    type="button"
                  >
                    Stop Scanner
                  </button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <div className="text-xs text-neutral-400 mb-1">Location</div>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-black/60 p-2 text-white"
                    value={selectedLoc}
                    onChange={(e) => setSelectedLoc(e.target.value)}
                  >
                    {locs.map((l) => (
                      <option key={String(l.id)} value={String(l.id)}>
                        {l.code ?? "LOC"} — {l.name ?? ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-neutral-400 mb-1">Quantity</div>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    className="w-full rounded-xl border border-white/10 bg-black/60 p-2 text-white"
                    value={qty}
                    onChange={(e) => setQty(Math.max(0, Number(e.target.value || 0)))}
                  />
                </div>
              </div>

              <div
                ref={videoRef}
                className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black"
              />

              {lastScan ? (
                <div className="text-xs text-neutral-500">
                  Last scan: <span className="font-mono text-neutral-200">{lastScan}</span>
                </div>
              ) : null}
            </div>

            {/* Right: Manual receive */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl shadow-[0_18px_40px_rgba(0,0,0,0.9)] space-y-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-neutral-400">Manual</div>
                <div className="text-lg font-semibold">Receive a Part</div>
                <div className="text-xs text-neutral-500">
                  Calls <span className="font-mono">receive_po_part_and_allocate</span> (stock move + PO receive + request
                  allocation).
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <div className="text-xs text-neutral-400 mb-1">Search parts</div>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
                    placeholder="Name, SKU, category…"
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                  />
                </div>

                <div>
                  <div className="text-xs text-neutral-400 mb-1">Quantity</div>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    className="w-full rounded-xl border border-white/10 bg-black/60 p-2 text-white"
                    value={qty}
                    onChange={(e) => setQty(Math.max(0, Number(e.target.value || 0)))}
                  />
                </div>
              </div>

              <div>
                <div className="text-xs text-neutral-400 mb-1">Part</div>
                <select
                  className="w-full rounded-xl border border-white/10 bg-black/60 p-2 text-white"
                  value={manualPartId}
                  onChange={(e) => setManualPartId(e.target.value)}
                >
                  <option value="">— select —</option>
                  {filteredParts.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {p.name ?? "Unnamed"} {p.sku ? `• ${p.sku}` : ""} {p.category ? `• ${p.category}` : ""}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-neutral-500">Showing up to {filteredParts.length} results.</div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-neutral-500">
                  Location: <span className="text-neutral-200">{locLabel}</span>
                </div>

                <button
                  onClick={() => void doReceive(manualPartId, qty)}
                  disabled={!manualPartId || !selectedLoc || qty <= 0}
                  className="rounded-full border border-orange-500/70 bg-orange-500/10 px-4 py-2 text-sm text-orange-200 hover:bg-orange-500/20 disabled:opacity-50"
                  type="button"
                >
                  Receive & Allocate →
                </button>
              </div>
            </div>
          </div>

          {/* PO lines */}
          <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden backdrop-blur-xl shadow-[0_18px_40px_rgba(0,0,0,0.9)]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-neutral-400">PO lines</div>
                <div className="text-sm text-neutral-300">{lines.length} lines</div>
              </div>
              <div className="text-xs text-neutral-500">
                FIFO receive updates <span className="font-mono">purchase_order_lines.received_qty</span>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400 border-b border-white/10">
                  <th className="p-3">Part</th>
                  <th className="p-3">Ordered</th>
                  <th className="p-3">Received</th>
                  <th className="p-3">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td className="p-4 text-neutral-400" colSpan={4}>
                      No PO lines yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((ln) => {
                    const ordered = n(ln.qty);
                    const received = n(ln.received_qty);
                    const rem = Math.max(0, ordered - received);

                    return (
                      <tr key={String(ln.id)} className="border-t border-white/5 hover:bg-white/5">
                        <td className="p-3">
                          <div className="font-mono text-xs text-neutral-300">
                            {ln.part_id ? String(ln.part_id).slice(0, 8) : "—"}
                          </div>
                          <div className="text-xs text-neutral-500">{ln.description ?? "—"}</div>
                        </td>
                        <td className="p-3 font-mono">{ordered}</td>
                        <td className="p-3 font-mono">{received}</td>
                        <td className="p-3 font-mono">
                          {rem > 0 ? (
                            <span className="text-orange-200">{rem}</span>
                          ) : (
                            <span className="text-neutral-500">0</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Errors */}
          {err ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{err}</div>
          ) : null}

          {/* Result */}
          {result ? (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl shadow-[0_18px_40px_rgba(0,0,0,0.9)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-neutral-400">Receive result</div>
                  <div className="text-sm text-neutral-200">
                    Move:{" "}
                    <span className="font-mono">{result.move_id ? String(result.move_id).slice(0, 8) : "—"}</span> • PO
                    status: <span className="text-neutral-200">{result.po_status ?? poStatus}</span>
                  </div>
                </div>

                <div className="text-xs text-neutral-400">
                  Unallocated remainder: <span className="text-neutral-200">{n(result.unallocated_qty)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/50 p-3">
                <div className="text-xs text-neutral-400 mb-2">Allocations applied to request items (FIFO)</div>

                {Array.isArray(result.allocations) && result.allocations.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-white/10">
                    <table className="w-full text-sm">
                      <thead className="bg-white/5 text-left text-neutral-400">
                        <tr>
                          <th className="p-2">Request item</th>
                          <th className="p-2">Qty allocated</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.allocations.map((a, idx) => (
                          <tr key={`${a.request_item_id ?? "x"}-${idx}`} className="border-t border-white/10">
                            <td className="p-2 font-mono text-xs text-neutral-200">
                              {a.request_item_id ? String(a.request_item_id).slice(0, 8) : "—"}
                            </td>
                            <td className="p-2 font-mono text-neutral-200">{n(a.qty_allocated)}</td>
                            <td className="p-2 text-neutral-300">{a.status ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-neutral-400">No request items were allocated from this receive.</div>
                )}
              </div>

              <div className="text-[11px] text-neutral-500">
                Next layer after this: “Receive from PO and automatically apply received qty to matching request items
                (batch allocation)”.
              </div>
            </div>
          ) : null}

          {/* Footer note */}
          {!shopId ? (
            <div className="text-xs text-neutral-500">
              No shop detected for this user. If you’re logged in as a different role, check profiles.shop_id.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}