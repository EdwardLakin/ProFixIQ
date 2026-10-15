import Link from "next/link";
import { Library } from "lucide-react";
import OpsMarketingMediaManager from "@/features/ops/components/OpsMarketingMediaManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function OpsMarketingPage() {
  return (
    <>
      <div className="mb-5 flex justify-end">
        <Link
          href="/ops/marketing/library"
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-semibold"
        >
          <Library className="h-4 w-4" /> Manage media library
        </Link>
      </div>
      <OpsMarketingMediaManager />
    </>
  );
}
