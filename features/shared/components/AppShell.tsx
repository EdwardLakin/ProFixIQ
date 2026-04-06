"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import BrandThemeBoot from "@/features/branding/components/BrandThemeBoot";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";
import RoleSidebar from "@/features/shared/components/RoleSidebar";
import DashboardHeader from "@/features/shared/components/DashboardHeader";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { data } = useActiveBrand();

  const brandLogoUrl = data?.logoUrl ?? null;
  const brandName = useMemo(() => {
    if (pathname?.startsWith("/dashboard/owner")) return "Owner Workspace";
    if (pathname?.startsWith("/dashboard/admin")) return "Admin Workspace";
    return "ProFixIQ";
  }, [pathname]);

  return (
    <div className="min-h-screen bg-transparent text-white">
      <BrandThemeBoot />

      <div className="flex min-h-screen">
        <aside className="hidden xl:flex xl:w-72 xl:flex-col xl:border-r xl:border-white/10 xl:bg-black/20 xl:backdrop-blur-xl">
          <div className="border-b border-white/10 px-5 py-5">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="brand-logo-slot flex min-h-[40px] min-w-[140px] items-center">
                {brandLogoUrl ? (
                  <Image
                    src={brandLogoUrl}
                    alt="Shop logo"
                    width={140}
                    height={40}
                    className="h-10 w-auto object-contain"
                    unoptimized
                  />
                ) : (
                  <div className="text-lg font-semibold tracking-[0.18em] text-[var(--accent-copper-light)]">
                    ProFixIQ
                  </div>
                )}
              </div>
            </Link>

            <div className="mt-2 text-xs uppercase tracking-[0.22em] text-neutral-400">
              {brandName}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <RoleSidebar />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardHeader />
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
