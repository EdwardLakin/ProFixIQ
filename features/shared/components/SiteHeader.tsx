"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function SiteHeader() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();
  const [sessionExists, setSessionExists] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSessionExists(!!session);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSessionExists(!!session);
      });

      return () => {
        subscription.unsubscribe();
      };
    })();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSessionExists(false);
    router.push("/sign-in");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="text-orange-400 font-semibold tracking-wide">
          ProFixIQ
        </Link>

        {/* desktop nav */}
        <nav className="hidden sm:flex gap-4 text-sm text-gray-300 items-center">
          <Link href="/">Home</Link>
          <Link href="/subscribe">Plans</Link>
          <Link href="/dashboard">Dashboard</Link>
          <a href="mailto:support@profixiq.com">Support</a>
          {sessionExists && (
            <button
              onClick={handleSignOut}
              className="ml-3 rounded bg-orange-500 px-3 py-1 text-sm font-medium text-black hover:bg-orange-600 transition"
            >
              Sign Out
            </button>
          )}
        </nav>

        {/* mobile sign-out (only if logged in) */}
        {sessionExists && (
          <button
            onClick={handleSignOut}
            className="sm:hidden rounded bg-orange-500 px-3 py-1 text-sm font-medium text-black hover:bg-orange-600 transition"
          >
            Sign Out
          </button>
        )}
      </div>
    </header>
  );
}