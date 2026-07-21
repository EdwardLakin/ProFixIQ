import "server-only";

import { z } from "zod";

import { defineShopAssistantTool } from "../types";

const CustomerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  href: z.string(),
});

const CustomerCreateResultSchema = z.object({
  ok: z.literal(true),
  customer: CustomerSchema,
  summary: z.string(),
});

type CustomerRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function customerName(row: CustomerRow): string {
  return (
    row.name?.trim() ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    "Customer"
  );
}

function rpcErrorMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

export const findCustomersTool = defineShopAssistantTool({
  name: "find_customers",
  domain: "customers",
  description: "Find customers by name, email, or phone within the current shop.",
  mode: "read",
  risk: "low",
  requiredCapability: "canViewShopWideData",
  confirmation: "never",
  inputSchema: z.object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    customers: z.array(CustomerSchema),
    summary: z.string(),
  }),
  async execute(input, context) {
    const token = input.query.replace(/[%,]/g, " ").trim();
    const { data, error } = await context.actor.supabase
      .from("customers")
      .select("id, name, first_name, last_name, email, phone")
      .eq("shop_id", context.actor.shopId)
      .or(
        [
          `name.ilike.%${token}%`,
          `first_name.ilike.%${token}%`,
          `last_name.ilike.%${token}%`,
          `email.ilike.%${token}%`,
          `phone.ilike.%${token}%`,
        ].join(","),
      )
      .order("name", { ascending: true })
      .limit(input.limit);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as CustomerRow[];
    const customers = rows.map((row) => ({
      id: row.id,
      name: customerName(row),
      email: row.email,
      phone: row.phone,
      href: `/customers/${row.id}`,
    }));

    return {
      ok: true as const,
      customers,
      summary: `${customers.length} customer(s) matched “${input.query}”.`,
    };
  },
});

export const createCustomerTool = defineShopAssistantTool({
  name: "create_customer",
  domain: "customers",
  description: "Create a new customer in the current shop.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageWorkOrders",
  confirmation: "required",
  inputSchema: z.object({
    name: z.string().trim().min(2).max(200),
    email: z.string().email().optional(),
    phone: z.string().trim().min(3).max(50).optional(),
  }),
  outputSchema: CustomerCreateResultSchema,
  async preview(input, context) {
    let duplicateCount = 0;
    if (input.email) {
      const { count, error } = await context.actor.supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", context.actor.shopId)
        .ilike("email", input.email);
      if (error) throw new Error(error.message);
      duplicateCount = count ?? 0;
    }

    return {
      title: `Create customer ${input.name}`,
      summary: `Create a new customer record for ${input.name}.`,
      consequences: [
        input.email
          ? `Email: ${input.email}`
          : "No email address will be saved.",
        input.phone ? `Phone: ${input.phone}` : "No phone number will be saved.",
        duplicateCount > 0
          ? "A same-shop customer already uses this email; review before confirming."
          : "No same-shop email duplicate was found.",
        "The customer record and terminal assistant result will be committed atomically.",
      ],
      metadata: { duplicateCount },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for atomic customer creation.");
    }

    const rpc = context.actor.supabase as unknown as RpcClient;
    const { data, error } = await rpc.rpc(
      "shop_assistant_create_customer_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_name: input.name,
        p_email: input.email ?? null,
        p_phone: input.phone ?? null,
      },
    );
    if (error) throw new Error(rpcErrorMessage(error));
    return CustomerCreateResultSchema.parse(data);
  },
});
