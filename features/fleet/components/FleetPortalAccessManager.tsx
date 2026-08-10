"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, MailPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Fleet = {
  id: string;
  name: string;
};

type InviteRole = "viewer" | "approver" | "manager";

type Invite = {
  id: string;
  fleet_id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type InvitePayload = {
  fleets?: Fleet[];
  fleet?: Fleet;
  invites?: Invite[];
  error?: string;
};

export default function FleetPortalAccessManager() {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [fleetId, setFleetId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("viewer");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateFleet, setShowCreateFleet] = useState(false);
  const [fleetName, setFleetName] = useState("");
  const [fleetContactName, setFleetContactName] = useState("");
  const [fleetContactEmail, setFleetContactEmail] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (preferredFleetId?: string) => {
    setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/portal/fleet/invites", {
        cache: "no-store",
      });
      const payload = (await response
        .json()
        .catch(() => null)) as InvitePayload | null;

      if (!response.ok) {
        throw new Error(
          payload?.error || "Fleet portal access could not be loaded.",
        );
      }

      const nextFleets = payload?.fleets ?? [];
      setFleets(nextFleets);
      setInvites(payload?.invites ?? []);

      const requestedFleetId = new URLSearchParams(window.location.search).get(
        "fleetId",
      );
      setFleetId((current) => {
        const preferred = preferredFleetId || current || requestedFleetId || "";
        return nextFleets.some((fleet) => fleet.id === preferred)
          ? preferred
          : (nextFleets[0]?.id ?? "");
      });
    } catch (value) {
      setLoadError(
        value instanceof Error
          ? value.message
          : "Fleet portal access could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);

    try {
      const response = await fetch("/api/portal/fleet/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetId, email, role }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as InvitePayload | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Invitation could not be sent.");
      }

      toast.success("Fleet portal invitation sent.");
      setEmail("");
      await load();
    } catch (value) {
      toast.error(
        value instanceof Error
          ? value.message
          : "Invitation could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  async function createFleet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);

    try {
      const response = await fetch("/api/portal/fleet/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_fleet",
          name: fleetName,
          contactName: fleetContactName,
          contactEmail: fleetContactEmail,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as InvitePayload | null;
      if (!response.ok || !payload?.fleet) {
        throw new Error(
          payload?.error || "Fleet relationship could not be created.",
        );
      }

      setFleetName("");
      setFleetContactName("");
      setFleetContactEmail("");
      setShowCreateFleet(false);
      await load(payload.fleet.id);
      toast.success(
        "Fleet relationship created. You can send the invitation now.",
      );
    } catch (value) {
      toast.error(
        value instanceof Error
          ? value.message
          : "Fleet relationship could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 text-[color:var(--theme-text-primary)] xl:px-6">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Fleet portal
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
          Invite & access
        </h1>
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
          Invite fleet managers, dispatchers, and drivers into the correct
          fleet-scoped portal.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <section
          aria-busy={loading || sending || creating}
          className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <MailPlus className="h-4 w-4 text-[var(--accent-copper)]" />
              Fleet relationship & invitation
            </div>
            {!loading && fleets.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowCreateFleet((current) => !current)}
                className="text-xs font-semibold text-[var(--accent-copper)] hover:underline"
              >
                {showCreateFleet ? "Cancel" : "New relationship"}
              </button>
            ) : null}
          </div>

          {loading ? (
            <div
              role="status"
              className="rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-8 text-center text-sm text-[color:var(--theme-text-secondary)]"
            >
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              Loading fleets…
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-500/40 bg-red-950/20 p-4 text-sm text-red-100"
            >
              <p>{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-lg border border-red-200/30 px-3 py-2 text-xs font-semibold transition hover:bg-red-100/10"
              >
                Retry loading fleet access
              </button>
            </div>
          ) : showCreateFleet || fleets.length === 0 ? (
            <form
              onSubmit={createFleet}
              className="space-y-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-4"
            >
              <div>
                <p className="font-semibold">Create the Fleet relationship</p>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  This establishes the Shop connection. Workspace details,
                  users, assets, and maintenance are managed inside Fleet.
                </p>
              </div>
              <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Fleet name
                <input
                  required
                  maxLength={120}
                  value={fleetName}
                  onChange={(event) => setFleetName(event.target.value)}
                  placeholder="Northside Transport"
                  className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
                />
              </label>
              <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Primary contact <span className="font-normal">(optional)</span>
                <input
                  maxLength={120}
                  value={fleetContactName}
                  onChange={(event) => setFleetContactName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
                />
              </label>
              <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Contact email <span className="font-normal">(optional)</span>
                <input
                  type="email"
                  maxLength={254}
                  value={fleetContactEmail}
                  onChange={(event) => setFleetContactEmail(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
                />
              </label>
              <button
                type="submit"
                disabled={creating || !fleetName.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {creating ? "Creating…" : "Create relationship"}
              </button>
            </form>
          ) : (
            <form onSubmit={send} className="space-y-4">
              <div>
                <label
                  htmlFor="fleet-portal-fleet"
                  className="text-xs font-semibold text-[color:var(--theme-text-secondary)]"
                >
                  Fleet
                </label>
                <select
                  id="fleet-portal-fleet"
                  required
                  value={fleetId}
                  onChange={(event) => setFleetId(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
                >
                  <option value="">Select fleet</option>
                  {fleets.map((fleet) => (
                    <option key={fleet.id} value={fleet.id}>
                      {fleet.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="fleet-invite-email"
                  className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]"
                >
                  Invitee email
                </label>
                <input
                  id="fleet-invite-email"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="manager@fleet.com"
                  className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
                />
              </div>

              <div>
                <label
                  htmlFor="fleet-invite-role"
                  className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]"
                >
                  Portal permissions
                </label>
                <select
                  id="fleet-invite-role"
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as InviteRole)
                  }
                  className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
                >
                  <option value="viewer">Driver</option>
                  <option value="approver">Dispatcher</option>
                  <option value="manager">Fleet manager</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={sending || !fleetId}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-60"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {sending ? "Sending…" : "Send secure invitation"}
              </button>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)]">
          <div className="flex items-center gap-2 font-semibold">
            <Building2 className="h-4 w-4 text-[var(--accent-copper)]" />
            Recent invitations
          </div>

          {loading ? (
            <div role="status" className="py-10 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              <span className="sr-only">Loading invitations</span>
            </div>
          ) : loadError ? (
            <div className="mt-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-8 text-center text-sm text-[color:var(--theme-text-muted)]">
              Invitations will appear after fleet access reloads.
            </div>
          ) : invites.length ? (
            <div className="mt-4 divide-y divide-[color:var(--theme-border-soft)]">
              {invites.map((invite) => {
                const fleet = fleets.find(
                  (item) => item.id === invite.fleet_id,
                );
                const status = invite.accepted_at
                  ? "Accepted"
                  : invite.revoked_at
                    ? "Revoked"
                    : new Date(invite.expires_at) <= new Date()
                      ? "Expired"
                      : "Pending";

                return (
                  <div
                    key={invite.id}
                    className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="font-semibold">{invite.email}</div>
                      <div className="text-xs text-[color:var(--theme-text-muted)]">
                        {fleet?.name || "Fleet"} ·{" "}
                        <span className="capitalize">{invite.role}</span>
                      </div>
                    </div>
                    <div className="self-center rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                      {status}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-8 text-center text-sm text-[color:var(--theme-text-muted)]">
              No fleet portal invitations yet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
