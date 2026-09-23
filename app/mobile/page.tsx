import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import MobileHome from "@/features/mobile/dashboard/MobileHome";

export default async function MobilePage() {
  await requireShopPageAccess({});
  return <MobileHome />;
}
