"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, MailPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Fleet = { id: string; name: string };
type Invite = { id: string; fleet_id: string; email: string; role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string };

export default function FleetPortalAccessManager() {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [fleetId, setFleetId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function load() {
    const response = await fetch("/api/portal/fleet/invites", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { fleets?: Fleet[]; invites?: Invite[] } | null;
    if (response.ok) {
      setFleets(payload?.fleets ?? []);
      setInvites(payload?.invites ?? []);
      setFleetId((current) => current || payload?.fleets?.[0]?.id || "");
    } else toast.error("Fleet portal access could not be loaded.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    try {
      const response = await fetch("/api/portal/fleet/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fleetId, email, role }) });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Invitation could not be sent.");
      toast.success("Fleet portal invitation sent.");
      setEmail("");
      await load();
    } catch (value) {
      toast.error(value instanceof Error ? value.message : "Invitation could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 text-[color:var(--theme-text-primary)] xl:px-6">
      <div><div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">Fleet portal</div><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Invite & access</h1><p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">Invite fleet managers, approvers, and drivers into the correct fleet-scoped portal.</p></div>
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <form onSubmit={send} className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)]">
          <div className="flex items-center gap-2 font-semibold"><MailPlus className="h-4 w-4 text-[var(--accent-copper)]" /> Send fleet invitation</div>
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">Fleet<select required value={fleetId} onChange={(event) => setFleetId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"><option value="">Select fleet</option>{fleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.name}</option>)}</select></label>
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">Invitee email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="manager@fleet.com" className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]" /></label>
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">Portal role<select value={role} onChange={(event) => setRole(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"><option value="viewer">Viewer / driver</option><option value="approver">Approver / dispatcher</option><option value="manager">Fleet manager</option></select></label>
          <button type="submit" disabled={sending || loading || !fleetId} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-60">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{sending ? "Sending…" : "Send secure invitation"}</button>
        </form>

        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)]">
          <div className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-[var(--accent-copper)]" /> Recent invitations</div>
          {loading ? <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : invites.length ? <div className="mt-4 divide-y divide-[color:var(--theme-border-soft)]">{invites.map((invite) => { const fleet = fleets.find((item) => item.id === invite.fleet_id); const status = invite.accepted_at ? "Accepted" : invite.revoked_at ? "Revoked" : new Date(invite.expires_at) <= new Date() ? "Expired" : "Pending"; return <div key={invite.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]"><div><div className="font-semibold">{invite.email}</div><div className="text-xs text-[color:var(--theme-text-muted)]">{fleet?.name || "Fleet"} · <span className="capitalize">{invite.role}</span></div></div><div className="self-center rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)]">{status}</div></div>; })}</div> : <div className="mt-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-8 text-center text-sm text-[color:var(--theme-text-muted)]">No fleet portal invitations yet.</div>}
        </section>
      </div>
    </div>
  );
}
