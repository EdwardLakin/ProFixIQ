"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// app/page.tsx
import ProFixIQLanding from "@shared/components/ProFixIQLanding";

export default function Page() {
  return <ProFixIQLanding />;
}