"use client";

import { useCallback, useEffect, useState } from "react";
import { MailPlus, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";

type CustomerInvite = {
  id: string; email: string; created_at: string; expires_at: string;
  accepted_at: string | null; revoked_at: string | null;
};
type FleetInvite = {
  id: string; fleet_id: string; email: string; role: string; created_at: string;
  expires_at: string; accepted_at: string | null; revoked_at: string | null;
  delivery_status: string | null; delivery_reserved_until: string | null;
};
type Access = {
  ok: boolean; email: string; customerActive: boolean; canViewFleet: boolean;
  customer: { status: string; invite: CustomerInvite | null };
  fleets: { id: string; name: string; active: boolean; invites: FleetInvite[] }[];
};
const panel = "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-4";
const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-3 py-2 text-xs font-bold text-[color:var(--theme-text-on-accent)] disabled:cursor-not-allowed disabled:opacity-50";
const fmt = (date: string | null | undefined) => date ? new Date(date).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";

export function CustomerPortalAccess({ customerId }: { customerId: string }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/customers/${customerId}/portal-access`, { cache: "no-store" });
      const payload = await response.json() as Access & { error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Portal status could not be loaded.");
      setAccess(payload);
      setError("");
    } catch (value) {
      setAccess(null);
      setError(value instanceof Error ? value.message : "Portal status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);
  useEffect(() => { setLoading(true); void load(); }, [load]);

  async function sendCustomer() {
    if (!access?.email || !access.customerActive) return;
    setSending("customer");
    try {
      const response = await fetch("/api/portal/send-invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, email: access.email }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Customer invitation could not be sent.");
      toast.success("Customer portal invitation submitted.");
      await load();
    } catch (value) {
      toast.error(value instanceof Error ? value.message : "Customer invitation could not be sent.");
    } finally { setSending(""); }
  }

  async function sendFleet(fleetId: string, invite?: FleetInvite) {
    if (!access?.email) return;
    setSending(fleetId);
    try {
      const response = await fetch("/api/portal/fleet/invites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invite
          ? { action: "resend_invite", inviteId: invite.id }
          : { fleetId, email: access.email, role: "manager" }),
      });
      const payload = await response.json() as {
        error?: string; invitationAccepted?: boolean; deliveryStatePersisted?: boolean;
        deliveryIssue?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Fleet invitation could not be sent.");
      if (payload.deliveryStatePersisted === false) {
        toast.error("Fleet invite exists, but delivery state could not be confirmed. Check Fleet access before retrying.");
      } else if (payload.invitationAccepted) {
        toast.success("Fleet invitation accepted by email provider; awaiting delivery confirmation.");
      } else {
        toast.error(`Fleet invitation not delivered: ${payload.deliveryIssue || "check Fleet access"}.`);
      }
      await load();
    } catch (value) {
      toast.error(value instanceof Error ? value.message : "Fleet invitation could not be sent.");
    } finally { setSending(""); }
  }

  const latestFleetInvite = (invites: FleetInvite[]) =>
    invites.filter((invite) => invite.email.toLowerCase() === access?.email.toLowerCase() && invite.role === "manager")[0];
  return (
    <section className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[var(--theme-shadow-medium)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Portal access</h3>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Invitation and activation status for this customer and connected fleets.</p>
        </div>
        <button type="button" onClick={() => { setLoading(true); void load(); }} aria-label="Refresh portal access" className="rounded-lg border border-[color:var(--desktop-border)] p-2"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {loading ? <p role="status" className="mt-4 text-xs">Loading portal access…</p> : error ? (
        <p role="alert" className="mt-4 text-sm text-rose-400">{error}</p>
      ) : access ? <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className={panel}>
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--accent-copper)]" /> Customer Portal</div>
          <p className="mt-2 break-all text-xs text-[color:var(--theme-text-secondary)]">{access.email || "Customer email required"}</p>
          <p className="mt-2 text-sm font-semibold capitalize">{access.customer.status.replaceAll("_", " ")}</p>
          {access.customer.invite ? <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Invited: {fmt(access.customer.invite.created_at)} · {access.customer.invite.accepted_at
              ? `Activated: ${fmt(access.customer.invite.accepted_at)}`
              : `Expires: ${fmt(access.customer.invite.expires_at)}`}
          </p> : null}
          <button type="button" className={`${button} mt-3`} disabled={!!sending || !access.email || !access.customerActive || access.customer.status === "active"}
            onClick={() => void sendCustomer()}>
            <MailPlus className="h-4 w-4" /> {sending === "customer" ? "Sending…" : access.customer.status === "active" ? "Portal active" : access.customer.status === "not_invited" ? "Send portal invite" : "Resend portal invite"}
          </button>
          {!access.customerActive ? <p className="mt-2 text-xs text-amber-400">Archived or merged customer; invitations unavailable.</p> : null}
        </div>
        {access.canViewFleet ? <div className={panel}>
          <div className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4 text-[var(--accent-copper)]" /> Fleet Portal</div>
          {access.fleets.length ? access.fleets.map((fleet) => {
            const matching = fleet.invites.filter((invite) => invite.email.toLowerCase() === access.email.toLowerCase() && invite.role === "manager");
            const accepted = matching.find((invite) => !!invite.accepted_at && !invite.revoked_at);
            const invite = latestFleetInvite(fleet.invites);
            const reusable = invite && !invite.revoked_at && !invite.accepted_at;
            const reserved = !!invite?.delivery_reserved_until && new Date(invite.delivery_reserved_until) > new Date() &&
              (invite.delivery_status === "sending" || invite.delivery_status === "accepted");
            const status = accepted ? "Active" : !invite ? "Not invited" : invite.revoked_at ? "Revoked" :
              new Date(invite.expires_at) <= new Date() ? "Expired" :
              invite.delivery_status === "failed" || invite.delivery_status === "suppressed" ? "Not delivered" :
              invite.delivery_status === "accepted" ? "Awaiting delivery" : "Pending";
            return <div key={fleet.id} className="mt-3 border-t border-[color:var(--desktop-border)] pt-3">
              <p className="text-sm font-semibold">{fleet.name} · {status}</p>
              {invite ? <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Invited: {fmt(invite.created_at)} · {accepted ? `Activated: ${fmt(accepted.accepted_at)}` : `Expires: ${fmt(invite.expires_at)}`}</p> : null}
              <button type="button" className={`${button} mt-3`} disabled={!!sending || !access.email || !access.customerActive || !fleet.active || !!accepted || reserved}
                onClick={() => void sendFleet(fleet.id, reusable ? invite : undefined)}>
                <MailPlus className="h-4 w-4" /> {sending === fleet.id ? "Sending…" : accepted ? "Fleet access active" : reserved ? "Delivery in progress" : invite ? "Resend fleet invite" : "Send fleet invite"}
              </button>
            </div>;
          }) : <p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">No connected Fleet. Create or connect the relationship in Fleet before inviting members.</p>}
        </div> : null}
      </div> : null}
    </section>
  );
}
