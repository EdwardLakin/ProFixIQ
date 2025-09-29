// features/launcher/components/Dock.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Dock() {
  const pathname = usePathname();
  const isHome = pathname?.startsWith("/dashboard");

  return (
    <div className="mx-auto w-full max-w-[560px] md:max-w-[720px]">
      <div className="mx-4 rounded-2xl bg-neutral-900/80 p-2 ring-1 ring-white/10 backdrop-blur">
        <div className="flex items-center justify-center gap-3">
          {/* Home */}
          <Link
            href="/dashboard"
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              isHome ? "bg-orange-500 text-black" : "bg-white/10 text-white hover:bg-white/15"
            }`}
          >
            Home
          </Link>

          {/* You can add more dock items here if you like */}
          <Link
            href="/chat"
            className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
          >
            Messages
          </Link>
          <Link
            href="/work-orders/queue"
            className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
          >
            My Queue
          </Link>
        </div>
      </div>
    </div>
  );
}