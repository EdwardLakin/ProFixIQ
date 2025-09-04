"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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

    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL;
    const emailRedirectTo = `${origin?.replace(/\/$/, "")}/portal/auth/confirm`;

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
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
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
      <div className="max-w-md w-full border border-orange-500 p-6 rounded-xl">
        <h1 className="text-2xl mb-4 font-bold text-orange-500">Portal Sign Up</h1>
        <form onSubmit={handleSignUp} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
            required
            minLength={6}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {notice && <p className="text-green-400 text-sm">{notice}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded bg-orange-500 hover:bg-orange-600 font-bold"
          >
            {loading ? "Creating account…" : "Sign Up"}
          </button>
        </form>
      </div>
    </div>
  );
}