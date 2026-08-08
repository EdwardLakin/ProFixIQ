import { redirect } from "next/navigation";

export default async function LegacyPoReceivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  redirect(`/parts/po/${encodeURIComponent(id)}#receive`);
}
