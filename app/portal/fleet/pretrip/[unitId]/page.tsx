import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ unitId: string }>;
};

export default async function PortalFleetPretripRedirectPage({ params }: Props) {
  await params;
  redirect("/fleet/pretrip");
}
