import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

const In = z.object({
  name: z.string().min(1, "name required"),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});
export type CreateCustomerIn = z.infer<typeof In>;

const Out = z.object({ customerId: z.string().uuid() });
export type CreateCustomerOut = z.infer<typeof Out>;

export const toolCreateCustomer: ToolDef<CreateCustomerIn, CreateCustomerOut> = {
  name: "create_customer",
  description: "Create a new customer",
  inputSchema: In,
  outputSchema: Out,
  async run(input, _ctx) {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Failed to create customer");
    return { customerId: data.id };
  }
};
