import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { VehicleImportCustomerOption } from "@/features/vehicles/lib/importCsv";

type DB = Database;

type CustomerRow = Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "business_name" | "name" | "first_name" | "last_name" | "email" | "phone" | "phone_number" | "external_id">;

const CUSTOMER_PAGE_SIZE = 1000;

export async function fetchVehicleImportCustomers(supabase: SupabaseClient<DB>, shopId: string): Promise<VehicleImportCustomerOption[]> {
  const customers: CustomerRow[] = [];

  for (let from = 0; ; from += CUSTOMER_PAGE_SIZE) {
    const to = from + CUSTOMER_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("customers")
      .select("id, business_name, name, first_name, last_name, email, phone, phone_number, external_id")
      .eq("shop_id", shopId)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as CustomerRow[];
    customers.push(...page);
    if (page.length < CUSTOMER_PAGE_SIZE) break;
  }

  return customers;
}
