import Link from "next/link";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { listLocations, ensureMainLocation } from "@/features/parts/lib/locations";
import { LocationForm } from "@/features/parts/components/LocationForm";

type DB = Database;

async function getShopId(): Promise<string> {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";
  const { data } = await supabase.from("profiles").select("shop_id").eq("user_id", user.id).single();
  return data?.shop_id ?? "";
}

const shell = "p-6 text-white";
const glass = "rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm shadow-[0_0_40px_rgba(0,0,0,0.65)]";
const muted = "text-neutral-400";
const btn =
  "inline-flex items-center justify-center rounded-full border border-white/12 bg-black/40 px-3 py-1.5 text-sm text-neutral-200 hover:border-orange-400/60 hover:text-white";

export default async function LocationsPage() {
  const shopId = await getShopId();
  if (!shopId) {
    return (
      <div className={shell}>
        <div className={`${glass} p-4 text-sm ${muted}`}>No shop selected.</div>
      </div>
    );
  }

  await ensureMainLocation(shopId);
  const locs = await listLocations(shopId);

  return (
    <div className={shell}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Parts</div>
          <h1 className="font-header text-3xl text-orange-400">Locations</h1>
          <p className={`mt-1 text-sm ${muted}`}>Manage bins/shelves for parts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={btn} href="/parts">Inventory</Link>
          <Link className={btn} href="/parts/new">New Part</Link>
          <Link className={btn} href="/parts/suppliers">Suppliers</Link>
          <Link className={btn} href="/dashboard/parts">Requests</Link>
        </div>
      </div>

      <div className="grid gap-4">
        <div className={`${glass} p-4`}>
          <div className="mb-2 text-sm font-semibold text-neutral-200">Add Location</div>
          <LocationForm shopId={shopId} />
        </div>

        <div className={`${glass} p-4`}>
          <div className="mb-2 text-sm font-semibold text-neutral-200">Existing</div>
          <div className="grid gap-2">
            {locs.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2"
              >
                <span className="font-medium text-neutral-100">{l.code}</span>
                <span className={`text-sm ${muted}`}>{l.name}</span>
              </div>
            ))}
            {locs.length === 0 && (
              <div className={`rounded-xl border border-white/10 bg-black/25 p-3 text-sm ${muted}`}>
                No locations yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
