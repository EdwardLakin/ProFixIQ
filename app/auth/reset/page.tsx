"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";


function parseHashParams(hash: string): URLSearchParams {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

export default function AuthResetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [message, setMessage] = useState("Preparing password reset…");
  const [details, setDetails] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const code = searchParams.get("code")?.trim() ?? "";
        const next = searchParams.get("redirect")?.trim() || "/auth/set-password";

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            if (!cancelled) {
              setMessage("Reset link could not be verified.");
              setDetails(error.message);
            }
            return;
          }

          if (!cancelled) {
            router.replace(next);
          }
          return;
        }

        const hashParams =
          typeof window !== "undefined"
            ? parseHashParams(window.location.hash)
            : new URLSearchParams();

        const accessToken = hashParams.get("access_token")?.trim() ?? "";
        const refreshToken = hashParams.get("refresh_token")?.trim() ?? "";
        const type = hashParams.get("type")?.trim() ?? "";

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            if (!cancelled) {
              setMessage("Reset link could not be verified.");
              setDetails(error.message);
            }
            return;
          }

          if (!cancelled) {
            router.replace(next);
          }
          return;
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          if (!cancelled) {
            setMessage("Unable to validate reset session.");
            setDetails(error.message);
          }
          return;
        }

        if (session) {
          if (!cancelled) {
            router.replace(next);
          }
          return;
        }

        if (!cancelled) {
          setMessage(
            type === "recovery"
              ? "Recovery session was not created."
              : "This reset link is missing required recovery information.",
          );
          setDetails("Request a new reset email and try again.");
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown reset error";

        if (!cancelled) {
          setMessage("Password reset failed.");
          setDetails(msg);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, supabase]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950/80 p-6 shadow-2xl">
        <h1 className="text-xl font-semibold text-white">Password reset</h1>
        <p className="mt-3 text-sm text-neutral-300">{message}</p>
        {details ? <p className="mt-2 text-xs text-red-300">{details}</p> : null}
      </div>
    </main>
  );
}
