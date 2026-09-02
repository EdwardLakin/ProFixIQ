"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, MailPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Fleet = {
  id: string;
  name: string;
  customer_id: string;
};

type CustomerCandidate = {
  id: string;
  name: string | null;
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
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
  delivery_status?:
    | "pending"
    | "sending"
    | "accepted"
    | "delivered"
    | "suppressed"
    | "failed"
    | null;
  delivery_attempted_at?: string | null;
  delivery_reserved_until?: string | null;
};

type InvitePayload = {
  fleets?: Fleet[];
  fleet?: Fleet;
  invites?: Invite[];
  customerCandidate?: CustomerCandidate | null;
  invitedEmail?: string;
  invitationAccepted?: boolean;
  invitationDelivered?: boolean;
  deliveryStatePersisted?: boolean;
  deliveryIssue?: "suppressed" | "failed";
  error?: string;
};

export default function FleetPortalAccessManager() {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);
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
  const [customerCandidate, setCustomerCandidate] =
    useState<CustomerCandidate | null>(null);

  const resendInvite = async (invite: Invite) => {
    setResendingId(invite.id);
    try {
      const response = await fetch("/api/portal/fleet/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_invite", inviteId: invite.id }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as InvitePayload | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Invitation could not be resent.");
      }
      // The role comes from the stored invitation, so an owning manager
      // invitation can never be downgraded by resending it.
      await load(invite.fleet_id);
      if (payload?.deliveryStatePersisted === false) {
        toast.error(
          `The resend to ${invite.email} was attempted, but its delivery state could not be confirmed. The row remains retryable; reload before trying again.`,
        );
      } else if (payload?.invitationAccepted) {
        toast.success(
          `Invitation to ${invite.email} was accepted by the email provider and is awaiting delivery confirmation.`,
        );
      } else if (payload?.invitationDelivered === false) {
        toast.error(
          payload.deliveryIssue === "suppressed"
            ? `${invite.email} is suppressed and received nothing.`
            : `The invitation to ${invite.email} could not be delivered.`,
        );
      } else {
        toast.success(
          `Invitation resent to ${invite.email} as ${invite.role}.`,
        );
      }
    } catch (value) {
      toast.error(
        value instanceof Error
          ? value.message
          : "Invitation could not be resent.",
      );
    } finally {
      setResendingId(null);
    }
  };

  const load = useCallback(async (preferredFleetId?: string) => {
    setLoading(true);
    setLoadError(null);

    try {
      const requestedCustomerId = new URLSearchParams(
        window.location.search,
      ).get("customerId");
      const endpoint = requestedCustomerId
        ? `/api/portal/fleet/invites?customerId=${encodeURIComponent(requestedCustomerId)}`
        : "/api/portal/fleet/invites";
      const response = await fetch(endpoint, {
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
      setCustomerCandidate(payload?.customerCandidate ?? null);

      const connectedFleet = requestedCustomerId
        ? nextFleets.find((fleet) => fleet.customer_id === requestedCustomerId)
        : null;
      if (payload?.customerCandidate && !connectedFleet) {
        const candidate = payload.customerCandidate;
        setFleetName(
          candidate.business_name?.trim() || candidate.name?.trim() || "",
        );
        setFleetContactName(
          [candidate.first_name, candidate.last_name]
            .filter(Boolean)
            .join(" ") ||
            candidate.name?.trim() ||
            "",
        );
        setFleetContactEmail(candidate.email ?? "");
        setShowCreateFleet(true);
      }

      const requestedFleetId = new URLSearchParams(window.location.search).get(
        "fleetId",
      );
      setFleetId((current) => {
        const preferred =
          preferredFleetId ||
          connectedFleet?.id ||
          current ||
          requestedFleetId ||
          "";
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

      if (payload?.deliveryStatePersisted === false) {
        toast.error(
          "The invitation was accepted by the email provider, but its delivery state could not be confirmed. Reload Fleet access before retrying.",
        );
      } else if (payload?.invitationAccepted) {
        toast.success(
          "Fleet portal invitation accepted by the email provider and awaiting delivery confirmation.",
        );
      } else {
        toast.success("Fleet portal invitation sent.");
      }
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
          customerId: customerCandidate?.id,
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
      const owner = payload.invitedEmail ?? fleetContactEmail;
      if (payload.deliveryStatePersisted === false) {
        toast.error(
          `Fleet created and delivery was attempted for ${owner}, but the delivery state could not be confirmed. The manager invitation remains listed as Delivery pending and can be resent.`,
        );
      } else if (payload.invitationAccepted) {
        toast.success(
          `Fleet relationship created. The manager invitation to ${owner} was accepted by the email provider and is awaiting delivery confirmation.`,
        );
      } else if (payload.invitationDelivered === false) {
        // The Fleet and its invitation exist; only delivery failed. Say so
        // plainly so staff resend rather than assuming the owner has access.
        toast.error(
          payload.deliveryIssue === "suppressed"
            ? `Fleet created, but ${owner} is suppressed and received nothing. The manager invitation is listed as Not delivered — use Resend on that row, or invite a different address as manager.`
            : `Fleet created, but the invitation to ${owner} could not be delivered. The manager invitation is listed as Not delivered — use Resend on that row.`,
        );
      } else {
        toast.success(
          `Fleet relationship created. Manager invitation sent to ${owner}.`,
        );
      }
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
                {customerCandidate ? (
                  <p className="mt-2 rounded-lg border border-[var(--accent-copper-soft)]/45 bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]">
                    Connecting the existing customer file for{" "}
                    <span className="font-semibold">
                      {customerCandidate.business_name ||
                        customerCandidate.name ||
                        "this customer"}
                    </span>
                    . No duplicate customer will be created.
                  </p>
                ) : null}
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
                Contact email
                <input
                  required
                  type="email"
                  maxLength={254}
                  value={fleetContactEmail}
                  onChange={(event) => setFleetContactEmail(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
                />
                <span className="mt-1 block font-normal text-[10px] text-[color:var(--theme-text-muted)]">
                  The owning Fleet manager invitation is sent here when the
                  relationship is created.
                </span>
              </label>
              <button
                type="submit"
                disabled={
                  creating || !fleetName.trim() || !fleetContactEmail.trim()
                }
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
                const deliveryPending =
                  !invite.accepted_at &&
                  !invite.revoked_at &&
                  (invite.delivery_status === "pending" ||
                    invite.delivery_status === "sending" ||
                    invite.delivery_status === "accepted");
                const undelivered =
                  !invite.accepted_at &&
                  !invite.revoked_at &&
                  (invite.delivery_status === "suppressed" ||
                    invite.delivery_status === "failed");
                const status = invite.accepted_at
                  ? "Accepted"
                  : invite.revoked_at
                    ? "Revoked"
                    : new Date(invite.expires_at) <= new Date()
                      ? "Expired"
                      : deliveryPending
                        ? invite.delivery_status === "accepted"
                          ? "Awaiting delivery"
                          : invite.delivery_status === "sending"
                            ? "Sending"
                            : "Delivery pending"
                        : undelivered
                          ? invite.delivery_status === "suppressed"
                            ? "Not delivered · suppressed"
                            : "Not delivered"
                          : "Pending";
                const reserved =
                  invite.delivery_reserved_until != null &&
                  new Date(invite.delivery_reserved_until) > new Date();
                const canResend =
                  !invite.accepted_at &&
                  !invite.revoked_at &&
                  !(
                    reserved &&
                    (invite.delivery_status === "sending" ||
                      invite.delivery_status === "accepted")
                  );

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
                    <div className="flex items-center gap-2 self-center">
                      <div
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          undelivered
                            ? "border-red-400/40 text-red-300"
                            : "border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-secondary)]"
                        }`}
                      >
                        {status}
                      </div>
                      {canResend ? (
                        <button
                          type="button"
                          onClick={() => void resendInvite(invite)}
                          disabled={resendingId === invite.id}
                          className="rounded-lg border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300 disabled:opacity-60"
                        >
                          {resendingId === invite.id ? "Resending…" : "Resend"}
                        </button>
                      ) : null}
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
