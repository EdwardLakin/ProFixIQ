// app/mobile/MobileBottomNav.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PunchInOutButton, {
  type JobLine,
} from "@/features/shared/components/PunchInOutButton";

const navItems = [
  { href: "/mobile", label: "Home" },
  { href: "/mobile/work-orders", label: "Jobs" },
  { href: "/mobile/messages", label: "Chat" },
  { href: "/mobile/settings", label: "Me" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  // Local demo state for punch in/out
  const [activeJob, setActiveJob] = useState<JobLine | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePunchIn = async () => {
    try {
      setIsLoading(true);
      // TODO: replace with real API call
      const fakeJob: JobLine = {
        id: "demo-job-id",
        vehicle: "Assigned vehicle",
      };
      setActiveJob(fakeJob);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePunchOut = async () => {
    try {
      setIsLoading(true);
      // TODO: replace with real API call
      setActiveJob(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      {/* Floating punch in/out button just above the tab bar */}
      <div className="pointer-events-none absolute left-0 right-0 -top-6 px-4">
        <div className="-mt-4 pointer-events-auto">
          <PunchInOutButton
            activeJob={activeJob}
            onPunchIn={handlePunchIn}
            onPunchOut={handlePunchOut}
            isLoading={isLoading}
          />
        </div>
      </div>

      <nav className="h-16 border-t border-border flex items-center justify-around bg-background/95 backdrop-blur-md pt-6">
        {navItems.map((item) => {
          const active =
            item.href === "/mobile"
              ? pathname === "/mobile"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center text-[11px] ${
                active ? "font-semibold text-white" : "text-muted-foreground"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}