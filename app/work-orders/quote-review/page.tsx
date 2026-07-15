export const dynamic = "force-dynamic";
export const revalidate = 0;

import QuoteReviewPage from "@/features/work-orders/app/work-orders/quote-review/page";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function GuardedQuoteReviewPage() {
  await requireShopPageAccess({ allowRoles: ROLE_GROUPS.quoteAuthorizers });
  return <QuoteReviewPage />;
}
