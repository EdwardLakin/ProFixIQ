"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function SetPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (pw1.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (pw1 !== pw2) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw1 });
    setLoading(false);

    if (err) {
      setError(err.message || "Could not update password.");
      return;
    }

    setNotice("Password updated. Redirecting…");
    const redirect = sp.get("redirect") || "/dashboard";
    router.replace(redirect);
  };

  return (
    <div
      className="
        min-h-screen px-4 text-foreground
        bg-background
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center py-8">
        <div
          className="
            w-full rounded-3xl border
            border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.2),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)]
            shadow-[0_32px_80px_rgba(0,0,0,0.95)]
            px-6 py-7 sm:px-8 sm:py-9
          "
        >
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push("/sign-in")}
              disabled={loading}
              className="
                inline-flex items-center gap-2 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/60 px-3 py-1.5 text-[11px]
                uppercase tracking-[0.2em] text-neutral-200
                hover:bg-black/70 hover:text-white
                disabled:cursor-not-allowed disabled:opacity-60
              "
            >
              <span aria-hidden className="text-base leading-none">←</span>
              Back
            </button>

            <div className="text-[10px] text-neutral-500">Password reset</div>
          </div>

          <div className="mb-6 space-y-2 text-center">
            <div
              className="
                inline-flex items-center gap-1 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/70
                px-3 py-1 text-[11px]
                uppercase tracking-[0.22em]
                text-neutral-300
              "
            >
              <span
                className="text-[10px] font-semibold text-[var(--accent-copper-light)]"
                style={{ fontFamily: "var(--font-blackops), system-ui" }}
              >
                ProFixIQ
              </span>
              <span className="h-1 w-1 rounded-full bg-[var(--accent-copper-light)]" />
              <span>Set password</span>
            </div>

            <h1
              className="mt-2 text-3xl sm:text-4xl font-semibold text-white"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Set new password
            </h1>

            <p className="text-xs text-muted-foreground sm:text-sm">
              Choose a strong password you’ll use to sign in.
            </p>
          </div>

          {error && (
            <div className="mb-3 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.5)]">
              {error}
            </div>
          )}

          {notice && (
            <div className="mb-3 rounded-lg border border-emerald-500/60 bg-emerald-950/70 px-3 py-2 text-xs text-emerald-100 shadow-[0_0_18px_rgba(6,95,70,0.5)]">
              {notice}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1 text-sm">
              <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
                New password
              </label>
              <input
                type="password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="
                  w-full rounded-lg border
                  border-[color:var(--metal-border-soft,#1f2937)]
                  bg-black/70 px-3 py-2 text-sm text-white
                  placeholder:text-neutral-500
                  focus:outline-none focus:ring-2
                  focus:ring-[var(--accent-copper-soft)]
                  focus:border-[var(--accent-copper-soft)]
                "
                required
                minLength={6}
              />
              <p className="text-[11px] text-muted-foreground">
                Minimum 6 characters.
              </p>
            </div>

            <div className="space-y-1 text-sm">
              <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
                Confirm new password
              </label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="
                  w-full rounded-lg border
                  border-[color:var(--metal-border-soft,#1f2937)]
                  bg-black/70 px-3 py-2 text-sm text-white
                  placeholder:text-neutral-500
                  focus:outline-none focus:ring-2
                  focus:ring-[var(--accent-copper-soft)]
                  focus:border-[var(--accent-copper-soft)]
                "
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="
                mt-3 w-full rounded-full
                bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))]
                py-2.5 text-center text-sm
                font-semibold uppercase tracking-[0.22em] text-black
                shadow-[0_0_26px_rgba(212,118,49,0.9)]
                hover:brightness-110
                disabled:cursor-not-allowed disabled:opacity-60
              "
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>

          <div className="mt-6 text-center text-[11px] text-muted-foreground">
            <p>
              After updating your password, you’ll be redirected automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}