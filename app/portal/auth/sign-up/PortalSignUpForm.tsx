"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";

export default function PortalSignUpForm() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

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

      const emailRedirectTo = `${origin
        ?.replace(/\/$/, "")
        .toString()}/portal/auth/confirm`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else if (!data.session) {
        setNotice(
          "Check your email to confirm your account. After confirming, you’ll land on your profile."
        );
      } else {
        router.replace("/portal/profile");
      }
    } catch (err: any) {
      setError(err?.message ?? "Unable to create your account right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-neutral-950 to-black px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-orange-500/40 bg-neutral-950/80 p-6 shadow-xl shadow-orange-500/10 backdrop-blur">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-blackops text-orange-400">
            Create Portal Account
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Use your email to securely access your service history and
            documents.
          </p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
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
              className="bg-neutral-950"
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
              className="bg-neutral-950"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-red-400">{error}</p>
          )}
          {notice && (
            <p className="text-xs font-medium text-emerald-400">{notice}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="mt-1 w-full font-semibold"
          >
            {loading ? "Creating account…" : "Sign Up"}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-neutral-400">
          <span>Already have an account?</span>
          <Link
            href="/portal/signin"
            className="font-medium text-orange-400 hover:text-orange-300"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}