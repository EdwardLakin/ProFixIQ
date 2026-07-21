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

    const customers = (data ?? []).map((row) => ({
      id: row.id,
      name:
        row.name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Customer",
      email: row.email ?? null,
      phone: row.phone ?? null,
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
  outputSchema: z.object({
    ok: z.literal(true),
    customer: CustomerSchema,
    summary: z.string(),
  }),
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
      ],
      metadata: { duplicateCount },
    };
  },
  async execute(input, context) {
    const { data, error } = await context.actor.supabase
      .from("customers")
      .insert({
        shop_id: context.actor.shopId,
        name: input.name,
        email: input.email,
        phone: input.phone,
      })
      .select("id, name, first_name, last_name, email, phone")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create customer.");
    }

    const customer = {
      id: data.id,
      name:
        data.name?.trim() ||
        [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
        input.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      href: `/customers/${data.id}`,
    };
    return {
      ok: true as const,
      customer,
      summary: `${customer.name} was created as a shop customer.`,
    };
  },
});
