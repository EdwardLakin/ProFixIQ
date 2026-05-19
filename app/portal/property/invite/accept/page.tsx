import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { acceptPropertyPortalInvite, getPropertyPortalInvitePreview } from "./actions";

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient;

function sv(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }

export default async function PropertyInviteAcceptPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const token = sv(params.token)?.trim() ?? "";
  const error = sv(params.error);
  const inviteUrl = `/portal/property/invite/accept${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  if (!token) {
    return <section className="metal-card rounded-3xl p-5"><h1 className="text-2xl text-neutral-100">Invalid invite</h1><p className="mt-3 text-sm text-neutral-300">Missing invite token.</p></section>;
  }

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(inviteUrl)}`);

  const preview = await getPropertyPortalInvitePreview(token);
  const scope = preview.invite ? [
    preview.invite.portfolio_id ? `Portfolio: ${preview.labels.portfolio ?? preview.invite.portfolio_id}` : null,
    preview.invite.property_id ? `Property: ${preview.labels.property ?? preview.invite.property_id}` : null,
    preview.invite.unit_id ? `Unit: ${preview.labels.unit ?? preview.invite.unit_id}` : null,
  ].filter(Boolean).join(" · ") || "Global (property_manager)" : null;

  return (
    <section className="metal-card rounded-3xl p-5 text-neutral-100">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Portal</p>
      <h1 className="mt-2 text-2xl">Accept property invite</h1>
      {(error || preview.error) && <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error ?? preview.error}</p>}

      {preview.invite && !preview.error ? <div className="mt-5 space-y-2 text-sm text-neutral-300">
        <p><span className="text-neutral-400">Invited email:</span> {preview.invite.invited_email}</p>
        <p><span className="text-neutral-400">Invited name:</span> {preview.invite.invited_name ?? "—"}</p>
        <p><span className="text-neutral-400">Role:</span> {preview.invite.role}</p>
        <p><span className="text-neutral-400">Scope:</span> {scope}</p>
        <p><span className="text-neutral-400">Expires:</span> {new Date(preview.invite.expires_at).toLocaleString()}</p>
        <form action={acceptPropertyPortalInvite} className="pt-2">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">Accept invite</button>
        </form>
      </div> : <p className="mt-4 text-sm text-neutral-300">This invite cannot be accepted in its current state.</p>}

      <div className="mt-5"><Link href="/portal/property/member" className="text-sm text-cyan-300 underline">Go to property member portal</Link></div>
    </section>
  );
}
