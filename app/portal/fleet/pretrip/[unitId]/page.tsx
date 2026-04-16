import { redirect } from "next/navigation";
import { requireFleetPortalActor } from "../../_lib/requireFleetPortalActor";

type Props = {
  params: Promise<{ unitId: string }>;
};

export default async function PortalFleetPretripRedirectPage({ params }: Props) {
  await params;
  await requireFleetPortalActor();
  redirect("/fleet/pretrip");
}
