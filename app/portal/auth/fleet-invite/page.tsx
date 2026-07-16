"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import AuthShell from "@/features/auth/components/AuthShell";
import AuthStatus from "@/features/auth/components/AuthStatus";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type Invite = {
  email: string;
  role: string;
  expiresAt: string;
  fleetName: string;
  shopName: string;
};

const inputClass = "w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3.5 py-3 text-sm text-[color:var(--theme-input-text)] outline-none focus:border-[var(--accent-copper)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent-copper)_16%,transparent)]";

export default function FleetInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const token = searchParams.get("token")?.trim() || "";
  const [invite, setInvite] = useState<Invite | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const code = searchParams.get("code")?.trim();
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw new Error("This invitation could not be verified.");
        }
        const response = await fetch(`/api/portal/fleet/invites/preview?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { invite?: Invite; error?: string } | null;
        if (!response.ok || !payload?.invite) throw new Error(payload?.error || "This fleet invitation is unavailable.");
        if (!cancelled) setInvite(payload.invite);
      } catch (value) {
        if (!cancelled) setError(value instanceof Error ? value.message : "This fleet invitation is unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, supabase, token]);

  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 12) return setError("Use at least 12 characters for your password.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Open the one-time invitation email on this device before activating access.");
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw new Error("Your password could not be saved. Try a different password.");
      const response = await fetch("/api/portal/fleet/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Fleet access could not be activated.");
      router.replace("/portal/fleet");
      router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Fleet access could not be activated.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      productLabel="Fleet portal"
      heroTitle="Keep every unit moving."
      heroDescription="Approvals, pre-trips, service requests, and shop visibility in one secure fleet-scoped portal."
      highlights={["Invited access", "Fleet-scoped records", "Role protected"]}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">Invited fleet access</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--theme-text-primary)]">Activate fleet access</h1>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color:color-mix(in_srgb,var(--accent-copper)_13%,transparent)] text-[var(--accent-copper)]"><Building2 className="h-5 w-5" /></div>
      </div>

      {loading ? <div className="flex items-center gap-2 py-8 text-sm text-[color:var(--theme-text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" /> Verifying invitation…</div> : null}
      {error ? <div className="mt-5"><AuthStatus tone="error">{error}</AuthStatus></div> : null}

      {!loading && invite ? (
        <>
          <div className="mt-5 divide-y divide-[color:var(--theme-border-soft)] rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 text-sm">
            <div className="flex items-center justify-between gap-3 py-3"><span className="text-[color:var(--theme-text-muted)]">Fleet</span><strong>{invite.fleetName}</strong></div>
            <div className="flex items-center justify-between gap-3 py-3"><span className="text-[color:var(--theme-text-muted)]">Role</span><strong className="capitalize">{invite.role}</strong></div>
            <div className="flex items-center justify-between gap-3 py-3"><span className="text-[color:var(--theme-text-muted)]">Account</span><strong>{invite.email}</strong></div>
            <div className="flex items-center justify-between gap-3 py-3"><span className="text-[color:var(--theme-text-muted)]">Invited by</span><strong>{invite.shopName}</strong></div>
          </div>

          <form onSubmit={activate} className="mt-5 space-y-4">
            <div>
              <label htmlFor="fleet-password" className="mb-1.5 block text-xs font-semibold text-[color:var(--theme-text-secondary)]">Create password</label>
              <div className="relative"><input id="fleet-password" className={`${inputClass} pr-11`} type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" required minLength={12} /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[color:var(--theme-text-muted)]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            </div>
            <div><label htmlFor="fleet-confirm" className="mb-1.5 block text-xs font-semibold text-[color:var(--theme-text-secondary)]">Confirm password</label><input id="fleet-confirm" className={inputClass} type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
            <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-60">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{submitting ? "Activating…" : "Create account & continue"}</button>
          </form>
          <div className="mt-4 text-center text-[11px] text-[color:var(--theme-text-muted)]">Invitation expires {new Date(invite.expiresAt).toLocaleDateString()}.</div>
        </>
      ) : null}
    </AuthShell>
  );
}
