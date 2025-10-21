"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { resolveScannedCode } from "@/features/parts/server/scanActions";

// Quagga (typed shim)
type QuaggaModule = typeof import("@ericblade/quagga2");
type QuaggaResult = { codeResult?: { code?: string | null } | null };
let Quagga: QuaggaModule["default"] | null = null;
if (typeof window !== "undefined") {
  void import("@ericblade/quagga2").then((m) => {
    Quagga = m.default;
  });
}

type DB = Database;
type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];

export default function ReceivePage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [, setShopId] = useState<string>("");
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [selectedPo, setSelectedPo] = useState<string>("");
  const [selectedLoc, setSelectedLoc] = useState<string>("");
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [lastScan, setLastScan] = useState<string>("");

  const videoRef = useRef<HTMLDivElement | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [qty, setQty] = useState<number>(1);

  // bootstrap: shop, POs, locations
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .single();

      const sid = prof?.shop_id ?? "";
      setShopId(sid);
      if (!sid) return;

      const [poRes, locRes] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("*")
          .eq("shop_id", sid)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("stock_locations")
          .select("*")
          .eq("shop_id", sid)
          .order("code"),
      ]);

      setPOs((poRes.data ?? []) as PurchaseOrder[]);
      const locRows = (locRes.data ?? []) as StockLoc[];
      setLocs(locRows);
      const main = locRows.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
      if (main) setSelectedLoc(main.id);
    })();
  }, [supabase]);

  // start/stop camera
  const startScan = async () => {
    if (!Quagga || scanning || !videoRef.current) return;
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
          readers: [
            "upc_reader",
            "upc_e_reader",
            "ean_reader",
            "ean_8_reader",
            "code_128_reader",
          ],
        },
        locate: true,
      },
      (err?: Error) => {
        if (err) {
          // eslint-disable-next-line no-console
          console.error(err);
          setScanning(false);
          return;
        }
        Quagga?.start();
      }
    );

    Quagga.onDetected(async (res: QuaggaResult) => {
      const code = res.codeResult?.code ?? "";
      if (!code || code === lastScan) return;
      setLastScan(code);

      const supplierId =
        pos.find((p) => p.id === selectedPo)?.supplier_id ?? null;

      const { part_id } = await resolveScannedCode({
        code,
        supplier_id: supplierId,
      });

      if (!part_id) {
        alert(
          `No part found for "${code}". Map it in Parts → Inventory → Edit → Barcodes.`
        );
        return;
      }

      if (!selectedLoc) {
        alert("Select a location first.");
        return;
      }

      await fetch("/api/receive-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part_id,
          location_id: selectedLoc,
          qty,
          po_id: selectedPo || null,
        }),
      });

      const locLabel =
        locs.find((l) => l.id === selectedLoc)?.code ?? "LOC";
      alert(`Received ×${qty} to ${locLabel}`);
      window.dispatchEvent(new CustomEvent("parts:received"));
      window.setTimeout(() => setLastScan(""), 1000);
    });
  };

  const stopScan = () => {
    try {
      Quagga?.stop();
    } catch {
      /* ignore */
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => stopScan();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-white">Scan to Receive</h1>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-3 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <div className="text-xs text-neutral-400 mb-1">
            Purchase Order (optional)
          </div>
          <select
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
            value={selectedPo}
            onChange={(e) => setSelectedPo(e.target.value)}
          >
            <option value="">— No PO —</option>
            {pos.map((po) => (
              <option key={po.id} value={po.id}>
                {po.id.slice(0, 8)} • {po.status ?? "draft"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-xs text-neutral-400 mb-1">Location</div>
          <select
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
            value={selectedLoc}
            onChange={(e) => setSelectedLoc(e.target.value)}
          >
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
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
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value || 0)))}
          />
        </div>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 flex items-center gap-2">
          {!scanning ? (
            <button
              onClick={startScan}
              className="rounded border border-orange-500 px-3 py-1.5 text-sm text-orange-300 hover:bg-orange-900/20"
            >
              Start Scanner
            </button>
          ) : (
            <button
              onClick={stopScan}
              className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/20"
            >
              Stop Scanner
            </button>
          )}
          <span className="text-xs text-neutral-400">
            Use mobile camera to scan UPC/EAN/Code128.
          </span>
        </div>
        <div
          ref={videoRef}
          className="aspect-video w-full overflow-hidden rounded border border-neutral-800 bg-black"
        />
      </div>
    </div>
  );
}