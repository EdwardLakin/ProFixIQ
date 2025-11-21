"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/mobile/work-orders", label: "Jobs" },
  { href: "/mobile/inspections/123", label: "Inspect" }, // TODO: Replace with smarter routing / shortcuts
  { href: "/mobile/messages", label: "Messages" },
  { href: "/mobile/media/upload", label: "Media" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="h-14 border-t border-border flex items-center justify-around bg-background">
      {navItems.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center text-xs ${
              active ? "font-semibold" : "text-muted-foreground"
            }`}
          >
            {/* TODO: replace with icons later */}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
