// app/mobile/MobileBottomNav.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/mobile", label: "Home" },
  { href: "/mobile/work-orders", label: "Jobs" },
  { href: "/mobile/messages", label: "Chat" },
  { href: "/mobile/settings", label: "Me" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="h-14 border-t border-border flex items-center justify-around bg-background/95 backdrop-blur-md">
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
  );
}