// app/dashboard/layout.tsx
'use client';

import type { ReactNode } from 'react';
import Navbar from '@components/nav/Navbar';
import DynamicRoleSidebar from '@components/sidebar/DynamicRoleSidebar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white font-blackops">
      <Navbar />
      <div className="flex">
        {/* Sidebar visible on md+ */}
        <aside className="w-64 bg-neutral-900 p-4 border-r border-neutral-800 hidden md:block">
          <DynamicRoleSidebar />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}