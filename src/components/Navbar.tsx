'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { FaSignOutAlt, FaBars, FaBell, FaSearch } from 'react-icons/fa';
import type { Database } from '@/types/supabase';
import Link from 'next/link';

export default function Navbar() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Database['public']['Tables']['profiles']['Row'] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load user + profile
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      setUser(session.user);

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setProfile(data);
    };

    fetchUser();
  }, [supabase]);

  // Hide dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/sign-in');
  };

  const isAdmin =
    profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager';
  const isTech = profile?.role === 'mechanic';

  return (
    <nav className="bg-black text-white p-4 font-blackops border-b border-neutral-800">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-xl text-orange-500 font-blackops">
          🔧 ProFixIQ
        </Link>

        {/* Desktop Nav Buttons */}
        <div className="hidden md:flex space-x-4 items-center">
          {isAdmin && (
            <>
              <Link href="/work-orders/create" className="hover:text-orange-400">
                Create Work Order
              </Link>
              <Link href="/work-orders/queue" className="hover:text-orange-400">
                Job Queue
              </Link>
            </>
          )}
          {isTech && (
            <>
              <Link href="/work-orders/queue" className="hover:text-orange-400">
                Queued Jobs
              </Link>
              <Link href="/inspections" className="hover:text-orange-400">
                Inspections
              </Link>
            </>
          )}

          {/* Quick Search */}
          <button
            title="Quick Access"
            className="hover:text-orange-400"
            onClick={() => alert('Quick Access coming soon')}
          >
            <FaSearch />
          </button>

          {/* Notification Bell */}
          <button className="hover:text-orange-400" onClick={() => alert('Notifications coming soon')}>
            <FaBell />
          </button>

          {/* Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="hover:text-orange-400"
            >
              {profile?.full_name || 'Profile'}
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 bg-neutral-900 border border-neutral-700 rounded shadow-md z-50 min-w-[160px]">
                <Link href="/app/profile" className="block px-4 py-2 hover:bg-neutral-800">
                  My Profile
                </Link>
                <Link href="/settings" className="block px-4 py-2 hover:bg-neutral-800">
                  Settings
                </Link>
                <Link href="/compare-plans" className="block px-4 py-2 hover:bg-neutral-800">
                  Plans
                </Link>
                {isAdmin && (
                  <>
                    <Link href="/dashboard" className="block px-4 py-2 hover:bg-neutral-800">
                      Admin Dashboard
                    </Link>
                    <Link href="/work-orders" className="block px-4 py-2 hover:bg-neutral-800">
                      All Work Orders
                    </Link>
                  </>
                )}
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-4 py-2 hover:bg-neutral-800 text-red-400"
                >
                  <FaSignOutAlt className="inline mr-1" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        <div className="md:hidden">
          <button onClick={() => setMenuOpen((prev) => !prev)} aria-label="Menu">
            <FaBars />
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {menuOpen && (
        <div className="md:hidden mt-4 space-y-2 text-sm">
          {isAdmin && (
            <>
              <Link href="/work-orders/create" className="block px-4 py-2 hover:bg-neutral-800">
                Create Work Order
              </Link>
              <Link href="/work-orders/queue" className="block px-4 py-2 hover:bg-neutral-800">
                Job Queue
              </Link>
            </>
          )}
          {isTech && (
            <>
              <Link href="/work-orders/queue" className="block px-4 py-2 hover:bg-neutral-800">
                Queued Jobs
              </Link>
              <Link href="/inspections" className="block px-4 py-2 hover:bg-neutral-800">
                Inspections
              </Link>
            </>
          )}
          <Link href="/app/profile" className="block px-4 py-2 hover:bg-neutral-800">
            My Profile
          </Link>
          <Link href="/settings" className="block px-4 py-2 hover:bg-neutral-800">
            Settings
          </Link>
          <Link href="/compare-plans" className="block px-4 py-2 hover:bg-neutral-800">
            Plans
          </Link>
          <button
            onClick={handleSignOut}
            className="block w-full text-left px-4 py-2 hover:bg-neutral-800 text-red-400"
          >
            <FaSignOutAlt className="inline mr-1" />
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}