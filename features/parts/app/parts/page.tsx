import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { listParts } from "@/features/parts/lib/parts.queries";

type DB = Database;

async function getShopId(): Promise<string> {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", user.id)
    .single();

  return profile?.shop_id ?? "";
}

export default async function PartsPage() {
  const shopId = await getShopId();
  const parts = shopId ? await listParts(shopId) : [];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Parts</h1>

      <a
        href="/parts/new"
        className="px-3 py-2 rounded-xl bg-neutral-900 text-white"
      >
        New Part
      </a>

      {!shopId ? (
        <div className="text-sm text-neutral-500">
          No shop selected. Make sure your profile has a <code>shop_id</code>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {parts.map((p) => (
            <a
              key={p.id}
              href={`/parts/${p.id}`}
              className="border rounded-xl p-3 hover:bg-neutral-50"
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-neutral-500">
                {p.sku ?? "—"} • {p.category ?? "Uncategorized"}
              </div>
            </a>
          ))}
          {parts.length === 0 && (
            <div className="text-sm text-neutral-500">No parts yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
