//app/parts/po/[id]/page.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { resolveScannedCode } from "@/features/parts/server/scanActions";

// Quagga shim/types
type QuaggaModule = typeof import("@ericblade/quagga2");
type QuaggaResult = { codeResult?: { code?: string | null } | null };
let Quagga: QuaggaModule["default"] | null = null;
if (typeof window !== "undefined") {
  void import("@ericblade/quagga2").then((m) => (Quagga = m.default));
}

type DB = Database;
type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];
type POLine = DB["public"]["Tables"]["purchase_order_lines"]["Row"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];

export default function ReceivePOPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [po, setPO] = useState<PurchaseOrder | null>(null);
  const [lines, setLines] = useState<POLine[]>([]);
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string>("");

  const [qty, setQty] = useState<number>(1);
  const [lastScan, setLastScan] = useState<string>("");

  const videoRef = useRef<HTMLDivElement | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);

  // load PO + lines + locations
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: poRow } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      const poTyped = (poRow as PurchaseOrder | null) ?? null;
      setPO(poTyped);

      const [{ data: lineRows }, { data: locRows }] = await Promise.all([
        supabase
          .from("purchase_order_lines")
          .select("*")
          .eq("po_id", id)
          .order("created_at", { ascending: true }),
        poTyped?.shop_id
          ? supabase
              .from("stock_locations")
              .select("*")
              .eq("shop_id", poTyped.shop_id)
              .order("code")
          : Promise.resolve({ data: [] }),
      ]);

      const locsTyped = (locRows ?? []) as StockLoc[];
      setLines((lineRows ?? []) as POLine[]);
      setLocs(locsTyped);
      const main = locsTyped.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
      if (main) setSelectedLoc(main.id);
    })();
  }, [id, supabase]);

  // scanner
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

      const { part_id } = await resolveScannedCode({
        code,
        supplier_id: po?.supplier_id ?? null,
      });

      if (!part_id) {
        alert(`No part found for "${code}".`);
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
          po_id: po?.id ?? null,
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

  const remaining = (ln: POLine): number => {
    const ordered = Number(ln.qty ?? 0);
    const received = Number(ln.received_qty ?? 0);
    return Math.max(0, ordered - received);
  };

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Receive PO</h1>
        <Link
          href="/parts/po"
          className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
        >
          Back to POs
        </Link>
      </div>

      {po ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
          <div className="font-medium">
            {po.id.slice(0, 8)} • {po.status ?? "draft"}
          </div>
          <div className="text-neutral-400">
            Supplier: {po.supplier_id ?? "—"}
          </div>
        </div>
      ) : (
        <div className="text-neutral-400">Loading PO…</div>
      )}

      <div className="rounded border border-neutral-800 bg-neutral-900 p-3 grid gap-3 sm:grid-cols-3">
        <div>
          <div className="text-xs text-neutral-400 mb-1">Location</div>
          <select
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
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
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
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
            Scan item barcodes to receive against this PO.
          </span>
        </div>
        <div
          ref={videoRef}
          className="aspect-video w-full overflow-hidden rounded border border-neutral-800 bg-black"
        />
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 p-2 text-sm font-semibold">
          Lines
        </div>
        {lines.length === 0 ? (
          <div className="p-3 text-neutral-400">No lines yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="p-2">Part</th>
                <th className="p-2">Ordered</th>
                <th className="p-2">Received</th>
                <th className="p-2">Remaining</th>
              </tr>
            </thead>
            <tbody>
  {lines.map((ln) => (
    <tr key={ln.id} className="border-t border-neutral-800">
      <td className="p-2">{ln.part_id ? ln.part_id.slice(0, 8) : "—"}</td>
      <td className="p-2">{Number(ln.qty ?? 0)}</td>
      <td className="p-2">{Number(ln.received_qty ?? 0)}</td>
      <td className="p-2">{remaining(ln)}</td>
    </tr>
  ))}
</tbody>
          </table>
        )}
      </div>
    </div>
  );
}