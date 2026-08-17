import "server-only";

import { z } from "zod";

import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { defineShopAssistantTool, runShopAssistantCommandRpc } from "../types";

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

const VehicleCreateResultSchema = z.object({
  ok: z.literal(true),
  vehicle: z.object({
    id: z.string().uuid(),
    customerId: z.string().uuid(),
    year: z.number().int().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    vin: z.string().nullable(),
    licensePlate: z.string().nullable(),
    unitNumber: z.string().nullable(),
  }),
  summary: z.string(),
  href: z.string(),
});

type CustomerRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

function customerName(row: CustomerRow): string {
  return (
    row.name?.trim() ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    "Customer"
  );
}

export const findCustomersTool = defineShopAssistantTool({
  name: "find_customers",
  domain: "customers",
  description:
    "Find customers by name, email, or phone within the current shop.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: ["canViewShopWideData", "canManageWorkOrders"],
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
    const token = input.query
      .replace(/[^a-zA-Z0-9@.+ _-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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
        input.phone
          ? `Phone: ${input.phone}`
          : "No phone number will be saved.",
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

    const data = await runShopAssistantCommandRpc(
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
    return CustomerCreateResultSchema.parse(data);
  },
});

export const createVehicleTool = defineShopAssistantTool({
  name: "create_vehicle",
  domain: "customers",
  description:
    "Create a vehicle for an existing same-shop customer, including VIN, plate, unit, year, make, model, mileage, and notes.",
  mode: "write",
  risk: "medium",
  requiredCapability: "canManageWorkOrders",
  confirmation: "required",
  inputSchema: z.object({
    customerId: z.string().uuid(),
    year: z.number().int().min(1886).max(2100).optional(),
    make: z.string().trim().max(100).optional(),
    model: z.string().trim().max(100).optional(),
    vin: z.string().trim().min(6).max(17).optional(),
    licensePlate: z.string().trim().min(2).max(32).optional(),
    unitNumber: z.string().trim().min(1).max(64).optional(),
    mileage: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
  outputSchema: VehicleCreateResultSchema,
  async preview(input, context) {
    if (
      !input.vin &&
      !input.licensePlate &&
      !input.unitNumber &&
      !input.make &&
      !input.model
    ) {
      throw new ShopAssistantHttpError(
        400,
        "Provide a VIN, plate, unit number, make, or model for the vehicle.",
      );
    }

    const { data: customer, error: customerError } =
      await context.actor.supabase
        .from("customers")
        .select("id, name, first_name, last_name")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.customerId)
        .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (!customer) {
      throw new ShopAssistantHttpError(404, "Customer not found in this shop.");
    }

    let duplicateVinCount = 0;
    if (input.vin) {
      const { count, error } = await context.actor.supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", context.actor.shopId)
        .ilike("vin", input.vin);
      if (error) throw new Error(error.message);
      duplicateVinCount = count ?? 0;
    }

    const owner = customerName(customer as CustomerRow);
    const label =
      [input.year, input.make, input.model].filter(Boolean).join(" ") ||
      input.unitNumber ||
      input.licensePlate ||
      input.vin ||
      "Vehicle";
    return {
      title: `Add ${label}`,
      summary: `Add this vehicle to ${owner}'s same-shop customer record.`,
      consequences: [
        input.vin ? `VIN: ${input.vin.toUpperCase()}` : "No VIN will be saved.",
        input.licensePlate
          ? `Plate: ${input.licensePlate.toUpperCase()}`
          : "No plate will be saved.",
        duplicateVinCount > 0
          ? "This VIN already exists in the shop; confirmation will fail closed."
          : "No same-shop VIN duplicate was found.",
        "The vehicle and terminal assistant result will be committed atomically.",
      ],
      metadata: {
        customerId: input.customerId,
        customerName: owner,
        duplicateVinCount,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for atomic vehicle creation.");
    }
    const data = await runShopAssistantCommandRpc(
      "shop_assistant_create_vehicle_atomic",
      {
        p_action_id: context.actionId,
        p_shop_id: context.actor.shopId,
        p_actor_user_id: context.actor.userId,
        p_customer_id: input.customerId,
        p_year: input.year ?? null,
        p_make: input.make ?? null,
        p_model: input.model ?? null,
        p_vin: input.vin ?? null,
        p_license_plate: input.licensePlate ?? null,
        p_unit_number: input.unitNumber ?? null,
        p_mileage: input.mileage ?? null,
        p_notes: input.notes ?? null,
      },
    );
    return VehicleCreateResultSchema.parse(data);
  },
});
