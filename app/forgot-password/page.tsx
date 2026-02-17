"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Status = "idle" | "sending" | "sent" | "error";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");

  const origin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    if (process.env.NEXT_PUBLIC_SITE_URL)
      return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  }, []);

  const emailRedirectTo = useMemo(() => {
    const redirect = sp.get("redirect");
    const tail = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    // Supabase will send the user back here after they click the email link
    return `${origin}/auth/reset${tail}`;
  }, [origin, sp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const trimmed = email.trim();
    const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: emailRedirectTo,
    });

    if (err) {
      setError(err.message || "Unable to send reset email.");
      setStatus("error");
      return;
    }

    setStatus("sent");
  };

  const goBack = () => {
    const redirect = sp.get("redirect");
    const tail = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    router.push(`/sign-in${tail}`);
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
              onClick={goBack}
              className="
                inline-flex items-center gap-2 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/60 px-3 py-1.5 text-[11px]
                uppercase tracking-[0.2em] text-neutral-200
                hover:bg-black/70 hover:text-white
              "
            >
              <span aria-hidden className="text-base leading-none">←</span>
              Back
            </button>
          </div>

          <div className="mb-6 space-y-2 text-center">
            <h1
              className="mt-2 text-3xl sm:text-4xl font-semibold text-white"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Reset password
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Enter your email and we’ll send a secure reset link.
            </p>
          </div>

          {error && (
            <div className="mb-3 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          )}

          {status === "sent" ? (
            <div className="rounded-lg border border-emerald-500/60 bg-emerald-950/70 px-3 py-3 text-xs text-emerald-100">
              Reset email sent. Check your inbox.
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={goBack}
                  className="
                    text-[11px] font-medium
                    text-[var(--accent-copper-light)]
                    hover:text-[var(--accent-copper)]
                    hover:underline underline-offset-2
                  "
                >
                  Back to sign in
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1 text-sm">
                <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="
                    w-full rounded-lg border
                    border-[color:var(--metal-border-soft,#1f2937)]
                    bg-black/70 px-3 py-2 text-sm text-white
                    placeholder:text-neutral-500
                    focus:outline-none focus:ring-2
                    focus:ring-[var(--accent-copper-soft)]
                    focus:border-[var(--accent-copper-soft)]
                  "
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
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
                {status === "sending" ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}