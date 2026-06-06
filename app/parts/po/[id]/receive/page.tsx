//app/parts/po/[id]/receive/page.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { resolveScannedCode } from "@/features/parts/server/scanActions";
import {
  canonicalStatusLabel,
  receiveProgressLabel,
  toReceiveProgressDisplay,
} from "@/features/parts/lib/status-display";
import {
  buildPartTrustMeta,
  trustBadgeTone,
  trustLevelLabel,
  trustReasonTone,
  type PartTrustMeta,
} from "@/features/parts/lib/trust-signals";
import { partOptionLabel, partSearchText, toPartDisplaySummary } from "@/features/parts/lib/part-display";

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
type PurchaseOrderLineWithRequestItem = PurchaseOrderLine & { part_request_item_id?: string | null };
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type SupplierRow = DB["public"]["Tables"]["suppliers"]["Row"];
type PartTrustFields = Pick<
  DB["public"]["Tables"]["parts"]["Row"],
  "id" | "sku" | "part_number" | "normalized_part_key" | "source_intake_id"
> & { import_confidence?: number | null };
type AliasLookupRow = { part_id: string | null };
type StagingLookupRow = { matched_part_id: string | null; status: string | null };
type CandidateLookupRow = { candidate_part_id: string | null };

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

async function resolveShopId(
  supabase: ReturnType<typeof createBrowserSupabase>,
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
  const supabase = useMemo(() => createBrowserSupabase(), []);
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
  const [trustByPartId, setTrustByPartId] = useState<Record<string, PartTrustMeta>>({});

  const [selectedLoc, setSelectedLoc] = useState<string>("");
  const [qty, setQty] = useState<number>(1);

  const [manualPartId, setManualPartId] = useState<string>("");
  const [manualSearch, setManualSearch] = useState<string>("");
  const [freeTextQtyByLineId, setFreeTextQtyByLineId] = useState<Record<string, number>>({});

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
        setLines((lineRes.data ?? []) as PurchaseOrderLineWithRequestItem[]);
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
            .select("*")
            .eq("shop_id", sid)
            .order("name", { ascending: true })
            .limit(700);

          if (partErr) throw partErr;
          const partList = (partRows ?? []) as PartRow[];
          setParts(partList);
          const partIds = partList.map((p) => String(p.id));
          const [aliasRes, stagingRes, candRes] = await Promise.all([
            supabase.from("shop_parts_source_aliases").select("part_id").in("part_id", partIds).eq("shop_id", sid),
            supabase.from("shop_parts_import_staging").select("matched_part_id,status").in("matched_part_id", partIds).eq("shop_id", sid),
            supabase.from("shop_parts_import_match_candidates").select("candidate_part_id").in("candidate_part_id", partIds).eq("shop_id", sid),
          ]);
          const aliasCount: Record<string, number> = {};
          ((aliasRes.data ?? []) as AliasLookupRow[]).forEach((r) => {
            const id = String(r.part_id ?? "");
            if (!id) return;
            aliasCount[id] = (aliasCount[id] ?? 0) + 1;
          });
          const stagingCount: Record<string, number> = {};
          ((stagingRes.data ?? []) as StagingLookupRow[]).forEach((r) => {
            const st = String(r.status ?? "").toLowerCase();
            if (st === "pending" || st === "review" || st === "ambiguous") {
              const id = String(r.matched_part_id ?? "");
              if (!id) return;
              stagingCount[id] = (stagingCount[id] ?? 0) + 1;
            }
          });
          const candCount: Record<string, number> = {};
          ((candRes.data ?? []) as CandidateLookupRow[]).forEach((r) => {
            const id = String(r.candidate_part_id ?? "");
            if (!id) return;
            candCount[id] = (candCount[id] ?? 0) + 1;
          });
          const trustMap: Record<string, PartTrustMeta> = {};
          partList.forEach((part) => {
            const p = part as PartTrustFields;
            const id = String(p.id);
            trustMap[id] = buildPartTrustMeta({
              sku: p.sku,
              partNumber: p.part_number ?? null,
              normalizedPartKey: p.normalized_part_key ?? null,
              sourceIntakeId: p.source_intake_id ?? null,
              importConfidence: p.import_confidence ?? null,
              aliasCount: aliasCount[id] ?? 0,
              pendingStagingCount: stagingCount[id] ?? 0,
              ambiguousCandidateCount: (candCount[id] ?? 0) > 1 ? candCount[id] : 0,
            });
          });
          setTrustByPartId(trustMap);
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

  const refreshPoAndLines = async () => {
    const [poRes, lineRes] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("id", poId).maybeSingle(),
      supabase.from("purchase_order_lines").select("*").eq("po_id", poId).order("created_at", { ascending: true }),
    ]);

    if (!poRes.error) setPo((poRes.data as PurchaseOrder | null) ?? null);
    if (!lineRes.error) setLines((lineRes.data ?? []) as PurchaseOrderLineWithRequestItem[]);
  };

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
    await refreshPoAndLines();

    window.dispatchEvent(new CustomEvent("parts:received"));
  };

  const receiveFreeTextLine = async (line: PurchaseOrderLineWithRequestItem) => {
    setErr(null);
    setResult(null);

    const lineId = String(line.id);
    const ordered = n(line.qty);
    const received = n(line.received_qty);
    const rem = Math.max(0, ordered - received);
    const requestedQty = n(freeTextQtyByLineId[lineId] ?? rem);
    const receiveQty = Math.min(rem, requestedQty);

    if (line.part_id) {
      setErr("This line is inventory-linked. Use stock receive flow.");
      return;
    }
    if (receiveQty <= 0) {
      setErr("Quantity must be greater than 0 and within remaining quantity.");
      return;
    }

    const nextReceived = received + receiveQty;
    const { error } = await supabase
      .from("purchase_order_lines")
      .update({ received_qty: nextReceived })
      .eq("id", line.id)
      .eq("po_id", poId)
      .is("part_id", null);

    if (error) {
      setErr(error.message);
      return;
    }

    const requestItemId = String(line.part_request_item_id ?? "");
    if (requestItemId) {
      const { data: requestItem, error: requestItemError } = await supabase
        .from("part_request_items")
        .select("id, qty, qty_approved, qty_received, status")
        .eq("id", requestItemId)
        .maybeSingle();

      if (requestItemError) {
        setErr(requestItemError.message);
        return;
      }

      if (requestItem) {
        const targetQtyRaw = n(requestItem.qty_approved) > 0 ? n(requestItem.qty_approved) : n(requestItem.qty);
        const targetQty = Math.max(0, targetQtyRaw);
        const currentQtyReceived = n(requestItem.qty_received);
        const nextQtyReceived = Math.min(targetQty, currentQtyReceived + receiveQty);

        let nextStatus = requestItem.status;
        if (nextQtyReceived > 0) {
          if (nextQtyReceived < targetQty) nextStatus = "partially_received";
          else nextStatus = "received";
        }

        const { error: syncError } = await supabase
          .from("part_request_items")
          .update({ qty_received: nextQtyReceived, status: nextStatus })
          .eq("id", requestItem.id);

        if (syncError) {
          setErr(syncError.message);
          return;
        }
      }
    }

    setFreeTextQtyByLineId((prev) => ({ ...prev, [lineId]: Math.max(0, rem - receiveQty) }));
    await refreshPoAndLines();
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
  const supplierName = supplier?.name ?? (po?.supplier_id ? "Unknown supplier" : "—");

  const totalOrdered = useMemo(() => lines.reduce((sum, l) => sum + n(l.qty), 0), [lines]);
  const totalReceived = useMemo(() => lines.reduce((sum, l) => sum + n(l.received_qty), 0), [lines]);
  const remaining = Math.max(0, totalOrdered - totalReceived);

  const filteredParts = useMemo(() => {
    const term = manualSearch.trim().toLowerCase();
    if (!term) return parts.slice(0, 180);
    return parts
      .filter((p) => partSearchText(toPartDisplaySummary(p)).includes(term))
      .slice(0, 180);
  }, [manualSearch, parts]);

  const locLabel = locs.find((l) => String(l.id) === selectedLoc)?.code ?? "LOC";

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-neutral-400">Purchase order</div>
          <h1 className="text-2xl font-bold">Receive from PO</h1>
          <div className="mt-1 text-xs text-neutral-500">Receive from PO: items tied to this purchase order.</div>
          <div className="mt-1 text-sm text-neutral-400">
            PO: <span className="font-mono text-neutral-200">{poId.slice(0, 8)}</span> • Status:{" "}
            <span className="text-neutral-200">{poStatus}</span> • Supplier:{" "}
            <span className="text-neutral-200">{supplierName}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/parts/po"
            className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-neutral-100 hover:border-sky-500/40"
          >
            ← POs
          </Link>
          <button
            onClick={() => router.push("/parts/receive")}
            className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-neutral-100 hover:border-sky-500/40"
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
                <div className="mt-1 text-lg font-semibold text-[rgba(242,210,187,0.94)]">{remaining}</div>
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
                    className="rounded-full border border-sky-500/40 bg-sky-950/25 px-4 py-2 text-sm text-[rgba(242,210,187,0.94)] hover:bg-sky-900/25"
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
                      {partOptionLabel(toPartDisplaySummary(p))}
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
                  className="rounded-full border border-sky-500/40 bg-sky-950/25 px-4 py-2 text-sm text-[rgba(242,210,187,0.94)] hover:bg-sky-900/25 disabled:opacity-50"
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
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td className="p-4 text-neutral-400" colSpan={5}>
                      No PO lines yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((ln) => {
                    const ordered = n(ln.qty);
                    const received = n(ln.received_qty);
                    const rem = Math.max(0, ordered - received);
                    const trust = ln.part_id ? trustByPartId[String(ln.part_id)] : null;
                    const recvState = toReceiveProgressDisplay({ qtyApproved: ordered, qtyReceived: received });

                    return (
                      <tr key={String(ln.id)} className="border-t border-white/5 hover:bg-white/5">
                        <td className="p-3">
                          <div className="font-mono text-xs text-neutral-300">{ln.part_id ? "Linked part" : "Unmapped part"}</div>
                          <div className="text-xs text-neutral-500">{ln.description ?? "—"}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[11px] text-neutral-400">{receiveProgressLabel(recvState)}</span>
                            {trust ? <span className={`rounded-full border px-2 py-0.5 text-[10px] ${trustBadgeTone(trust.level)}`}>{trustLevelLabel(trust.level)}</span> : null}
                          </div>
                          {trust && trust.reasons.length > 0 ? <div className={`text-[11px] ${trustReasonTone(trust.level)}`}>{trust.reasons.slice(0, 1).join(" · ")}</div> : null}
                        </td>
                        <td className="p-3 font-mono">{ordered}</td>
                        <td className="p-3 font-mono">{received}</td>
                        <td className="p-3 font-mono">
                          {rem > 0 ? (
                            <span className="text-[rgba(242,210,187,0.94)]">{rem}</span>
                          ) : (
                            <span className="text-neutral-500">0</span>
                          )}
                        </td>
                        <td className="p-3">
                          {ln.part_id ? (
                            <span className="text-xs text-neutral-500">Inventory-linked line</span>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-[11px] uppercase tracking-[0.14em] text-amber-300/80">
                                Non-inventory line
                              </div>
                              <div className="text-[11px] text-neutral-400">Free-text / match later</div>
                              <div className="text-[11px] text-neutral-500">
                                No stock movement will be created until this line is matched to an inventory part.
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  max={rem}
                                  className="w-24 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-xs text-white"
                                  value={freeTextQtyByLineId[String(ln.id)] ?? rem}
                                  onChange={(e) =>
                                    setFreeTextQtyByLineId((prev) => ({
                                      ...prev,
                                      [String(ln.id)]: Math.max(0, Number(e.target.value || 0)),
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  onClick={() => void receiveFreeTextLine(ln)}
                                  disabled={rem <= 0 || n(freeTextQtyByLineId[String(ln.id)] ?? rem) <= 0}
                                  className="rounded-full border border-amber-500/40 bg-amber-950/20 px-3 py-1 text-xs text-amber-100 hover:bg-amber-900/20 disabled:opacity-50"
                                >
                                  Receive line
                                </button>
                              </div>
                            </div>
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
                            <td className="p-2 text-neutral-300">{canonicalStatusLabel(a.status)}</td>
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
