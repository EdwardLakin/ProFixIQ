import "server-only";

import { z } from "zod";

import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import {
  defineShopAssistantTool,
  type ShopAssistantToolContext,
} from "../types";

const OperationalRecordSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "work_order",
    "vehicle",
    "part",
    "part_request",
    "purchase_order",
    "invoice",
  ]),
  label: z.string(),
  status: z.string().nullable(),
  detail: z.string().nullable(),
  updatedAt: z.string().nullable(),
  href: z.string(),
});

const RecordListSchema = z.object({
  ok: z.literal(true),
  records: z.array(OperationalRecordSchema),
  summary: z.string(),
  href: z.string(),
});

function searchToken(value: string | undefined): string | null {
  const token = String(value ?? "")
    .replace(/[^a-zA-Z0-9@.+ _-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return token || null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberText(value: unknown, prefix = ""): string | null {
  const number = Number(value);
  return Number.isFinite(number) ? `${prefix}${number.toFixed(2)}` : null;
}

async function assertCustomerInShop(params: {
  customerId: string;
  shopId: string;
  supabase: ShopAssistantToolContext["actor"]["supabase"];
}) {
  const { data, error } = await params.supabase
    .from("customers")
    .select("id, name, first_name, last_name")
    .eq("shop_id", params.shopId)
    .eq("id", params.customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new ShopAssistantHttpError(404, "Customer not found in this shop.");
  }
  return data;
}

async function assertVehicleInShop(params: {
  vehicleId: string;
  shopId: string;
  supabase: ShopAssistantToolContext["actor"]["supabase"];
}) {
  const { data, error } = await params.supabase
    .from("vehicles")
    .select("id, year, make, model, unit_number, license_plate, vin")
    .eq("shop_id", params.shopId)
    .eq("id", params.vehicleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new ShopAssistantHttpError(404, "Vehicle not found in this shop.");
  }
  return data;
}

export const searchWorkOrdersTool = defineShopAssistantTool({
  name: "search_work_orders",
  domain: "work_orders",
  description:
    "Search or list shop work orders by work-order number, customer, vehicle, VIN, plate, unit, status, customer id, or vehicle id.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: ["canViewShopWideData", "canManageWorkOrders"],
  confirmation: "never",
  inputSchema: z.object({
    query: z.string().trim().max(120).optional(),
    status: z.string().trim().max(50).optional(),
    customerId: z.string().uuid().optional(),
    vehicleId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: RecordListSchema,
  async execute(input, context) {
    let query = context.actor.supabase
      .from("work_orders")
      .select(
        "id, custom_id, status, customer_id, customer_name, vehicle_id, vehicle_year, vehicle_make, vehicle_model, vehicle_unit_number, vehicle_license_plate, vehicle_vin, notes, created_at, updated_at",
      )
      .eq("shop_id", context.actor.shopId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(input.limit);
    if (input.status) query = query.eq("status", input.status);
    if (input.customerId) query = query.eq("customer_id", input.customerId);
    if (input.vehicleId) query = query.eq("vehicle_id", input.vehicleId);
    const token = searchToken(input.query);
    if (token) {
      query = query.or(
        [
          `custom_id.ilike.%${token}%`,
          `customer_name.ilike.%${token}%`,
          `vehicle_make.ilike.%${token}%`,
          `vehicle_model.ilike.%${token}%`,
          `vehicle_unit_number.ilike.%${token}%`,
          `vehicle_license_plate.ilike.%${token}%`,
          `vehicle_vin.ilike.%${token}%`,
        ].join(","),
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const records = (data ?? []).map((row) => {
      const vehicle = [
        row.vehicle_year,
        row.vehicle_make,
        row.vehicle_model,
        row.vehicle_unit_number || row.vehicle_license_plate,
      ]
        .filter(Boolean)
        .join(" ");
      return {
        id: row.id,
        type: "work_order" as const,
        label: row.custom_id
          ? `WO #${row.custom_id}`
          : `WO ${row.id.slice(0, 8)}`,
        status: row.status ?? null,
        detail:
          [row.customer_name, vehicle, text(row.notes)]
            .filter(Boolean)
            .join(" • ") || null,
        updatedAt: row.updated_at ?? row.created_at ?? null,
        href: `/work-orders/${row.id}`,
      };
    });
    return {
      ok: true as const,
      records,
      summary: `${records.length} work order(s) matched the requested filters.`,
      href: "/work-orders",
    };
  },
});

export const searchVehiclesTool = defineShopAssistantTool({
  name: "search_vehicles",
  domain: "customers",
  description:
    "Search vehicles in this shop by VIN, plate, unit number, make, or model.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: ["canViewShopWideData", "canManageWorkOrders"],
  confirmation: "never",
  inputSchema: z.object({
    query: z.string().trim().min(1).max(120),
    customerId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: RecordListSchema,
  async execute(input, context) {
    const token = searchToken(input.query);
    if (!token)
      throw new ShopAssistantHttpError(400, "A vehicle search is required.");
    let query = context.actor.supabase
      .from("vehicles")
      .select(
        "id, customer_id, year, make, model, unit_number, license_plate, vin, status, notes, created_at",
      )
      .eq("shop_id", context.actor.shopId)
      .or(
        [
          `vin.ilike.%${token}%`,
          `license_plate.ilike.%${token}%`,
          `unit_number.ilike.%${token}%`,
          `make.ilike.%${token}%`,
          `model.ilike.%${token}%`,
        ].join(","),
      )
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(input.limit);
    if (input.customerId) query = query.eq("customer_id", input.customerId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const records = (data ?? []).map((row) => {
      const vehicle =
        [row.year, row.make, row.model].filter(Boolean).join(" ") || "Vehicle";
      const identity = row.unit_number ?? row.license_plate ?? row.vin;
      return {
        id: row.id,
        type: "vehicle" as const,
        label: identity ? `${vehicle} • ${identity}` : vehicle,
        status: row.status ?? null,
        detail: text(row.notes),
        updatedAt: row.created_at ?? null,
        href: `/fleet/assets/${row.id}`,
      };
    });
    return {
      ok: true as const,
      records,
      summary: `${records.length} vehicle(s) matched “${input.query}”.`,
      href: "/vehicles",
    };
  },
});

export const readCustomerHistoryTool = defineShopAssistantTool({
  name: "read_customer_history",
  domain: "customers",
  description: "Read recent work-order history for one same-shop customer.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: ["canViewShopWideData", "canManageWorkOrders"],
  confirmation: "never",
  inputSchema: z.object({
    customerId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: RecordListSchema,
  async execute(input, context) {
    const customer = await assertCustomerInShop({
      customerId: input.customerId,
      shopId: context.actor.shopId,
      supabase: context.actor.supabase,
    });
    const { data, error } = await context.actor.supabase
      .from("work_orders")
      .select(
        "id, custom_id, status, vehicle_year, vehicle_make, vehicle_model, notes, created_at, updated_at",
      )
      .eq("shop_id", context.actor.shopId)
      .eq("customer_id", input.customerId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(input.limit);
    if (error) throw new Error(error.message);
    const records = (data ?? []).map((row) => ({
      id: row.id,
      type: "work_order" as const,
      label: row.custom_id
        ? `WO #${row.custom_id}`
        : `WO ${row.id.slice(0, 8)}`,
      status: row.status ?? null,
      detail:
        [row.vehicle_year, row.vehicle_make, row.vehicle_model, text(row.notes)]
          .filter(Boolean)
          .join(" • ") || null,
      updatedAt: row.updated_at ?? row.created_at ?? null,
      href: `/work-orders/${row.id}`,
    }));
    const customerName =
      text(customer.name) ??
      ([customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        "Customer");
    return {
      ok: true as const,
      records,
      summary: `${customerName} has ${records.length} recent work order(s) in this shop.`,
      href: `/customers/${input.customerId}`,
    };
  },
});

export const readVehicleHistoryTool = defineShopAssistantTool({
  name: "read_vehicle_history",
  domain: "customers",
  description: "Read recent work-order history for one same-shop vehicle.",
  mode: "read",
  risk: "low",
  requiredAnyCapabilities: ["canViewShopWideData", "canManageWorkOrders"],
  confirmation: "never",
  inputSchema: z.object({
    vehicleId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: RecordListSchema,
  async execute(input, context) {
    const vehicle = await assertVehicleInShop({
      vehicleId: input.vehicleId,
      shopId: context.actor.shopId,
      supabase: context.actor.supabase,
    });
    const { data, error } = await context.actor.supabase
      .from("work_orders")
      .select(
        "id, custom_id, status, customer_name, notes, created_at, updated_at",
      )
      .eq("shop_id", context.actor.shopId)
      .eq("vehicle_id", input.vehicleId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(input.limit);
    if (error) throw new Error(error.message);
    const records = (data ?? []).map((row) => ({
      id: row.id,
      type: "work_order" as const,
      label: row.custom_id
        ? `WO #${row.custom_id}`
        : `WO ${row.id.slice(0, 8)}`,
      status: row.status ?? null,
      detail:
        [row.customer_name, text(row.notes)].filter(Boolean).join(" • ") ||
        null,
      updatedAt: row.updated_at ?? row.created_at ?? null,
      href: `/work-orders/${row.id}`,
    }));
    const vehicleName = [vehicle.year, vehicle.make, vehicle.model]
      .filter(Boolean)
      .join(" ");
    return {
      ok: true as const,
      records,
      summary: `${vehicleName || "This vehicle"} has ${records.length} recent work order(s) in this shop.`,
      href: `/fleet/assets/${input.vehicleId}`,
    };
  },
});

export const searchPartsTool = defineShopAssistantTool({
  name: "search_parts",
  domain: "inventory",
  description:
    "Search same-shop parts by name, SKU, part number, manufacturer, or category.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageParts",
  confirmation: "never",
  inputSchema: z.object({
    query: z.string().trim().min(1).max(120),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: RecordListSchema,
  async execute(input, context) {
    const token = searchToken(input.query);
    if (!token)
      throw new ShopAssistantHttpError(400, "A part search is required.");
    const { data, error } = await context.actor.supabase
      .from("parts")
      .select(
        "id, name, sku, part_number, manufacturer, category, price, created_at",
      )
      .eq("shop_id", context.actor.shopId)
      .or(
        [
          `name.ilike.%${token}%`,
          `sku.ilike.%${token}%`,
          `part_number.ilike.%${token}%`,
          `manufacturer.ilike.%${token}%`,
          `category.ilike.%${token}%`,
        ].join(","),
      )
      .order("name", { ascending: true })
      .limit(input.limit);
    if (error) throw new Error(error.message);
    const records = (data ?? []).map((row) => ({
      id: row.id,
      type: "part" as const,
      label: row.name,
      status: row.category ?? null,
      detail:
        [row.sku, row.part_number, row.manufacturer, numberText(row.price, "$")]
          .filter(Boolean)
          .join(" • ") || null,
      updatedAt: row.created_at ?? null,
      href: `/parts/inventory?part=${encodeURIComponent(row.id)}`,
    }));
    return {
      ok: true as const,
      records,
      summary: `${records.length} part(s) matched “${input.query}”.`,
      href: "/parts/inventory",
    };
  },
});

export const listPartRequestsTool = defineShopAssistantTool({
  name: "list_part_requests",
  domain: "inventory",
  description: "List same-shop parts requests by status or work order.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageParts",
  confirmation: "never",
  inputSchema: z.object({
    status: z.string().trim().max(50).optional(),
    workOrderId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: RecordListSchema,
  async execute(input, context) {
    let query = context.actor.supabase
      .from("part_requests")
      .select("id, status, work_order_id, notes, created_at")
      .eq("shop_id", context.actor.shopId)
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (input.status) query = query.eq("status", input.status as never);
    if (input.workOrderId) query = query.eq("work_order_id", input.workOrderId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const records = (data ?? []).map((row) => ({
      id: row.id,
      type: "part_request" as const,
      label: `Parts request ${row.id.slice(0, 8)}`,
      status: row.status,
      detail: text(row.notes),
      updatedAt: row.created_at,
      href: `/parts/requests/${row.id}`,
    }));
    return {
      ok: true as const,
      records,
      summary: `${records.length} parts request(s) matched the requested filters.`,
      href: "/parts/requests",
    };
  },
});

export const listPurchaseOrdersTool = defineShopAssistantTool({
  name: "list_purchase_orders",
  domain: "inventory",
  description: "List same-shop purchase orders by status or work order.",
  mode: "read",
  risk: "low",
  requiredCapability: "canManageParts",
  confirmation: "never",
  inputSchema: z.object({
    status: z.string().trim().max(50).optional(),
    workOrderId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: RecordListSchema,
  async execute(input, context) {
    let query = context.actor.supabase
      .from("purchase_orders")
      .select(
        "id, po_number, status, work_order_id, expected_at, total, notes, created_at",
      )
      .eq("shop_id", context.actor.shopId)
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (input.status) query = query.eq("status", input.status);
    if (input.workOrderId) query = query.eq("work_order_id", input.workOrderId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const records = (data ?? []).map((row) => ({
      id: row.id,
      type: "purchase_order" as const,
      label: row.po_number ? `PO ${row.po_number}` : `PO ${row.id.slice(0, 8)}`,
      status: row.status,
      detail:
        [
          row.expected_at ? `Expected ${row.expected_at}` : null,
          numberText(row.total, "$"),
          text(row.notes),
        ]
          .filter(Boolean)
          .join(" • ") || null,
      updatedAt: row.created_at,
      href: `/parts/po/${row.id}`,
    }));
    return {
      ok: true as const,
      records,
      summary: `${records.length} purchase order(s) matched the requested filters.`,
      href: "/parts/po",
    };
  },
});

export const searchInvoicesTool = defineShopAssistantTool({
  name: "search_invoices",
  domain: "invoices",
  description:
    "Search or list same-shop invoices by invoice number, status, customer, work order, or date ordering.",
  mode: "read",
  risk: "low",
  allowedRoles: ["owner", "admin", "manager", "advisor", "service"],
  confirmation: "never",
  inputSchema: z.object({
    query: z.string().trim().max(120).optional(),
    status: z.string().trim().max(50).optional(),
    customerId: z.string().uuid().optional(),
    workOrderId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: RecordListSchema,
  async execute(input, context) {
    let query = context.actor.supabase
      .from("invoices")
      .select(
        "id, invoice_number, status, customer_id, work_order_id, total, outstanding_total, due_date, created_at, updated_at",
      )
      .eq("shop_id", context.actor.shopId)
      .order("updated_at", { ascending: false })
      .limit(input.limit);
    if (input.status) query = query.eq("status", input.status);
    if (input.customerId) query = query.eq("customer_id", input.customerId);
    if (input.workOrderId) query = query.eq("work_order_id", input.workOrderId);
    const token = searchToken(input.query);
    if (token) query = query.ilike("invoice_number", `%${token}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const records = (data ?? []).map((row) => ({
      id: row.id,
      type: "invoice" as const,
      label: row.invoice_number
        ? `Invoice ${row.invoice_number}`
        : `Invoice ${row.id.slice(0, 8)}`,
      status: row.status,
      detail:
        [
          numberText(row.total, "$"),
          numberText(row.outstanding_total, "$"),
          row.due_date ? `Due ${row.due_date}` : null,
        ]
          .filter(Boolean)
          .join(" • ") || null,
      updatedAt: row.updated_at ?? row.created_at,
      href: row.work_order_id
        ? `/work-orders/invoice/${row.work_order_id}`
        : "/billing",
    }));
    return {
      ok: true as const,
      records,
      summary: `${records.length} invoice(s) matched the requested filters.`,
      href: "/billing",
    };
  },
});
