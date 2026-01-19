// features/parts/components/ReceiveDrawer.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Option = { value: string; label: string };

export type ReceiveDrawerItem = {
  id: string;
  created_at?: string | null;
  request_id?: string | null;
  part_id?: string | null;
  description?: string | null;
  status?: string | null;

  qty_approved?: number | null;
  qty_received?: number | null;
  qty_remaining?: number | null;

  part_name?: string | null;
  sku?: string | null;
};

type ReceiveResult =
  | { ok: true; result?: unknown; item?: unknown }
  | { ok?: false; error?: string };

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

function safeText(res: Response): Promise<string> {
  return res.text().catch(() => "");
}

export default function ReceiveDrawer(props: {
  open: boolean;
  onClose?: () => void;
  closeEventName?: string;

  item: ReceiveDrawerItem | null;

  locations: Option[];
  defaultLocationId?: string;

  purchaseOrders?: Option[];
  defaultPoId?: string | null;

  lockLocation?: boolean;
  lockPo?: boolean;
}): JSX.Element | null {
  const {
    open,
    onClose,
    closeEventName,
    item,
    locations,
    defaultLocationId,
    purchaseOrders,
    defaultPoId,
    lockLocation,
    lockPo,
  } = props;

  const [locationId, setLocationId] = useState<string>(defaultLocationId ?? "");
  const [poId, setPoId] = useState<string>(defaultPoId ?? "");
  const [qty, setQty] = useState<number | "">("");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const remaining = useMemo(() => {
    if (!item) return 0;
    if (typeof item.qty_remaining === "number") return Math.max(0, item.qty_remaining);
    const approved = n(item.qty_approved);
    const received = n(item.qty_received);
    return Math.max(0, approved - received);
  }, [item]);

  useEffect(() => {
    if (!open) return;

    setErr(null);
    setQty("");

    if (!locationId) {
      const fallback = defaultLocationId ?? locations[0]?.value ?? "";
      if (fallback) setLocationId(fallback);
    }

    if (purchaseOrders && purchaseOrders.length > 0) {
      if (defaultPoId && !poId) setPoId(defaultPoId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const title = item?.part_name?.trim()
    ? `Receive — ${item.part_name}`
    : `Receive — ${item?.description ?? "Item"}`;

  const canSubmit =
    !!item?.id &&
    !!locationId &&
    typeof qty === "number" &&
    qty > 0 &&
    !submitting;

  function close(): void {
    setErr(null);
    setSubmitting(false);

    if (onClose) onClose();
    if (closeEventName) window.dispatchEvent(new Event(closeEventName));
  }

  async function submit(): Promise<void> {
    if (!item?.id) return;

    setErr(null);

    if (!locationId) {
      setErr("Select a location first.");
      return;
    }

    const q = typeof qty === "number" ? qty : 0;
    if (!q || q <= 0) {
      setErr("Enter a receive quantity.");
      return;
    }

    if (remaining > 0 && q > remaining) {
      setErr(`Qty exceeds remaining (${remaining}).`);
      return;
    }

    setSubmitting(true);

    try {
      // ✅ Canonical endpoint: item-scoped receive
      const res = await fetch(
        `/api/parts/requests/items/${encodeURIComponent(item.id)}/receive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_id: locationId,
            qty: q,
            po_id: poId?.trim() ? poId.trim() : null,
          }),
        },
      );

      const raw = await safeText(res);
      let json: ReceiveResult | null = null;
      try {
        json = raw ? (JSON.parse(raw) as ReceiveResult) : null;
      } catch {
        // ignore
      }

      if (!res.ok || !json?.ok) {
        const msg =
          json && "error" in json && json.error
            ? String(json.error)
            : raw || `HTTP ${res.status}`;
        setErr(msg);
        setSubmitting(false);
        return;
      }

      // ✅ tell any pages to refresh
      window.dispatchEvent(new Event("parts:received"));

      setSubmitting(false);
      close();
    } catch (e: unknown) {
      setSubmitting(false);
      setErr(e instanceof Error ? e.message : "Receive failed.");
    }
  }

  if (!open) return null;

  const backdrop = "fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px]";
  const panel =
    "fixed right-0 top-0 z-[61] h-full w-full max-w-xl border-l border-white/10 bg-neutral-950/70 backdrop-blur-xl shadow-[-20px_0_60px_rgba(0,0,0,0.75)]";
  const header = "border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent px-5 py-4";
  const body = "px-5 py-4 space-y-4";
  const footer =
    "absolute bottom-0 left-0 right-0 border-t border-white/10 bg-neutral-950/70 px-5 py-4";

  const input =
    "w-full rounded-xl border border-white/10 bg-neutral-950/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#8b5a2b]/35";
  const select =
    "w-full rounded-xl border border-white/10 bg-neutral-950/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#8b5a2b]/35";

  const btnBase =
    "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60";
  const btnGhost = `${btnBase} border-white/10 bg-neutral-950/20 hover:bg-white/5`;
  const btnCopper = `${btnBase} border-[#8b5a2b]/60 text-[#c88a4d] bg-neutral-950/20 hover:bg-[#8b5a2b]/10`;

  return (
    <>
      <div className={backdrop} onClick={close} />

      <div className={panel} role="dialog" aria-modal="true" aria-label="Receive drawer">
        <div className={header}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">Parts</div>
              <div className="mt-1 truncate text-xl font-semibold text-white">{title}</div>
              <div className="mt-2 text-sm text-neutral-400">
                Receive inventory against a specific request item (supports partial receive).
              </div>
            </div>

            <button type="button" onClick={close} className={btnGhost} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className={body}>
          {item ? (
            <div className="rounded-2xl border border-white/10 bg-neutral-950/35 p-4">
              <div className="text-sm font-semibold text-white">
                {item.part_name?.trim() ? item.part_name : item.description}
              </div>

              <div className="mt-2 grid gap-2 text-xs text-neutral-400">
                <div>
                  <span className="text-neutral-500">Item:</span>{" "}
                  <span className="text-neutral-200">{item.id.slice(0, 8)}</span>
                  {item.request_id ? (
                    <>
                      {" "}
                      <span className="text-neutral-600">·</span>{" "}
                      <span className="text-neutral-500">Request:</span>{" "}
                      <span className="text-neutral-200">{String(item.request_id).slice(0, 8)}</span>
                    </>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  <div>
                    <span className="text-neutral-500">Approved:</span>{" "}
                    <span className="text-neutral-200">{n(item.qty_approved)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Received:</span>{" "}
                    <span className="text-neutral-200">{n(item.qty_received)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Remaining:</span>{" "}
                    <span className="text-neutral-200">{remaining}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Status:</span>{" "}
                    <span className="text-neutral-200">{item.status ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-neutral-950/35 p-4 text-sm text-neutral-400">
              No item selected.
            </div>
          )}

          {err ? (
            <div className="rounded-xl border border-red-500/30 bg-red-950/35 p-3 text-sm text-red-200">
              {err}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Location</div>
              <select
                className={select}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={!!lockLocation}
              >
                {locations.length === 0 ? (
                  <option value="">No locations</option>
                ) : (
                  locations.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">PO (optional)</div>
              <select
                className={select}
                value={poId}
                onChange={(e) => setPoId(e.target.value)}
                disabled={!!lockPo || !purchaseOrders || purchaseOrders.length === 0}
              >
                <option value="">— none —</option>
                {(purchaseOrders ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-neutral-500">
                If selected, receiving is attributed to that PO via the RPC.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-950/20 p-4">
            <div className="mb-1 text-xs text-neutral-400">Receive Qty</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${input} w-48`}
                type="number"
                min={0.01}
                step={0.01}
                value={qty === "" ? "" : String(qty)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") setQty("");
                  else setQty(Math.max(0, Number(raw)));
                }}
                placeholder="0"
              />

              <button
                type="button"
                className={btnGhost}
                onClick={() => setQty(remaining > 0 ? remaining : "")}
                disabled={!item || remaining <= 0}
                title="Fill with remaining"
              >
                Receive remaining
              </button>

              <button
                type="button"
                className={btnGhost}
                onClick={() => setQty(1)}
                disabled={!item}
                title="Quick set to 1"
              >
                +1
              </button>
            </div>

            {remaining > 0 ? (
              <div className="mt-2 text-[11px] text-neutral-500">
                Recommended max: <span className="text-neutral-200">{remaining}</span>
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-neutral-500">
                Remaining unknown or 0 (check approved/received values).
              </div>
            )}
          </div>
        </div>

        <div className={footer}>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className={btnGhost} onClick={close}>
              Cancel
            </button>
            <button type="button" className={btnCopper} onClick={() => void submit()} disabled={!canSubmit}>
              {submitting ? "Receiving…" : "Receive"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}