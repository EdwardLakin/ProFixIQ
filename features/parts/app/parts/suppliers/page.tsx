import Link from "next/link";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { listSuppliers } from "@/features/parts/lib/suppliers";
import { SupplierForm } from "@/features/parts/components/SupplierForm";

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

export default async function SuppliersPage() {
  const shopId = await getShopId();
  if (!shopId) {
    return (
      <div className={shell}>
        <div className={`${glass} p-4 text-sm ${muted}`}>No shop selected.</div>
      </div>
    );
  }

  const suppliers = await listSuppliers(shopId);

  return (
    <div className={shell}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Parts</div>
          <h1 className="font-header text-3xl text-orange-400">Suppliers</h1>
          <p className={`mt-1 text-sm ${muted}`}>Create and manage parts vendors.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={btn} href="/parts">Inventory</Link>
          <Link className={btn} href="/parts/new">New Part</Link>
          <Link className={btn} href="/parts/locations">Locations</Link>
          <Link className={btn} href="/dashboard/parts">Requests</Link>
        </div>
      </div>

      <div className="grid gap-4">
        <div className={`${glass} p-4`}>
          <div className="mb-2 text-sm font-semibold text-neutral-200">Add Supplier</div>
          <SupplierForm shopId={shopId} />
        </div>

        <div className={`${glass} p-4`}>
          <div className="mb-2 text-sm font-semibold text-neutral-200">Existing</div>
          <div className="grid gap-2">
            {suppliers.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/25 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-neutral-100">{s.name}</span>
                <span className={`text-sm ${muted}`}>
                  {(s.email ?? "")}
                  {s.phone ? ` • ${s.phone}` : ""}
                </span>
              </div>
            ))}
            {suppliers.length === 0 && (
              <div className={`rounded-xl border border-white/10 bg-black/25 p-3 text-sm ${muted}`}>
                No suppliers yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
