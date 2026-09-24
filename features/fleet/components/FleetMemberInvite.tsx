"use client";

import { useEffect, useState } from "react";
import { Loader2, MailPlus, Plus, X } from "lucide-react";

type Fleet = { id: string; name: string };
type Invite = { id: string; email: string; role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; delivery_status: string | null };

export default function FleetMemberInvite({ fleets, initialFleetId, driverOnly = false }: {
  fleets: Fleet[]; initialFleetId?: string | null; driverOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fleetId, setFleetId] = useState(initialFleetId && fleets.some(f => f.id === initialFleetId) ? initialFleetId : fleets[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "approver" | "manager">("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);

  useEffect(() => {
    if (!open || !fleetId) return;
    let cancelled = false;
    fetch(`/api/portal/fleet/member-invitations?fleetId=${encodeURIComponent(fleetId)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load invitations");
        if (!cancelled) setInvites(body.invites ?? []);
      }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load invitations"); });
    return () => { cancelled = true; };
  }, [open, fleetId, notice]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/portal/fleet/member-invitations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetId, email, role: driverOnly ? "viewer" : role }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Invitation could not be sent");
      setEmail("");
      setNotice(body.deliveryStatePersisted === false
        ? "Email accepted by provider, but delivery tracking could not be confirmed. Check invitation status before retrying."
        : "Invitation accepted by the email provider. The user will appear here after accepting.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invitation could not be sent");
    } finally { setBusy(false); }
  }
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setError(""); setNotice(""); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600">
        <Plus className="h-4 w-4" aria-hidden="true" /> {driverOnly ? "Add driver" : "Add user"}
      </button>
      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="fleet-invite-title" className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 text-[color:var(--theme-text-primary)] shadow-xl sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div><h2 id="fleet-invite-title" className="text-xl font-semibold">{driverOnly ? "Add driver" : "Add Fleet user"}</h2>
              <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Send a secure invitation to this Fleet workspace.</p></div>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close invitation form" className="rounded-lg border border-[color:var(--theme-border-soft)] p-2"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block text-xs font-semibold">Fleet
              <select required value={fleetId} onChange={e => { setFleetId(e.target.value); setError(""); }} className="mt-1.5 h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm">
                {fleets.map(fleet => <option value={fleet.id} key={fleet.id}>{fleet.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold">Email address
              <input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="driver@example.com" className="mt-1.5 h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm" />
            </label>
            {!driverOnly && <label className="block text-xs font-semibold">Fleet role
              <select value={role} onChange={e => setRole(e.target.value as typeof role)} className="mt-1.5 h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm">
                <option value="viewer">Driver</option><option value="approver">Dispatcher</option><option value="manager">Fleet manager</option>
              </select>
            </label>}
            <p className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-xs text-[color:var(--theme-text-secondary)]">
              <strong className="block text-[color:var(--theme-text-primary)]">Fleet access only</strong>
              {driverOnly ? "Driver Portal access; assign an asset after invitation acceptance." : "Roles apply to Fleet, not Shop staff or Shop work orders."}
            </p>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            {notice && <p role="status" className="text-sm text-emerald-500">{notice}</p>}
            <button type="submit" disabled={busy || !fleetId || !email.trim()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />} {busy ? "Sending…" : "Send invitation"}
            </button>
          </form>
          <div className="mt-6 border-t border-[color:var(--theme-border-soft)] pt-4">
            <h3 className="text-sm font-semibold">Recent invitations</h3>
            {invites.filter(invite => !driverOnly || invite.role === "viewer").length === 0
              ? <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">No invitations for this Fleet yet.</p>
              : <div className="mt-2 space-y-2">{invites.filter(invite => !driverOnly || invite.role === "viewer").map(invite => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--theme-border-soft)] p-3 text-xs"><span className="break-all">{invite.email}</span><span className="text-[color:var(--theme-text-secondary)]">{invite.accepted_at ? "Accepted" : invite.revoked_at ? "Revoked" : new Date(invite.expires_at) < new Date() ? "Expired" : invite.delivery_status === "accepted" ? "Awaiting delivery" : invite.delivery_status === "failed" || invite.delivery_status === "suppressed" ? "Not delivered" : "Pending"}</span></div>)}</div>}
          </div>
        </section>
      </div>}
    </>
  );
}
