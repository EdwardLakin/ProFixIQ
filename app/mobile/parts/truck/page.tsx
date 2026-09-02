import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MobileTruckInventoryPage() {
  redirect("/mobile/service/truck-inventory");
}
