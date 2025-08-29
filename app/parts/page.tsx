export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

export default function PartsHome() {
  return (
    <div className="p-6 space-y-4 text-white">
      <h1 className="text-2xl font-bold text-orange-400">Parts</h1>
      <p className="text-white/80">
        Parts home screen placeholder. We can wire this to your Parts flows
        (requests, search, photos) next.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/dashboard/owner"
          className="bg-neutral-800 hover:bg-orange-600 p-4 rounded transition"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}