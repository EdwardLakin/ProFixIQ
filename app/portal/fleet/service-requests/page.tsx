import { redirect } from "next/navigation";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

export default async function PortalFleetServiceRequestsRedirectPage() {
  await requireFleetPortalActor();
  redirect("/fleet/service-requests");
}
