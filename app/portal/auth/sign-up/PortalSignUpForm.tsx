// app/portal/auth/sign-up/page.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";

const COPPER = "#C57A4A";

export default function PortalSignUpForm() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_SITE_URL;

      const safeOrigin = (origin ?? "").replace(/\/$/, "");
      const emailRedirectTo = `${safeOrigin}/portal/auth/confirm`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else if (!data.session) {
        setNotice(
          "Check your email to confirm your account. After confirming, you’ll land on your profile.",
        );
      } else {
        router.replace("/portal/profile");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to create your account right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur-md sm:p-6">
        <header className="space-y-2">
          <div
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
            style={{ color: COPPER }}
          >
            Customer Portal
          </div>

          <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
            Create account
          </h1>

          <p className="text-sm text-neutral-400">
            Access service history, bookings, and documents.
          </p>
        </header>

        <form onSubmit={handleSignUp} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-300">
              Email
            </label>
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-white/10 bg-white/5 text-white placeholder:text-neutral-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-300">
              Password
            </label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-white/10 bg-white/5 text-white placeholder:text-neutral-500"
              required
              minLength={6}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          {notice ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100">
              {notice}
            </p>
          ) : null}

          <Button type="submit" disabled={loading} className="w-full font-semibold">
            {loading ? "Creating account…" : "Sign up"}
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm text-neutral-400">
          <span>Already have an account?</span>
          <Link href="/portal/auth/sign-in" className="font-semibold hover:underline" style={{ color: COPPER }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}