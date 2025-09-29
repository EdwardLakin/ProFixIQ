// Dock component
// features/launcher/components/Dock.tsx
"use client";

import { useRouter } from "next/navigation";
import { APPS } from "@/features/launcher/registry";

const DOCK = ["work-orders", "inspections", "messages", "appointments"];

export default function Dock() {
  const router = useRouter();
  return (
    <div className="mx-auto w-[85%] rounded-3xl bg-black/25 p-3 backdrop-blur">
      <div className="grid grid-cols-4 gap-3">
        {DOCK.map((slug) => {
          const app = APPS.find((a) => a.slug === slug);
          if (!app) return null;
          return (
            <button
              key={slug}
              onClick={() => router.push(app.route)}
              className="rounded-xl bg-white/15 p-2"
              aria-label={app.name}
              title={app.name}
            >
              <span className="text-2xl">{app.icon}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}