'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import supabase from '@lib/supabaseClient';
import SignOutButton from '@components/SignOutButton';

export default function Navbar() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    getUser();
  }, []);

  return (
    <header className="w-full fixed top-0 z-50 backdrop-blur-md bg-black/30 border-b border-orange-500">
      <nav className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        {/* Logo */}
        <Link href="/">
          <h1 className="text-2xl font-blackops text-orange-500 tracking-wide">ProFixIQ</h1>
        </Link>

        {/* Right-side actions */}
        <div className="flex items-center gap-4">
          <Link
            href="/compare-plans"
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white"
          >
            Plans
          </Link>

          {user ? (
            <SignOutButton />
          ) : (
            <>
              <Link
                href="/sign-in"
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-200"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}