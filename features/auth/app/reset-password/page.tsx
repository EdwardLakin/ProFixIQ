"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserSupabase();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const access_token = searchParams.get("access_token");
    const refresh_token = searchParams.get("refresh_token");

    if (access_token && refresh_token) {
      void supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error }) => {
          if (error) setError("Invalid or expired password reset link.");
          setLoading(false);
        });
    } else {
      setError("Missing access or refresh token.");
      setLoading(false);
    }
  }, [searchParams, supabase.auth]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
    } else {
      setSuccess("Password reset successfully.");
      setTimeout(() => router.push("/sign-in"), 1500);
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 p-6 shadow-card backdrop-blur-xl">
        <h1 className="mb-4 text-3xl font-blackops tracking-[0.08em] text-[var(--accent-copper-light)]">
          Reset Password
        </h1>

        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {success && <p className="text-green-500">{success}</p>}

            <div>
              <label className="mb-1 block text-sm">New Password</label>
              <input
                type="password"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm">Confirm Password</label>
              <input
                type="password"
                required
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full border border-[rgba(193,102,59,0.35)] bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        <button
          className="mt-6 text-sm text-[var(--accent-copper-light)] underline underline-offset-2 transition hover:text-white"
          onClick={() => router.push("/sign-in")}
        >
          Back to Sign In
        </button>
      </div>
    </div>
  );
}
