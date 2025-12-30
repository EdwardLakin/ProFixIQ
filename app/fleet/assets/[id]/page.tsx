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
    <main className="min-h-[calc(100vh-3rem)] bg-black text-white">
      <Container className="py-6">
        <AssetDetailScreen unitId={id} />
      </Container>
    </main>
  );
}