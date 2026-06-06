"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import WorkOrderBoardWidget from "@shared/components/workboard/WorkOrderBoardWidget";
import { PortalActionCard, PortalEmptyState, PortalPageHeader, PortalPrimaryButton, PortalSecondaryButton, PortalSectionCard, PortalStatCard, PortalStatusChip } from "@/features/portal/components/PortalUi";

type DB = Database;
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type CustomerPortalInviteRow =
  DB["public"]["Tables"]["customer_portal_invites"]["Row"];
type BookingRow = DB["public"]["Tables"]["bookings"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

const formatWhen = (iso: string) => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return "—"; return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
const formatWoRef = (wo: Pick<WorkOrderRow, "id" | "status" | "created_at" | "invoice_sent_at" | "approval_state"> | null) => wo ? `#${wo.id?.slice(0, 8) ?? "—"}` : "—";

export default function PortalHomePage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [loading, setLoading] = useState(true);
  const [vehiclesCount, setVehiclesCount] = useState<number | null>(null);
  const [nextBookingAt, setNextBookingAt] = useState<string | null>(null);
  const [activeWo, setActiveWo] = useState<Pick<WorkOrderRow, "id" | "status" | "created_at" | "invoice_sent_at" | "approval_state"> | null>(null);
  const [requiresInvite, setRequiresInvite] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (!mounted) return;

      if (userErr || !user) {
        setRequiresInvite(false);
        setVehiclesCount(null);
        setNextBookingAt(null);
        setActiveWo(null);
        setLoading(false);
        return;
      }

      const { data: cust, error: custErr } = await supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle<Pick<CustomerRow, "id">>();
      if (!mounted) return;

      if (custErr || !cust?.id) {
        setRequiresInvite(true);
        setVehiclesCount(null);
        setNextBookingAt(null);
        setActiveWo(null);
        setLoading(false);
        return;
      }

      const normalizedUserEmail = (user.email ?? "").trim().toLowerCase();
      const { data: inviteEvidence, error: inviteErr } = await supabase
        .from("customer_portal_invites")
        .select("id, customer_id, email")
        .eq("customer_id", cust.id)
        .limit(10);
      if (!mounted) return;

      const hasInviteEvidence =
        !inviteErr &&
        Array.isArray(inviteEvidence) &&
        inviteEvidence.some((row) => {
          const invite = row as Pick<
            CustomerPortalInviteRow,
            "id" | "customer_id" | "email"
          >;
          return (
            invite.customer_id === cust.id &&
            normalizedUserEmail.length > 0 &&
            invite.email.trim().toLowerCase() === normalizedUserEmail
          );
        });

      if (!hasInviteEvidence) {
        setRequiresInvite(true);
        setVehiclesCount(null);
        setNextBookingAt(null);
        setActiveWo(null);
        setLoading(false);
        return;
      }

      setRequiresInvite(false);

      const { count: vCount } = await supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("customer_id", cust.id);
      const nowIso = new Date().toISOString();
      const { data: booking } = await supabase.from("bookings").select("starts_at").eq("customer_id", cust.id).gte("starts_at", nowIso).order("starts_at", { ascending: true }).limit(1).maybeSingle<Pick<BookingRow, "starts_at">>();
      const ACTIVE_STATUSES: Array<WorkOrderRow["status"]> = ["awaiting_approval", "queued", "planned", "in_progress"];
      const { data: wo } = await supabase.from("work_orders").select("id, status, created_at, invoice_sent_at, approval_state").eq("customer_id", cust.id).in("status", ACTIVE_STATUSES as string[]).order("created_at", { ascending: false }).limit(1).maybeSingle<Pick<WorkOrderRow, "id" | "status" | "created_at" | "invoice_sent_at" | "approval_state">>();

      if (!mounted) return;
      setVehiclesCount(typeof vCount === "number" ? vCount : null);
      setNextBookingAt(booking?.starts_at ?? null);
      setActiveWo(wo ?? null);
      setLoading(false);
    })();

    return () => { mounted = false; };
  }, [supabase]);

  if (loading) {
    return <div className="space-y-5 text-white"><PortalPageHeader eyebrow="Customer portal" title="What needs your attention today?" subtitle="Loading your latest status and activity." /></div>;
  }

  if (requiresInvite) {
    return (
      <div className="space-y-5 text-white">
        <PortalPageHeader
          eyebrow="Customer portal"
          title="Portal invite required"
          subtitle="Open the invite link sent by the shop, or ask the shop to resend your portal invite."
        />
      </div>
    );
  }

  const hasInvoice = !!activeWo && !!activeWo.invoice_sent_at && (activeWo.status === "ready_to_invoice" || activeWo.status === "invoiced");
  const hasQuote = !!activeWo && (activeWo.status === "awaiting_approval" || activeWo.approval_state === "awaiting_customer" || activeWo.approval_state === "requested");

  return <div className="space-y-5 text-white">
    <PortalPageHeader eyebrow="Customer portal" title="What needs your attention today?" subtitle="Track active work, approve recommendations, and request service in one place." actions={<><PortalPrimaryButton href="/portal/request/when">Request service</PortalPrimaryButton><PortalSecondaryButton href="/portal/customer-appointments">Appointments</PortalSecondaryButton></>} />

    <PortalSectionCard title="Current status" subtitle="Your latest request and next appointment.">
      <div className="grid gap-3 sm:grid-cols-3"><PortalStatCard title="Active request" value={formatWoRef(activeWo)} sub={activeWo?.status ? `Status: ${activeWo.status}` : "No open request"} /><PortalStatCard title="Next appointment" value={nextBookingAt ? formatWhen(nextBookingAt) : "—"} /><PortalStatCard title="Vehicles" value={vehiclesCount == null ? "—" : String(vehiclesCount)} sub="Saved to your account" /></div>
    </PortalSectionCard>

    <PortalSectionCard title="Live work status" right={<Link href="/portal/status" className="text-xs text-neutral-300 underline">Details</Link>}>
      <WorkOrderBoardWidget variant="portal" href="/portal/status" />
    </PortalSectionCard>

    <div className="grid gap-3 sm:grid-cols-3"><PortalActionCard href="/portal/request/when" title="Request service" subtitle="Start a new service request now." prominent /><PortalActionCard href="/portal/vehicles" title="Manage vehicles" subtitle="Update VIN, mileage, and details." /><PortalActionCard href="/portal/customer-appointments" title="Appointments" subtitle="View upcoming and past bookings." /></div>

    <PortalSectionCard title="Recent activity" subtitle="Quote and invoice milestones are highlighted here." right={<PortalStatusChip label="Live" />}>
      {hasInvoice && activeWo ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Invoice ready</p><p className="text-sm text-neutral-100">Work Order {formatWoRef(activeWo)} sent {activeWo.invoice_sent_at ? formatWhen(activeWo.invoice_sent_at) : "recently"}</p></div><PortalPrimaryButton href={`/portal/invoices/${activeWo.id}`}>View invoice</PortalPrimaryButton></div> : hasQuote && activeWo ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Quote ready</p><p className="text-sm text-neutral-100">Work Order {formatWoRef(activeWo)} is waiting for your approval.</p></div><PortalPrimaryButton href={`/portal/quotes/${activeWo.id}`}>Review quote</PortalPrimaryButton></div> : <PortalEmptyState title="No recent activity" body="After you submit a request, updates will appear here." />}
    </PortalSectionCard>
  </div>;
}
