import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { PartForm } from "@/features/parts/components/PartForm";

type DB = Database;

async function getShopId(): Promise<string> {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";
  const { data } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", user.id)
    .single();
  return data?.shop_id ?? "";
}

export default async function NewPartPage() {
  const shopId = await getShopId();

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">New Part</h1>
      {!shopId ? (
        <div className="text-sm text-neutral-500">
          No shop selected. Make sure your profile has a <code>shop_id</code>.
        </div>
      ) : (
        <PartForm shopId={shopId} />
      )}
    </div>
  );
}
