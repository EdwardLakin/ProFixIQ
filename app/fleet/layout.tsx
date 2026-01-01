// app/fleet/layout.tsx
import type { ReactNode } from "react";
import AppShell from "@/features/shared/components/AppShell";
import FleetTabs from "@/features/fleet/components/FleetTabs";

type Props = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function FleetLayout({ children }: Props) {
  return (
    <AppShell>
      <div className="px-4 py-6 text-white">
        <div className="mx-auto w-full max-w-6xl">
          <FleetTabs />
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </AppShell>
  );
}