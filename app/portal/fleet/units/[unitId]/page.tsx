import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ unitId: string }>;
};

export default async function PortalFleetUnitRedirectPage({ params }: Props) {
  await params;
  redirect("/fleet/units");
}
