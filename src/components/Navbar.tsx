'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { FaSignOutAlt, FaBars, FaBell, FaSearch } from 'react-icons/fa';
import type { Database } from '@/types/supabase';
import type { User } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import clsx from 'clsx';

export default function Navbar() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Database['public']['Tables']['profiles']['Row'] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [shiftStatus, setShiftStatus] = useState<'none' | 'active' | 'break' | 'lunch' | 'ended'>('none');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUserAndShift = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user || !session.expires_at || Date.now() / 1000 > session.expires_at) {
        await supabase.auth.signOut(); // clear expired session
        setUser(null);
        setProfile(null);
        return;
      }

      setUser(session.user);

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setProfile(prof);

      const { data: shift } = await supabase
        .from('tech_shifts')
        .select('*')
        .eq('tech_id', session.user.id)
        .is('ended_at', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .single();

      if (!shift) {
        setShiftStatus('none');
      } else if (shift.break_start && !shift.break_end) {
        setShiftStatus('break');
      } else if (shift.lunch_start && !shift.lunch_end) {
        setShiftStatus('lunch');
      } else if (shift.status === 'ended') {
        setShiftStatus('ended');
      } else {
        setShiftStatus('active');
      }
    };

    fetchUserAndShift();
  }, []);

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

  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager';
  const isTech = profile?.role === 'mechanic';

  const shiftColor = {
    none: 'bg-black',
    active: 'bg-green-700',
    break: 'bg-yellow-600',
    lunch: 'bg-orange-600',
    ended: 'bg-neutral-800',
  }[shiftStatus];

  return (
    <nav className={clsx('text-white p-4 font-blackops border-b border-neutral-800', shiftColor)}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl text-orange-500 font-blackops">
          🔧 ProFixIQ
        </Link>

        <div className="hidden md:flex space-x-4 items-center">
          {user ? (
            <>
              {isAdmin && (
                <>
                  <Link href="/work-orders/create" className="hover:text-orange-400">Create Work Order</Link>
                  <Link href="/work-orders/queue" className="hover:text-orange-400">Job Queue</Link>
                </>
              )}
              {isTech && (
                <>
                  <Link href="/work-orders/queue" className="hover:text-orange-400">Queued Jobs</Link>
                  <Link href="/inspections" className="hover:text-orange-400">Inspections</Link>
                </>
              )}

              <button title="Quick Access" className="hover:text-orange-400" onClick={() => alert('Quick Access coming soon')}>
                <FaSearch />
              </button>

              <button className="hover:text-orange-400" onClick={() => alert('Notifications coming soon')}>
                <FaBell />
              </button>

              <div className="relative" ref={dropdownRef}>
                <button onClick={() => setDropdownOpen((prev) => !prev)} className="hover:text-orange-400">
                  {profile?.full_name || 'Profile'}
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 bg-neutral-900 border border-neutral-700 rounded shadow-md z-50 min-w-[160px]">
                    <Link href="/app/profile" className="block px-4 py-2 hover:bg-neutral-800">My Profile</Link>
                    <Link href="/settings" className="block px-4 py-2 hover:bg-neutral-800">Settings</Link>
                    <Link href="/compare-plans" className="block px-4 py-2 hover:bg-neutral-800">Plans</Link>
                    {isAdmin && (
                      <>
                        <Link href="/dashboard" className="block px-4 py-2 hover:bg-neutral-800">Admin Dashboard</Link>
                        <Link href="/work-orders" className="block px-4 py-2 hover:bg-neutral-800">All Work Orders</Link>
                      </>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-2 hover:bg-neutral-800 text-red-400"
                    >
                      <FaSignOutAlt className="inline mr-1" /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link href="/sign-in" className="hover:text-orange-400 font-bold text-white">Sign In</Link>
          )}
        </div>

        <div className="md:hidden">
          <button onClick={() => setMenuOpen((prev) => !prev)} aria-label="Menu">
            <FaBars />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden mt-4 space-y-2 text-sm">
          {user ? (
            <>
              {isAdmin && (
                <>
                  <Link href="/work-orders/create" className="block px-4 py-2 hover:bg-neutral-800">Create Work Order</Link>
                  <Link href="/work-orders/queue" className="block px-4 py-2 hover:bg-neutral-800">Job Queue</Link>
                </>
              )}
              {isTech && (
                <>
                  <Link href="/work-orders/queue" className="block px-4 py-2 hover:bg-neutral-800">Queued Jobs</Link>
                  <Link href="/inspections" className="block px-4 py-2 hover:bg-neutral-800">Inspections</Link>
                </>
              )}
              <Link href="/app/profile" className="block px-4 py-2 hover:bg-neutral-800">My Profile</Link>
              <Link href="/settings" className="block px-4 py-2 hover:bg-neutral-800">Settings</Link>
              <Link href="/compare-plans" className="block px-4 py-2 hover:bg-neutral-800">Plans</Link>
              <button
                onClick={handleSignOut}
                className="block w-full text-left px-4 py-2 hover:bg-neutral-800 text-red-400"
              >
                <FaSignOutAlt className="inline mr-1" /> Sign Out
              </button>
            </>
          ) : (
            <Link href="/sign-in" className="block px-4 py-2 hover:bg-neutral-800 text-orange-400">Sign In</Link>
          )}
        </div>
      )}
    </nav>
  );
}