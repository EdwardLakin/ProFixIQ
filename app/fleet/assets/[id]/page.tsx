// app/fleet/assets/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import Container from "@shared/components/ui/Container";
import AssetDetailScreen from "@/features/fleet/components/AssetDetailScreen";

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ? String(params.id) : null;

  if (!id) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-black px-4 py-6 text-sm text-red-300">
        Missing fleet unit id.
      </main>
    );
  }

  return (
    <main className="relative min-h-[calc(100vh-3rem)] bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      />
      <Container className="py-6">
        <AssetDetailScreen unitId={id} />
      </Container>
    </main>
  );
}