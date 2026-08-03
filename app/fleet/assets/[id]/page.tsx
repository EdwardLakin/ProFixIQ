import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function LegacyFleetAssetPage({ params }: Props) {
  const { id } = await params;
  redirect(`/fleet/units/${encodeURIComponent(id)}`);
}
