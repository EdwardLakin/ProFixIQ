"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const access_token = searchParams.get("access_token");
    const refresh_token = searchParams.get("refresh_token");

    if (access_token && refresh_token) {
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error }) => {
          if (error) setError("Invalid or expired password reset link.");
          setLoading(false);
        });
    } else {
      setError("Missing access or refresh token.");
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // supabase is stable from the factory; no need in deps

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-blackops">
      <h1 className="text-3xl text-orange-500 mb-4">Reset Password</h1>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : (
        <form onSubmit={handleReset} className="w-full max-w-md space-y-4">
          {success && <p className="text-green-500">{success}</p>}

          <div>
            <label className="block text-sm mb-1">New Password</label>
            <input
              type="password"
              required
              className="w-full p-2 rounded bg-gray-900 text-white border border-orange-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Confirm Password</label>
            <input
              type="password"
              required
              className="w-full p-2 rounded bg-gray-900 text-white border border-orange-500"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      )}

      <button
        className="mt-6 text-orange-400 underline"
        onClick={() => router.push("/sign-in")}
      >
        Back to Sign In
      </button>
    </div>
  );
}