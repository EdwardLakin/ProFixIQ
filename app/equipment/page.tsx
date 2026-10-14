import { unstable_noStore as noStore } from "next/cache";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentDirectoryView from "@/features/equipment/components/EquipmentDirectoryView";
import EquipmentSectionNav from "@/features/equipment/components/EquipmentSectionNav";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { loadEquipmentDirectory } from "@/features/equipment/server/loadEquipmentDirectory";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CUSTOMER_PAGE_SIZE = 500;

export default async function EquipmentDirectoryPage() {
  noStore();

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return <EquipmentAccessState state={entitlement} retryHref="/equipment" />;
  }

  const supabase = createServerSupabaseRSC();
  const admin = createAdminSupabase();
  const directory = await loadEquipmentDirectory({
    supabase,
    admin,
    shopId: profile.shop_id,
    role: canonicalRole,
  });

  const canManage = (ROLE_GROUPS.billingOperators as readonly string[]).includes(canonicalRole);
  let customers: Array<{ id: string; name: string }> = [];
  let customerOptionsError: string | null = null;

  if (canManage) {
    const customerRows: Array<{
      id: string;
      name: string | null;
      business_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      phone_number: string | null;
    }> = [];

    for (let offset = 0; ; offset += CUSTOMER_PAGE_SIZE) {
      const customerResult = await supabase
        .from("customers")
        .select("id,name,business_name,first_name,last_name,email,phone,phone_number")
        .eq("shop_id", profile.shop_id)
        .eq("active", true)
        .is("archived_at", null)
        .is("merged_into_customer_id", null)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + CUSTOMER_PAGE_SIZE - 1);

      if (customerResult.error) {
        console.error("[equipment/page] customer load failed", customerResult.error);
        customerOptionsError =
          "Customer options could not be loaded. You can still browse Equipment; retry before assigning a customer during setup.";
        break;
      }

      const batch = customerResult.data ?? [];
      customerRows.push(...batch);
      if (batch.length < CUSTOMER_PAGE_SIZE) break;
    }

    if (!customerOptionsError) {
      customers = customerRows.map((row) => {
        const displayName =
          row.business_name?.trim() ||
          row.name?.trim() ||
          [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
          "Customer";
        const secondary =
          row.email?.trim() ||
          row.phone?.trim() ||
          row.phone_number?.trim() ||
          `Acct ${row.id.slice(0, 8)}`;
        return { id: row.id, name: `${displayName} · ${secondary}` };
      });
    }
  }

  return (
    <>
      <EquipmentSectionNav current="assets" />
      <EquipmentDirectoryView
        rows={directory.rows}
        truncated={directory.truncated}
        canManage={canManage}
        customers={customers}
        customerOptionsError={customerOptionsError}
      />
    </>
  );
}
