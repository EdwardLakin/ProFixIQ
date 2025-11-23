// components/layout/MobileShell.tsx
"use client";

import type { ReactNode } from "react";
import { MobileBottomNav } from "./MobileBottomNav";

type Props = {
  children: ReactNode;
};

export function MobileShell({ children }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <main className="flex-1 pb-24">{children}</main>
      <MobileBottomNav />
    </div>
  );
}

export default MobileShell;