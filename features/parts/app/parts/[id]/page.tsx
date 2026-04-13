import { redirect } from "next/navigation";

// Legacy ownership shim. Canonical route family: /parts/inventory
export default async function LegacyPartDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/parts/inventory?part=${encodeURIComponent(id)}`);
}
