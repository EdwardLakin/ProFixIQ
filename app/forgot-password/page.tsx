"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Status = "idle" | "sending" | "sent" | "error";

type ResetResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  details?: string;
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const goBack = () => {
    const redirect = sp.get("redirect");
    const tail = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    router.push(`/sign-in${tail}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setStatus("sending");

    const trimmed = email.trim().toLowerCase();

    if (!trimmed.includes("@")) {
      setError("Password reset requires the email on your account.");
      setStatus("error");
      return;
    }

    try {
      const res = await fetch("/api/auth/send-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: trimmed,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as ResetResponse;

      if (!res.ok || !data?.ok) {
        setError(data?.error || data?.details || "Unable to send reset email.");
        setStatus("error");
        return;
      }

      setNotice(data.message || "Reset email sent. Check your inbox.");
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reset email.");
      setStatus("error");
    }
  };

  return (
    <div
      className="
        min-h-screen px-4 text-foreground
        bg-background
        bg-[var(--theme-gradient-panel)]
      "
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center py-8">
        <div
          className="
            w-full rounded-3xl border
            border-[color:var(--metal-border-soft,var(--theme-border-soft))]
            bg-[var(--theme-gradient-panel)]
            shadow-[var(--theme-shadow-medium)]
            px-6 py-7 sm:px-8 sm:py-9
          "
        >
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={status === "sending"}
              className="
                inline-flex items-center gap-2 rounded-full border
                border-[color:var(--metal-border-soft,var(--theme-border-soft))]
                bg-[color:var(--theme-surface-overlay)] px-3 py-1.5 text-[11px]
                uppercase tracking-[0.2em] text-[color:var(--theme-text-primary)]
                hover:bg-[color:var(--theme-surface-overlay)] hover:text-[color:var(--theme-text-primary)]
                disabled:cursor-not-allowed disabled:opacity-60
              "
            >
              <span aria-hidden className="text-base leading-none">←</span>
              Back
            </button>

            <div className="text-[10px] text-[color:var(--theme-text-muted)]">Shop access</div>
          </div>

          <div className="mb-6 space-y-2 text-center">
            <div
              className="
                inline-flex items-center gap-1 rounded-full border
                border-[color:var(--metal-border-soft,var(--theme-border-soft))]
                bg-[color:var(--theme-surface-overlay)]
                px-3 py-1 text-[11px]
                uppercase tracking-[0.22em]
                text-[color:var(--theme-text-secondary)]
              "
            >
              <span
                className="text-[10px] font-semibold text-[var(--accent-copper-light)]"
                style={{ fontFamily: "var(--font-blackops), system-ui" }}
              >
                ProFixIQ
              </span>
              <span className="h-1 w-1 rounded-full bg-[var(--accent-copper-light)]" />
              <span>Password reset</span>
            </div>

            <h1
              className="mt-2 text-3xl sm:text-4xl font-semibold text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Forgot password
            </h1>

            <p className="text-xs text-muted-foreground sm:text-sm">
              Password reset requires the email on your account.
            </p>
          </div>

          {error && (
            <div className="mb-3 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.5)]">
              {error}
            </div>
          )}

          {notice && (
            <div className="mb-3 rounded-lg border border-emerald-500/60 bg-emerald-950/70 px-3 py-2 text-xs text-emerald-100 shadow-[var(--theme-shadow-medium)]">
              {notice}
            </div>
          )}

          {status === "sent" ? (
            <div className="mt-2 rounded-lg border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-xs text-[color:var(--theme-text-primary)]">
              If the email exists, you’ll receive a reset link shortly.
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
                <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="
                    w-full rounded-lg border
                    border-[color:var(--metal-border-soft,var(--theme-border-soft))]
                    bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]
                    placeholder:text-[color:var(--theme-text-muted)]
                    focus:outline-none focus:ring-2
                    focus:ring-[var(--accent-copper-soft)]
                    focus:border-[var(--accent-copper-soft)]
                  "
                  required
                />
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
                className="
                  mt-3 w-full rounded-full
                  bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))]
                  py-2.5 text-center text-sm
                  font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-on-accent)]
                  shadow-[0_0_26px_rgba(212,118,49,0.9)]
                  hover:brightness-110
                  disabled:cursor-not-allowed disabled:opacity-60
                "
                style={{ fontFamily: "var(--font-blackops), system-ui" }}
              >
                {status === "sending" ? "Sending…" : "Send reset link"}
              </button>

              <div className="text-center text-[11px] text-muted-foreground">
                Shop staff using a username should ask an admin to reset access.
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
