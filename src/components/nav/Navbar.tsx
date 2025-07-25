'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { FaBars, FaBell, FaSearch, FaSignOutAlt } from 'react-icons/fa';
import clsx from 'clsx';
import RoleNavTech from '@components/nav/RoleNavTech';
import RoleNavAdmin from '@components/nav/RoleNavAdmin';
import RoleNavAdvisor from '@components/nav/RoleNavAdvisor';
import RoleNavOwner from '@components/nav/RoleNavOwner';
import RoleNavManager from '@components/nav/RoleNavManager';
import type { Database } from '@/types/supabase';

export default function Navbar() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Database['public']['Tables']['profiles']['Row'] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [shiftStatus, setShiftStatus] = useState<'not_started' | 'punched_in' | 'on_break' | 'on_lunch' | 'punched_out' | 'ended' | 'active'>('not_started');

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      setUser(session.user);

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(prof);

      const { data: shift } = await supabase
        .from('tech_shifts')
        .select('*')
        .eq('tech_id', session.user.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (!shift) setShiftStatus('not_started');
      else if (shift.break_start && !shift.break_end) setShiftStatus('on_break');
      else if (shift.lunch_start && !shift.lunch_end) setShiftStatus('on_lunch');
      else setShiftStatus('active');
    };

    load();
  }, [supabase]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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

  const shiftColor = {
    not_started: 'bg-black',
    active: 'bg-green-700',
    on_break: 'bg-yellow-600',
    on_lunch: 'bg-orange-600',
    ended: 'bg-neutral-800',
    punched_in: 'bg-green-700',
    punched_out: 'bg-neutral-800',
  }[shiftStatus];

  const renderRoleLinks = () => {
    switch (profile?.role) {
      case 'mechanic':
        return <RoleNavTech />;
      case 'advisor':
        return <RoleNavAdvisor />;
      case 'manager':
        return <RoleNavManager />;
      case 'admin':
        return <RoleNavAdmin />;
      case 'owner':
        return <RoleNavOwner />;
      default:
        return null;
    }
  };

  return (
    <nav className={clsx('text-white p-4 font-blackops border-b border-neutral-800', shiftColor)}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl text-orange-500 font-blackops">🔧 ProFixIQ</Link>

        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <>
              {renderRoleLinks()}
              <button title="Quick Access" className="hover:text-orange-400" onClick={() => alert('Quick Access coming soon')}>
                <FaSearch />
              </button>
              <button className="hover:text-orange-400" onClick={() => alert('Notifications coming soon')}>
                <FaBell />
              </button>
              <div className="relative" ref={dropdownRef}>
                <button onClick={() => setDropdownOpen(prev => !prev)} className="hover:text-orange-400">
                  {profile?.full_name || 'Profile'}
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 bg-neutral-900 border border-neutral-700 rounded shadow-md z-50 min-w-[160px]">
                    <Link href="/app/profile" className="block px-4 py-2 hover:bg-neutral-800">My Profile</Link>
                    <Link href="/settings" className="block px-4 py-2 hover:bg-neutral-800">Settings</Link>
                    <Link href="/compare-plans" className="block px-4 py-2 hover:bg-neutral-800">Plans</Link>
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
          <button onClick={() => setMenuOpen(prev => !prev)} aria-label="Menu">
            <FaBars />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden mt-4 space-y-2 text-sm">
          {user ? (
            <>
              {renderRoleLinks()}
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