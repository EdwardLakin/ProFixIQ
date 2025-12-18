import Link from "next/link";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { listParts } from "@/features/parts/lib/parts.queries";

type DB = Database;

async function getShopId(): Promise<string> {
  const supabase = createServerComponentClient<DB>({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", user.id)
    .single();

  return profile?.shop_id ?? "";
}

const shell = "p-6 text-white";
const glass = "rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm shadow-[0_0_40px_rgba(0,0,0,0.65)]";
const muted = "text-neutral-400";
const accent = "text-orange-300";
const btn =
  "inline-flex items-center justify-center rounded-full border border-white/12 bg-black/40 px-3 py-1.5 text-sm text-neutral-200 hover:border-orange-400/60 hover:text-white";

function PartsSubnav() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link className={btn} href="/parts">Inventory</Link>
      <Link className={btn} href="/parts/new">New Part</Link>
      <Link className={btn} href="/parts/suppliers">Suppliers</Link>
      <Link className={btn} href="/parts/locations">Locations</Link>
      <Link className={btn} href="/dashboard/parts">Requests</Link>
    </div>
  );
}

export default async function PartsPage() {
  const shopId = await getShopId();
  const parts = shopId ? await listParts(shopId) : [];

  return (
    <div className={shell}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Parts</div>
          <h1 className="font-header text-3xl text-orange-400">Inventory</h1>
          <p className={`mt-1 text-sm ${muted}`}>Manage parts, stock, suppliers, and locations.</p>
        </div>
        <PartsSubnav />
      </div>

      {!shopId ? (
        <div className={`${glass} p-4`}>
          <div className="font-semibold">No shop selected</div>
          <p className={`mt-1 text-sm ${muted}`}>
            Make sure your profile has a <code className="text-neutral-200">shop_id</code>.
          </p>
        </div>
      ) : (
        <div className={`${glass} p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-200">Parts</div>
            <Link
              href="/parts/new"
              className="rounded-full bg-[var(--accent-copper,theme(colors.orange.500))] px-4 py-1.5 text-sm font-semibold text-black shadow-[0_0_24px_rgba(248,113,22,0.45)] hover:opacity-90"
            >
              + New Part
            </Link>
          </div>

          {parts.length === 0 ? (
            <div className={`rounded-xl border border-white/10 bg-black/30 p-4 text-sm ${muted}`}>
              No parts yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {parts.map((p) => (
                <Link
                  key={p.id}
                  href={`/parts/${p.id}`}
                  className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 transition hover:border-orange-400/40 hover:bg-black/35"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-neutral-100">
                        {p.name}
                      </div>
                      <div className={`mt-0.5 truncate text-xs ${muted}`}>
                        {p.sku ?? "—"} • {p.category ?? "Uncategorized"}
                      </div>
                    </div>
                    <div className={`shrink-0 text-xs ${accent}`}>
                      Open →
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
