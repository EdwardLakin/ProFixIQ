import { redirect } from "next/navigation";

import { PRODUCT_SIGN_IN } from "@/features/auth/lib/accessSurfaceRouting";

export default function FleetSignInRedirectPage() {
  redirect(PRODUCT_SIGN_IN.fleet);
}
