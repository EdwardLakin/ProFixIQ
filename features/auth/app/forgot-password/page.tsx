"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const res = await fetch("/api/send-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) {
      setStatus("sent");
    } else {
      const { error } = await res.json();
      setError(error || "Something went wrong.");
      setStatus("error");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black p-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 p-6 shadow-card backdrop-blur-xl">
        <h1 className="mb-4 text-3xl font-blackops tracking-[0.08em] text-[var(--accent-copper-light)]">
          Forgot Password
        </h1>

        {status === "sent" ? (
          <p className="text-green-500">Password reset email sent!</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="Enter your email"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-full border border-[rgba(193,102,59,0.35)] bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              {status === "sending" ? "Sending..." : "Send Reset Link"}
            </button>
            {status === "error" && <p className="text-red-500">{error}</p>}
          </form>
        )}

        <button
          className="mt-6 text-sm text-[var(--accent-copper-light)] underline underline-offset-2 transition hover:text-white"
          onClick={() => (window.location.href = "/sign-in")}
        >
          Back to Sign In
        </button>
      </div>
    </div>
  );
}
