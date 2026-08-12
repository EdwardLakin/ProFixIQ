import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

const In = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});
export type CreateCustomerIn = z.infer<typeof In>;

const Out = z.object({ customerId: z.string().uuid() });
export type CreateCustomerOut = z.infer<typeof Out>;

export const toolCreateCustomer: ToolDef<CreateCustomerIn, CreateCustomerOut> =
  {
    name: "create_customer",
    description: "Create a customer in the current shop",
    inputSchema: In,
    outputSchema: Out,
    async run(input, ctx) {
      const supabase = getServerSupabase();

      const operationKey = `agent-create-customer:${ctx.shopId}:${crypto.randomUUID()}`;
      const { data, error } = await supabase.rpc(
        "create_customer_account_atomic" as never,
        {
          p_shop_id: ctx.shopId,
          p_account_type: "individual",
          p_name: input.name,
          p_business_name: null,
          p_email: input.email ?? null,
          p_phone: input.phone ?? null,
          p_address: null,
          p_city: null,
          p_province: null,
          p_postal_code: null,
          p_notes: "Created through the ProFixIQ agent.",
          p_vin: null,
          p_match_existing: true,
          p_allow_duplicate: false,
          p_actor_user_id: ctx.userId,
          p_operation_key: operationKey,
        } as never,
      );

      if (error) throw new Error(error.message);
      const result = data as {
        ok?: boolean;
        customer?: { id?: string };
      } | null;
      if (!result?.ok || !result.customer?.id) {
        throw new Error("Possible duplicate customer requires review.");
      }
      return { customerId: result.customer.id };
    },
  };
