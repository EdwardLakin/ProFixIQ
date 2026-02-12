
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SignaturePad, { openSignaturePad } from "@/features/shared/signaturePad/controller";
import { formatCurrency } from "@/features/shared/lib/formatCurrency";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderUpdate = DB["public"]["Tables"]["work_orders"]["Update"];

type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];

type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type QuoteLineUpdate = DB["public"]["Tables"]["work_order_quote_lines"]["Update"];

type Profile = DB["public"]["Tables"]["profiles"]["Row"];

const SIGNATURE_BUCKET = "signatures";

/* ----------------------------- helpers ----------------------------- */

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const fmt = (n: number) => {
  try {
    return formatCurrency(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
};

type Recordish = Record<string, unknown>;

function getStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Recordish)[key];
  return typeof v === "string" ? v : null;
}

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function statusLabel(s: string | null | undefined): string {
  return (s ?? "").replaceAll("_", " ").trim() || "—";
}

/* ----------------------- approvals list (cards) ----------------------- */

type WorkOrderWithMeta = WorkOrder & {
  shops?: Pick<Shop, "name"> | null;
  work_order_lines?: Array<Pick<Line, "id" | "status" | "approval_state" | "labor_time">>;
  work_order_quote_lines?: Array<Pick<QuoteLine, "id" | "stage">>;
  labor_hours?: number | null;
  waiting_for_parts?: boolean;
};

function ApprovalsList(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<WorkOrderWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [shopId, setShopId] = useState<string | null>(null);

  // Resolve shop_id from profile (this is the big missing piece)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        setErr("You must be signed in to view approvals.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "shop_id">>();

      if (cancelled) return;

      if (profErr) {
        setErr(profErr.message);
        setLoading(false);
        return;
      }

      if (!profile?.shop_id) {
        setErr("No shop is linked to your profile yet.");
        setLoading(false);
        return;
      }

      setShopId(profile.shop_id);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const load = async () => {
    if (!shopId) return;

    setLoading(true);
    setErr(null);

    // We fetch recent WOs for this shop, then filter in JS.
    // This avoids fragile `.or()` across joined columns and plays nicer with RLS.
    const { data: wo, error } = await supabase
      .from("work_orders")
      .select(
        `
        *,
        shops(name),
        work_order_lines(id,status,approval_state,labor_time),
        work_order_quote_lines(id,stage)
      `,
      )
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      setRows([]);
      setErr(error.message);
      setLoading(false);
      return;
    }

    const list = (wo ?? []) as unknown as WorkOrderWithMeta[];

    const PENDING_LINE_STATUSES = new Set<string>(["waiting_for_approval", "awaiting_approval"]);
    const isPendingLine = (
  l: NonNullable<WorkOrderWithMeta["work_order_lines"]>[number],
): boolean => {
      const st = safeTrim(l?.status).toLowerCase();
      const ap = safeTrim(l?.approval_state).toLowerCase();
      return PENDING_LINE_STATUSES.has(st) || ap === "pending";
    };

    const filtered = list.filter((w) => {
      const woStatus = safeTrim(w.status).toLowerCase();
      if (woStatus === "awaiting_approval") return true;

      const lines = Array.isArray(w.work_order_lines) ? w.work_order_lines : [];
      return lines.some((l) => isPendingLine(l));
    });

    const next = filtered.map((w) => {
      const lines = Array.isArray(w.work_order_lines) ? w.work_order_lines : [];
      const hours = lines.reduce((sum, l) => sum + (typeof l.labor_time === "number" ? l.labor_time : 0), 0);

      const qlines = Array.isArray(w.work_order_quote_lines) ? w.work_order_quote_lines : [];
      const hasQuotes = qlines.length > 0;

      // Badge rule: if no quote lines exist, consider it "waiting for parts"
      // (you can tighten this later if you have a dedicated parts-quoted flag/stage)
      const waitingForParts = !hasQuotes;

      return {
        ...w,
        labor_hours: hours,
        waiting_for_parts: waitingForParts,
      };
    });

    setRows(next);
    setLoading(false);
  };

  useEffect(() => {
    if (!shopId) return;
    void load();

    const ch = supabase
      .channel("qr:approvals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_quote_lines" },
        () => void load(),
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, shopId]);

  if (loading) return <div className="mt-6 text-muted-foreground">Loading…</div>;
  if (err) return <div className="mt-6 text-destructive">{err}</div>;

  if (rows.length === 0) {
    return <div className="mt-6 text-muted-foreground">No work orders waiting for approval.</div>;
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2 font-semibold">Awaiting Approval</div>

      <div className="divide-y divide-border">
        {rows.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate font-medium">
                  {w.custom_id ? `#${w.custom_id}` : `#${w.id.slice(0, 8)}`}
                </div>

                {w.waiting_for_parts ? (
                  <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200">
                    Waiting for parts
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                    Quotes ready
                  </span>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                {w.shops?.name ? `${w.shops.name} • ` : ""}
                {statusLabel(w.status)}
                {typeof w.labor_hours === "number" ? ` • ${w.labor_hours.toFixed(1)}h` : ""}
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <a
                href={`/work-orders/${w.id}/approve`}
                className="rounded border border-orange-500 px-3 py-1 text-sm text-orange-500 hover:bg-orange-500/10"
                title="Open customer-facing approval workflow"
              >
                Review &amp; Sign
              </a>
              <a
                href={`/work-orders/${w.id}`}
                className="rounded border border-border px-3 py-1 text-sm hover:bg-muted"
                title="Open this work order"
              >
                Open WO
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------- single WO review + sign ---------------------- */

function SingleQuoteReview({ woId }: { woId: string }): JSX.Element {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);

  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(true);

  const [customerEmail, setCustomerEmail] = useState<string>("");

  useEffect(() => {
    if (!woId) return;

    void (async () => {
      setLoading(true);

      const { data: woRow } = await supabase.from("work_orders").select("*").eq("id", woId).maybeSingle();
      setWo(woRow ?? null);

      setCustomerEmail("");
      const custId = woRow?.customer_id ?? null;

      if (typeof custId === "string" && custId) {
        const { data: cust } = await supabase.from("customers").select("email").eq("id", custId).maybeSingle();
        const email = typeof cust?.email === "string" ? cust.email.trim().toLowerCase() : "";
        setCustomerEmail(email);
      }

      if (woRow?.shop_id) {
        const { data: shopRow } = await supabase.from("shops").select("*").eq("id", woRow.shop_id).maybeSingle();
        setShop(shopRow ?? null);
      }

      const { data: lineRows } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", woId)
        .order("created_at", { ascending: true });

      setLines(lineRows ?? []);
      setLoading(false);
    })();
  }, [woId, supabase]);

  async function reloadQuotes() {
    if (!woId) return;
    setQuoteLoading(true);

    const { data: qRows, error: qErr } = await supabase
      .from("work_order_quote_lines")
      .select("*")
      .eq("work_order_id", woId)
      .order("created_at", { ascending: true });

    if (qErr) setQuoteLines([]);
    else setQuoteLines((qRows ?? []) as QuoteLine[]);

    setQuoteLoading(false);
  }

  useEffect(() => {
    void reloadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woId, supabase]);

  const laborRate = 120;
  const totalLaborHours = lines.reduce((sum, l) => sum + (typeof l.labor_time === "number" ? l.labor_time : 0), 0);
  const laborTotal = totalLaborHours * laborRate;
  const partsTotal = 0;
  const grandTotal = laborTotal + partsTotal;

  const getStage = (q: QuoteLine): string => getStringField(q, "stage") ?? "";
  const getDesc = (q: QuoteLine): string => getStringField(q, "description") ?? "Untitled quote line";
  const getNotes = (q: QuoteLine): string | null => getStringField(q, "notes");

  const advisorPendingQuotes = quoteLines.filter((q) => getStage(q) === "advisor_pending");
  const customerPendingQuotes = quoteLines.filter((q) => getStage(q) === "customer_pending");
  const decidedQuotes = quoteLines.filter((q) => ["customer_approved", "customer_declined"].includes(getStage(q)));

  async function sendQuotesToCustomer(linesToSend: QuoteLine[]) {
    if (!linesToSend.length) return;

    const groupId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const patch: QuoteLineUpdate = {
      stage: "customer_pending",
      group_id: groupId,
      sent_to_customer_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("work_order_quote_lines")
      .update(patch)
      .in(
        "id",
        linesToSend.map((q) => q.id),
      );

    if (error) {
      alert(error.message);
      return;
    }

    const email = customerEmail.trim().toLowerCase();
    if (!email) {
      alert("Quote sent to customer.");
      alert("Portal invite was not sent because no customer email was found on this work order.");
      await reloadQuotes();
      return;
    }

    const next = `/work-orders/${woId}/approve`;

    try {
      const inviteRes = await fetch("/api/portal/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });

      const inviteJson = (await inviteRes.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!inviteRes.ok || !inviteJson?.ok) {
        alert("Quote sent to customer.");
        alert(inviteJson?.error ?? "Failed to send portal invite email.");
      } else {
        alert("Quote sent to customer.");
        alert("Portal invite email sent.");
      }
    } catch {
      alert("Quote sent to customer.");
      alert("Failed to send portal invite email.");
    }

    await reloadQuotes();
  }

  async function approveQuoteLine(q: QuoteLine) {
    const patch: QuoteLineUpdate = {
      stage: "customer_approved",
      approved_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("work_order_quote_lines").update(patch).eq("id", q.id);
    if (error) {
      alert(error.message);
      return;
    }
    await reloadQuotes();
  }

  async function declineQuoteLine(q: QuoteLine) {
    const patch: QuoteLineUpdate = {
      stage: "customer_declined",
      declined_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("work_order_quote_lines").update(patch).eq("id", q.id);
    if (error) {
      alert(error.message);
      return;
    }
    await reloadQuotes();
  }

  async function handleSignatureSave(base64: string) {
    if (!woId) return;

    try {
      const blob = dataUrlToBlob(base64);
      const filename = `wo/${wo?.shop_id ?? "unknown"}/${woId}/${Date.now()}.png`;

      const { error: upErr } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .upload(filename, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;

      const patch: WorkOrderUpdate = {
        customer_approval_signature_path: filename,
        customer_approval_at: new Date().toISOString(),
        status: "queued" as WorkOrderUpdate["status"],
      };

      const { error: updErr } = await supabase.from("work_orders").update(patch).eq("id", woId);
      if (updErr) throw updErr;

      alert("Work order approved and signed!");
      router.push("/work-orders/create?from=review&new=1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save signature";
      alert(msg);
    }
  }

  async function markAwaitingApproval() {
    if (!woId) return;

    try {
      const patch: WorkOrderUpdate = {
        status: "awaiting_approval" as WorkOrderUpdate["status"],
        customer_approval_signature_path: null,
        customer_approval_at: null,
      };

      const { error } = await supabase.from("work_orders").update(patch).eq("id", woId);
      if (error) throw error;

      alert("Saved. This work order is now awaiting customer approval.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update status.";
      alert(msg);
    }
  }

  function copyApprovalLink() {
    if (!woId) return;
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const url = `${origin || ""}/work-orders/${woId}/approve`;
    navigator.clipboard
      .writeText(url)
      .then(() => alert("Approval link copied to clipboard."))
      .catch(() => alert(url));
  }

  if (loading) return <div className="mt-6 text-muted-foreground">Loading…</div>;
  if (!wo) return <div className="mt-6 text-destructive">Work order not found.</div>;

  return (
    <>
      <div className="mt-2 text-sm text-muted-foreground">
        <div>Work Order ID: {wo.id}</div>
        <div>Status: {statusLabel(wo.status)}</div>
        {shop?.name && <div>Shop: {shop.name}</div>}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="font-semibold">Quote lines</div>
          {advisorPendingQuotes.length > 0 && (
            <button
              onClick={() => void sendQuotesToCustomer(advisorPendingQuotes)}
              className="rounded border border-orange-500 px-3 py-1 text-sm text-orange-500 hover:bg-orange-500/10"
            >
              Send to customer
            </button>
          )}
        </div>

        {quoteLoading ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">Loading quotes…</div>
        ) : quoteLines.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">No quote lines for this work order yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {advisorPendingQuotes.length > 0 && (
              <div className="bg-slate-950/60">
                <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-blue-300">
                  Awaiting advisor review
                </div>
                {advisorPendingQuotes.map((q) => (
                  <div key={q.id} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{getDesc(q)}</div>
                        {getNotes(q) && (
                          <div className="mt-0.5 text-xs text-muted-foreground">{getNotes(q)}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => void approveQuoteLine(q)}
                          className="rounded border border-green-600 px-2 py-1 text-xs text-green-200 hover:bg-green-900/30"
                        >
                          Approve now
                        </button>
                        <button
                          onClick={() => void declineQuoteLine(q)}
                          className="rounded border border-red-600 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {customerPendingQuotes.length > 0 && (
              <div>
                <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-amber-300">
                  Sent to customer
                </div>
                {customerPendingQuotes.map((q) => (
                  <div key={q.id} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{getDesc(q)}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">Waiting on customer response</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {decidedQuotes.length > 0 && (
              <div className="bg-neutral-950/60">
                <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Customer decisions
                </div>
                {decidedQuotes.map((q) => (
                  <div key={q.id} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{getDesc(q)}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {getStage(q) === "customer_approved" ? "Approved" : "Declined"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2 font-semibold">Line Items</div>
        <div className="divide-y divide-border">
          {lines.length === 0 ? (
            <div className="px-4 py-3 text-muted-foreground">No items yet.</div>
          ) : (
            lines.map((l) => (
              <div key={l.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{l.description || l.complaint || "Untitled job"}</div>
                    <div className="text-xs text-muted-foreground">
                      {String(l.job_type ?? "job").replaceAll("_", " ")} •{" "}
                      {typeof l.labor_time === "number" ? `${l.labor_time}h` : "—"} •{" "}
                      {statusLabel(l.status ?? "awaiting")}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {typeof l.labor_time === "number" ? fmt(l.labor_time * laborRate) : "—"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span>
              Labor ({totalLaborHours.toFixed(1)}h @ {fmt(laborRate)}/hr)
            </span>
            <span className="font-medium">{fmt(laborTotal)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Parts</span>
            <span className="font-medium">{fmt(partsTotal)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-orange-500">{fmt(grandTotal)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={async () => {
            const base64 = await openSignaturePad({ shopName: shop?.name || "" });
            if (!base64) return;
            await handleSignatureSave(base64);
          }}
          className="rounded bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
        >
          Approve &amp; Sign
        </button>

        <button
          onClick={markAwaitingApproval}
          className="rounded border border-border px-4 py-2 hover:bg-muted"
          title="Save this work order as awaiting customer approval"
        >
          Save for Customer Approval
        </button>

        <button
          onClick={copyApprovalLink}
          className="rounded border border-border px-4 py-2 hover:bg-muted"
          title="Copy link to the customer-facing approval page"
        >
          Copy Approval Link
        </button>

        <a href={`/work-orders/${woId}`} className="rounded border border-border px-4 py-2 hover:bg-muted">
          Back to Work Order
        </a>
      </div>
    </>
  );
}

/* ------------------------------ page ------------------------------ */

export default function QuoteReviewPage(): JSX.Element {
  const woId = useSearchParams().get("woId");
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <button onClick={() => router.back()} className="text-sm text-orange-500 hover:underline">
            ← Back
          </button>
        </div>

        <h1 className="text-2xl font-semibold">Quote Review</h1>

        {!woId ? (
          <>
            <p className="mt-1 text-muted-foreground">Work orders waiting for customer approval</p>
            <ApprovalsList />
            <SignaturePad />
          </>
        ) : (
          <>
            <SingleQuoteReview woId={woId} />
            <SignaturePad />
          </>
        )}
      </div>
    </div>
  );
}