import { ShieldAlert } from "lucide-react";
import OpsDemoAccess from "@/features/ops/components/OpsDemoAccess";
import { listDemoProspects } from "@/features/ops/server/demoAccess";
import { listDemoAccessRequests } from "@/features/ops/server/demoAccessRequests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsDemoAccessPage() {
  try {
    const [{ shop, prospects }, requests] = await Promise.all([
      listDemoProspects(),
      listDemoAccessRequests(),
    ]);
    return <OpsDemoAccess shop={shop} prospects={prospects} requests={requests} />;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve the configured Demo Shop.";
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-500/40 bg-red-500/5 p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-red-300">
          <ShieldAlert className="h-4 w-4" />
          Demo Shop not ready
        </div>
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">{message}</p>
        <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
          Set DEMO_SHOP_ID and confirm the shop has
          billing_entitlement_override = &apos;internal_demo&apos; before
          using this page.
        </p>
      </div>
    );
  }
}
