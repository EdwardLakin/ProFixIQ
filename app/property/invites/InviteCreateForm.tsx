"use client";

import { useActionState } from "react";
import { createPropertyPortalInvite } from "./actions";
import { initialInviteCreateActionState } from "./inviteCreateState";

type Option = { id: string; label: string };

const roles = ["property_manager", "owner_approver", "tenant_requester", "viewer"] as const;

export default function InviteCreateForm({
  portfolios,
  properties,
  units,
}: {
  portfolios: Option[];
  properties: Option[];
  units: Option[];
}) {
  const [state, action, pending] = useActionState(createPropertyPortalInvite, initialInviteCreateActionState);

  return <form action={action} className="mt-4 space-y-3">
    <input type="email" name="invited_email" required placeholder="tenant@example.com" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2"/>
    <input name="invited_name" placeholder="Invited name (optional)" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2"/>
    <select name="role" required className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">{roles.map((r)=><option key={r} value={r}>{r}</option>)}</select>
    <select name="portfolio_id" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2"><option value="">No portfolio scope</option>{portfolios.map((x)=><option key={x.id} value={x.id}>{x.label}</option>)}</select>
    <select name="property_id" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2"><option value="">No property scope</option>{properties.map((x)=><option key={x.id} value={x.id}>{x.label}</option>)}</select>
    <select name="unit_id" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2"><option value="">No unit scope</option>{units.map((x)=><option key={x.id} value={x.id}>{x.label}</option>)}</select>
    <input type="number" min={1} max={30} name="expires_in_days" defaultValue={7} required className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2"/>
    <label className="flex items-center gap-2 text-sm text-[color:var(--theme-text-primary)]">
      <input type="checkbox" name="email_invite" className="h-4 w-4"/>
      Email this invite
    </label>
    <button type="submit" disabled={pending} className="w-full rounded-xl border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 disabled:opacity-60">{pending ? "Creating invite..." : "Create invite record"}</button>

    {state.status === "validation-error" && state.message && <p className="text-sm text-rose-300">{state.message}</p>}

    {state.status === "invite-created" && state.inviteLink && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
      <p className="font-medium text-emerald-200">Invite created. Copy this link now — it will not be shown again.</p>
      {state.warning ? <p className="mt-1 text-xs text-amber-200">{state.warning}</p> : <p className="mt-1 text-xs text-emerald-100/90">If emailed, keep this for backup in case delivery fails.</p>}
      <div className="mt-3 flex gap-2">
        <input readOnly value={state.inviteLink} className="w-full rounded-xl border border-emerald-400/40 bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs"/>
        <button type="button" onClick={() => navigator.clipboard.writeText(state.inviteLink as string)} className="rounded-xl border border-emerald-400/40 px-3 py-2 text-xs">Copy</button>
      </div>
      <p className="mt-2 text-xs text-emerald-100/90">Invited email: {state.invitedEmail}</p>
      <p className="text-xs text-emerald-100/90">Expires: {state.expiresAt ? new Date(state.expiresAt).toLocaleString() : "—"}</p>
    </div>}
  </form>;
}
