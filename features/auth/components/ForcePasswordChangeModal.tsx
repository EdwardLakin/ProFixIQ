"use client";

import { useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Props = {
  open: boolean;
  onDone: () => void;
  title?: string;
  subtitle?: string;
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ForcePasswordChangeModal({
  open,
  onDone,
  title = "Set your new password",
  subtitle = "This account was created by an owner/manager. You must choose a new password before continuing.",
}: Props): JSX.Element | null {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  if (!open) return null;

  async function submit(): Promise<void> {
    if (busy) return;

    setError(null);
    setOkMsg(null);

    const p = password.trim();
    const c = confirm.trim();

    if (!p || p.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (p !== c) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        setError("Not signed in.");
        return;
      }

      const { error: updateAuthErr } = await supabase.auth.updateUser({
        password: p,
      });

      if (updateAuthErr) {
        setError(updateAuthErr.message);
        return;
      }

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ must_change_password: false, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (profileErr) {
        // Password was changed successfully; profile flag failed.
        // Keep user blocked so we don’t leave them in a weird state.
        setError(`Password updated, but profile flag update failed: ${profileErr.message}`);
        return;
      }

      setOkMsg("Password updated. Loading…");
      setPassword("");
      setConfirm("");

      // Let parent refresh / re-check state
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
      <div
        className={clsx(
          "w-full max-w-md rounded-2xl border border-white/12",
          "bg-[radial-gradient(900px_520px_at_18%_0%,rgba(197,106,47,0.14),transparent_55%),linear-gradient(180deg,rgba(0,0,0,0.70),rgba(0,0,0,0.42))]",
          "backdrop-blur-md shadow-[0_24px_70px_rgba(0,0,0,0.90)]",
          "p-4 sm:p-6",
        )}
      >
        <div className="text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">
          Security required
        </div>
        <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>

        {(error || okMsg) && (
          <div className="mt-3 space-y-2">
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-950/35 px-3 py-2 text-xs text-red-100">
                {error}
              </div>
            )}
            {okMsg && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/35 px-3 py-2 text-xs text-emerald-100">
                {okMsg}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="block text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
              New password
            </label>
            <input
              className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400">
              Confirm password
            </label>
            <input
              className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-type password"
            />
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_26px_rgba(197,122,74,0.85)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Updating…" : "Update password"}
          </button>

          <p className="text-[11px] text-neutral-500">
            You won’t be able to use the app until your password is updated.
          </p>
        </div>
      </div>
    </div>
  );
}