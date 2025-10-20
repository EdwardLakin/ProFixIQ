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

export default async function LocationsPage() {
  const shopId = await getShopId();
  if (!shopId) {
    return <div className="p-6 text-sm text-neutral-500">No shop selected.</div>;
  }

  await ensureMainLocation(shopId);
  const locs = await listLocations(shopId);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Locations</h1>
        <p className="text-neutral-600 text-sm">Manage bins/shelves for parts.</p>
      </div>

      <div className="border rounded-xl p-4">
        <div className="font-semibold mb-2">Add Location</div>
        <LocationForm shopId={shopId} />
      </div>

      <div className="border rounded-xl p-4">
        <div className="font-semibold mb-2">Existing</div>
        <div className="grid gap-2">
          {locs.map(l => (
            <div key={l.id} className="flex justify-between border rounded p-2">
              <span className="font-medium">{l.code}</span>
              <span className="text-neutral-600">{l.name}</span>
            </div>
          ))}
          {locs.length === 0 && <div className="text-sm text-neutral-500">No locations yet.</div>}
        </div>
      </div>
    </div>
  );
}
