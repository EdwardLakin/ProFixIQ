import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import OpsMarketingMediaLibraryManager from "@/features/ops/components/OpsMarketingMediaLibraryManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function OpsMarketingLibraryPage() {
  return (
    <>
      <div className="mb-5">
        <Link
          href="/ops/marketing"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--theme-text-secondary)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to landing media
        </Link>
      </div>
      <OpsMarketingMediaLibraryManager />
    </>
  );
}
