'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import SignOutButton from '@components/SignOutButton';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Navbar() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error('❌ Failed to fetch session:', error.message);
      }

      setUser(session?.user ?? null);
    };

    getSession();

    // Optional: Subscribe to auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="w-full fixed top-0 z-50 backdrop-blur-md bg-black/30 border-b border-orange-500">
      <nav className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        {/* Logo */}
        <Link href="/">
          <h1 className="text-2xl font-blackops text-orange-500 tracking-wide">
            ProFixIQ
          </h1>
        </Link>

        {/* Right-side actions */}
        <div className="flex items-center gap-4">
          <Link
            href="/subscribe"
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white"
          >
            Plans
          </Link>

          {user ? (
            <SignOutButton />
          ) : (
            <>
              <Link href="/sign-in" className="text-sm text-orange-300 hover:underline">
                Sign In
              </Link>
              <Link href="/sign-up" className="text-sm text-orange-300 hover:underline">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}