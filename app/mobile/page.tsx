import { requireActiveDemoAccessForPage } from "@/features/shared/lib/server/admin-access";
import MobileHome from "@/features/mobile/dashboard/MobileHome";

export default async function MobilePage() {
  // Only auth + demo-expiry are enforced here. Middleware deliberately
  // keeps a completed profile with an unrecognized role on /mobile so
  // MobileHome can render its own "role not configured" fallback instead
  // of being redirected to desktop; the full requireShopPageAccess() role
  // gate would break that by bouncing such profiles to /dashboard.
  await requireActiveDemoAccessForPage();
  return <MobileHome />;
}
