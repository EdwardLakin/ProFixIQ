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

export default async function SuppliersPage() {
  const shopId = await getShopId();
  if (!shopId) {
    return <div className="p-6 text-sm text-neutral-500">No shop selected.</div>;
  }

  const suppliers = await listSuppliers(shopId);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <p className="text-neutral-600 text-sm">Create and manage parts vendors.</p>
      </div>

      <div className="border rounded-xl p-4">
        <div className="font-semibold mb-2">Add Supplier</div>
        <SupplierForm shopId={shopId} />
      </div>

      <div className="border rounded-xl p-4">
        <div className="font-semibold mb-2">Existing</div>
        <div className="grid gap-2">
          {suppliers.map(s => (
            <div key={s.id} className="flex justify-between border rounded p-2">
              <span className="font-medium">{s.name}</span>
              <span className="text-neutral-600 text-sm">{s.email ?? ""} {s.phone ? `• ${s.phone}` : ""}</span>
            </div>
          ))}
          {suppliers.length === 0 && <div className="text-sm text-neutral-500">No suppliers yet.</div>}
        </div>
      </div>
    </div>
  );
}
