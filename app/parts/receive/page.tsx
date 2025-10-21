"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { receivePo } from "@/features/parts/server/poActions";
import { resolveScannedCode } from "@/features/parts/server/scanActions";

// IMPORTANT: install quagga2
// pnpm add @ericblade/quagga2
let Quagga: any;
if (typeof window !== "undefined") {
  import("@ericblade/quagga2").then((m) => (Quagga = m.default));
}

type DB = Database;

export default function ReceivePage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [pos, setPOs] = useState<any[]>([]);
  const [selectedPo, setSelectedPo] = useState<string>("");
  const [selectedLoc, setSelectedLoc] = useState<string>("");
  const [locs, setLocs] = useState<any[]>([]);
  const [lastScan, setLastScan] = useState<string>("");

  const videoRef = useRef<HTMLDivElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [qty, setQty] = useState<number>(1);
  const [manualCode, setManualCode] = useState("");

  // bootstrap POs + locations for the current user’s shop
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", user.id)
        .single();
      const sid = prof?.shop_id ?? "";
      if (!sid) return;

      const [poRes, locRes] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("id, status, supplier_id")
          .eq("shop_id", sid)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("stock_locations")
          .select("id, code, name")
          .eq("shop_id", sid)
          .order("code"),
      ]);

      setPOs(poRes.data ?? []);
      setLocs(locRes.data ?? []);
      const main = (locRes.data ?? []).find((l) => (l.code ?? "").toUpperCase() === "MAIN");
      if (main) setSelectedLoc(main.id);
    })();
  }, [supabase]);

  const startScan = async () => {
    if (!Quagga || scanning) return;
    setScanning(true);
    Quagga.init(
      {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: videoRef.current!,
          constraints: { facingMode: "environment" },
        },
        decoder: {
          readers: ["upc_reader", "upc_e_reader", "ean_reader", "ean_8_reader", "code_128_reader"],
        },
        locate: true,
      },
      (err: any) => {
        if (err) {
          console.error(err);
          setScanning(false);
          return;
        }
        Quagga.start();
      },
    );

    Quagga.onDetected(async (res: any) => {
      const code = res?.codeResult?.code;
      if (!code || code === lastScan) return;
      await handleCode(code);
      setLastScan(code);
      setTimeout(() => setLastScan(""), 800);
    });
  };

  const stopScan = () => {
    try { Quagga?.stop(); } catch {}
    setScanning(false);
  };

  useEffect(() => () => stopScan(), []);

  const handleCode = async (code: string) => {
    if (!selectedLoc) {
      alert("Select a location first.");
      return;
    }

    const supplierId = pos.find((p) => p.id === selectedPo)?.supplier_id ?? null;
    const { part_id } = await resolveScannedCode({ code, supplier_id: supplierId });
    if (!part_id) {
      alert(`No part found for "${code}". Map it in Parts → Inventory → Edit → Barcodes.`);
      return;
    }

    const r = await fetch("/api/receive-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        part_id,
        location_id: selectedLoc,
        qty,
        po_id: selectedPo || undefined, // ⬅️ use undefined instead of null
      }),
    });

    if (!r.ok) {
      const msg = (await r.json().catch(() => null))?.error || "Failed to receive stock";
      alert(msg);
      return;
    }

    const locCode = locs.find((l) => l.id === selectedLoc)?.code ?? "LOC";
    alert(`Received ×${qty} to ${locCode}`);
    setManualCode("");
  };

  return (
    <div className="p-6 space-y-4 text-white">
      <h1 className="text-2xl font-bold">Scan to Receive</h1>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-3 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <div className="text-xs text-neutral-400 mb-1">Purchase Order (optional)</div>
          <select
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
            value={selectedPo}
            onChange={(e) => setSelectedPo(e.target.value)}
          >
            <option value="">— No PO —</option>
            {pos.map((po) => (
              <option key={po.id} value={po.id}>
                {po.id.slice(0, 8)} • {po.status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-xs text-neutral-400 mb-1">Location</div>
          <select
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
            value={selectedLoc}
            onChange={(e) => setSelectedLoc(e.target.value)}
          >
            <option value="">Select…</option>
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-xs text-neutral-400 mb-1">Quantity</div>
          <input
            type="number"
            min={0}
            step="0.01"
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value || 0)))}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
          />
        </div>
      </div>

      {/* Manual entry */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <div className="text-xs text-neutral-400 mb-1">Manual barcode/SKU</div>
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
            placeholder="Scan or type a code (UPC/EAN/SKU)…"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && manualCode.trim()) {
                await handleCode(manualCode.trim());
              }
            }}
          />
        </div>
        <button
          className="self-end rounded bg-orange-500 px-3 py-2 text-black disabled:opacity-60"
          disabled={!manualCode.trim()}
          onClick={() => manualCode.trim() && handleCode(manualCode.trim())}
        >
          Receive
        </button>
      </div>

      {/* Live camera scanner */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-lg font-semibold">Live Scanner</div>
          {scanning ? (
            <button className="rounded border border-neutral-700 px-2 py-1 text-sm" onClick={stopScan}>
              Stop
            </button>
          ) : (
            <button className="rounded border border-neutral-700 px-2 py-1 text-sm" onClick={startScan}>
              Start
            </button>
          )}
        </div>
        <div ref={videoRef} className="aspect-video w-full overflow-hidden rounded bg-black" />
        <div className="mt-2 text-xs text-neutral-400">
          Supported: UPC/EAN/EAN-8/Code128. Use the “Manual” box if a label won’t scan.
        </div>
      </div>

      {/* Convenience: Receive all for the PO */}
      {selectedPo && (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
          <div className="mb-2 text-lg font-semibold">Bulk Receive</div>
          <button className="rounded bg-neutral-800 px-3 py-2" onClick={() => receivePo(selectedPo)}>
            Receive All Remaining on PO
          </button>
          <div className="mt-1 text-xs text-neutral-400">
            Uses each line’s configured location. For scanning to a single location, use the scanner above.
          </div>
        </div>
      )}
    </div>
  );
}