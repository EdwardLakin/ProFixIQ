// app/mobile/layout.tsx
"use client";


import { MobileShell } from "components/layout/MobileShell";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MobileShell>{children}</MobileShell>;
}