import { redirect } from "next/navigation";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

export default async function PortalFleetPretripHistoryRedirectPage() {
  await requireFleetPortalActor();
  redirect("/fleet/pretrip");
}
