import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { acceptPropertyPortalInvite, getPropertyPortalInvitePreview } from "./actions";

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient;

function sv(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }

function statusMessage(status: string | undefined) {
  switch (status) {
    case "invite-accepted":
      return { tone: "ok", message: "Invite accepted. After accepting, you’ll be taken to your Property Portal." } as const;
    case "invite-invalid":
      return { tone: "warn", message: "This invite is invalid or no longer available." } as const;
    case "invite-expired":
      return { tone: "warn", message: "This invite has expired or is no longer pending." } as const;
    case "invite-email-mismatch":
      return { tone: "warn", message: "The signed-in email does not match the invited email for this token." } as const;
    case "invite-error":
      return { tone: "warn", message: "We could not accept this invite right now. Please try again." } as const;
    default:
      return null;
  }
}

export default async function PropertyInviteAcceptPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const token = sv(params.token)?.trim() ?? "";
  const status = sv(params.status);
  const inviteUrl = `/portal/property/invite/accept${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const banner = statusMessage(status);

  if (!token) {
    return <section className="metal-card rounded-3xl p-5"><h1 className="text-2xl text-neutral-100">Invalid invite</h1><p className="mt-3 text-sm text-neutral-300">Missing invite token.</p></section>;
  }

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(inviteUrl)}`);

  const preview = await getPropertyPortalInvitePreview(token);

  return (
    <section className="metal-card rounded-3xl p-5 text-neutral-100">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Portal</p>
      <h1 className="mt-2 text-2xl">Accept property portal invite</h1>
      {banner && (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${banner.tone === "ok" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-amber-400/40 bg-amber-500/10 text-amber-200"}`}>
          {banner.message}
        </p>
      )}

      <div className="mt-5 space-y-2 text-sm text-neutral-300">
        <p className="text-neutral-200">Sign in with the invited email address to continue.</p>
        <p>{preview.message}</p>
        <form action={acceptPropertyPortalInvite} className="pt-2">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">Accept invite</button>
        </form>
      </div>

      <div className="mt-5"><Link href="/portal/property/member" className="text-sm text-cyan-300 underline">Go to Property Portal</Link></div>
    </section>
  );
}
