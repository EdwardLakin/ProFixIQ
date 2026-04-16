import { redirect } from "next/navigation";
import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";

export default async function PortalFleetBoardRedirectPage() {
  await requireFleetPortalActor();
  redirect("/fleet/dispatch");
}
